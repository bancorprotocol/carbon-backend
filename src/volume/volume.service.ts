import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Volume } from './volume.entity';
import { VolumeDto } from '../v1/analytics/volume.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment } from '../deployment/deployment.service';

@Injectable()
export class VolumeService {
  constructor(
    @InjectRepository(Volume)
    private volumeRepository: Repository<Volume>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async getVolume(params: VolumeDto): Promise<Volume[]> {
    const queryBuilder = this.volumeRepository.createQueryBuilder('volume');

    if (params.start) {
      queryBuilder.andWhere('volume.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      queryBuilder.andWhere('volume.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    queryBuilder.orderBy('volume.timestamp', 'DESC');

    const limit = params.limit || 10000; // Default limit of 10,000

    if (limit) {
      queryBuilder.take(limit);
    }

    if ('offset' in params && params.offset) {
      queryBuilder.skip(params.offset);
    }

    return queryBuilder.getMany();
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-volume`)) || 1;

    // Query to get the volume data
    const query = `
      WITH tokens_traded_within_interval AS (
    SELECT
        *
    FROM
        "tokens-traded-events"
    WHERE
        "blockId" > ${startBlock}
        AND "exchangeId" = '${deployment.exchangeId}'
),
tokens_traded_with_token_info AS (
    SELECT
        tte."id" AS transactionIndex,
        tte."timestamp" AS timestamp,
        tte."blockId" AS blockId,
        tte."trader" AS trader,
        tte."byTargetAmount" AS byTargetAmount,
        tte."sourceTokenId" AS sourceTokenId,
        tte."targetTokenId" AS targetTokenId,
        tte."sourceAmount" AS sourceAmount,
        tte."targetAmount" AS targetAmount,
        tte."tradingFeeAmount" AS tradingFeeAmount,
        ts."address" AS sourceAddress,
        ts."symbol" AS sourceSymbol,
        ts."decimals" AS sourceDecimals,
        tt."address" AS targetAddress,
        tt."symbol" AS targetSymbol,
        tt."decimals" AS targetDecimals,
        tte."pairId" AS pairId,
        ps."name" AS pairName
    FROM
        tokens_traded_within_interval tte
        JOIN tokens ts ON tte."sourceTokenId" = ts."id"
        JOIN tokens tt ON tte."targetTokenId" = tt."id"
        JOIN pairs ps ON tte."pairId" = ps."id"
),
correct_fee_units AS (
    SELECT
        trader,
        timestamp,
        blockId,
        transactionIndex,
        targetSymbol,
        targetAddress,
        targetDecimals,
        targetTokenId,
        targetAmount :: NUMERIC,
        tradingFeeAmount :: NUMERIC,
        pairName,
        pairId,
        CASE
            WHEN byTargetAmount = TRUE THEN sourceSymbol
            ELSE targetSymbol
        END AS feeSymbol,
        CASE
            WHEN byTargetAmount = TRUE THEN sourceAddress
            ELSE targetAddress
        END AS feeAddress,
        CASE
            WHEN byTargetAmount = TRUE THEN sourceDecimals
            ELSE targetDecimals
        END AS feeDecimals
    FROM
        tokens_traded_with_token_info
),
fee_volume_wo_decimals AS (
    SELECT
        timestamp,
        blockId,
        transactionIndex,
        trader,
        feeSymbol,
        LOWER(feeAddress) AS feeAddress,
        tradingFeeAmount / POWER(10, feeDecimals) AS tradingFeeAmount_real,
        targetSymbol,
        LOWER(targetAddress) AS targetAddress,
        targetAmount / POWER(10, targetDecimals) AS targetAmount_real,
        DATE_TRUNC('day', timestamp) AS evt_day,
        pairName,
        pairId
    FROM
        correct_fee_units
),
fee_usd AS (
    SELECT
        fvwd.*,
        hq.usd :: NUMERIC AS fee_usd,
        COALESCE(hq.usd :: NUMERIC * tradingFeeAmount_real, 0) AS tradingFeeAmount_usd
    FROM
        fee_volume_wo_decimals fvwd
        LEFT JOIN LATERAL(
            SELECT
                usd
            FROM
                "historic-quotes"
            WHERE
                "tokenAddress" = fvwd.feeAddress
                AND timestamp <= fvwd.timestamp + INTERVAL '1 day'
            ORDER BY
                timestamp DESC
            LIMIT
                1
        ) hq ON TRUE
),
volume_rows_to_add AS (
    SELECT
        fu.*,
        hq.usd :: NUMERIC AS target_usd,
        COALESCE(hq.usd :: NUMERIC * targetAmount_real, 0) AS targetAmount_usd
    FROM
        fee_usd fu
        LEFT JOIN LATERAL(
            SELECT
                usd
            FROM
                "historic-quotes"
            WHERE
                "tokenAddress" = fu.targetAddress
                AND timestamp <= fu.timestamp + INTERVAL '1 day'
            ORDER BY
                timestamp DESC
            LIMIT
                1
        ) hq ON TRUE
)
SELECT
    timestamp,
    blockId,
    transactionIndex,
    trader,
    pairName,
    pairId,
    feeSymbol,
    feeAddress,
    tradingFeeAmount_real,
    fee_usd,
    targetSymbol,
    targetAddress,
    targetAmount_real,
    targetamount_usd
FROM
    volume_rows_to_add
ORDER BY
    timestamp
    `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        timestamp: record.timestamp,
        feeSymbol: record.feesymbol,
        feeAddress: record.feeaddress,
        tradingFeeAmountReal: record.tradingfeeamount_real,
        tradingFeeAmountUsd: record.fee_usd,
        targetSymbol: record.targetsymbol,
        targetAddress: record.targetaddress,
        targetAmountReal: record.targetamount_real,
        targetAmountUsd: record.targetamount_usd,
        transactionIndex: record.transactionindex,
        blockNumber: record.blockid,
        pairId: record.pairid,
        trader: record.trader,
      }));
      await this.volumeRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(
      `${deployment.blockchainType}-${deployment.exchangeId}-volume`,
      endBlock,
    );
  }
}
