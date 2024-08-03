import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Volume } from './volume.entity';
import { VolumeDto } from '../v1/analytics/volume.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';

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

  async update(endBlock: number): Promise<void> {
    const startBlock = (await this.lastProcessedBlockService.get('volume')) || 1;

    // Query to get the volume data
    const query = `-- Include the previous state up to the start block
WITH previous_state AS (
  SELECT *
  FROM volume_fee_usd
  WHERE block_number <= ${startBlock}
  ORDER BY block_number DESC, sorting_order DESC
  LIMIT 1
),
-- Main query for the specified block range
main_query AS (
  ${this.getVolumeQuery(startBlock, endBlock)}
)
-- Combine the previous state with the main query
SELECT * FROM previous_state
UNION ALL
SELECT * FROM main_query
ORDER BY block_number, sorting_order`;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
        timestamp: record.timestamp,
        feeSymbol: record.feesymbol,
        feeAddress: record.feeAddress,
        tradingFeeAmountReal: record.tradingFeeAmount_real,
        tradingFeeAmountUsd: record.tradingFeeAmount_usd,
        targetSymbol: record.targetsymbol,
        targetAddress: record.targetAddress,
        targetAmountReal: record.targetamount_real,
        targetAmountUsd: record.targetamount_usd,
      }));
      await this.volumeRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update('volume', endBlock); // Uncomment if needed
  }

  private getVolumeQuery(startBlock: number, endBlock: number): string {
    return `-- Your complex query here
WITH tokens_traded_with_token_info AS (
    SELECT
        tte."timestamp" AS timestamp,
        tte."transactionHash" AS transactionHash,
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
        tt."decimals" AS targetDecimals
    FROM
        "tokens-traded-events" tte
        JOIN tokens ts ON tte."sourceTokenId" = ts."id"
        JOIN tokens tt ON tte."targetTokenId" = tt."id"
    WHERE
        tte."blockId" > ${startBlock} AND tte."blockId" <= ${endBlock}
),
correct_fee_units AS (
    SELECT
        trader,
        timestamp,
        targetSymbol,
        targetAddress,
        targetDecimals,
        targetTokenId,
        targetAmount :: NUMERIC,
        tradingFeeAmount :: NUMERIC,
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
        trader,
        feeSymbol,
        LOWER(feeAddress) AS feeAddress,
        tradingFeeAmount / POWER(10, feeDecimals) AS tradingFeeAmount_real,
        targetSymbol,
        LOWER(targetAddress) AS targetAddress,
        targetAmount / POWER(10, targetDecimals) AS targetAmount_real,
        DATE_TRUNC('day', timestamp) AS evt_day
    FROM
        correct_fee_units
),
prices AS (
    SELECT
        LOWER("tokenAddress") AS tokenAddress,
        MAX("usd" :: NUMERIC) AS max_usd,
        DATE_TRUNC('day', "timestamp") AS timestamp_day
    FROM
        "historic-quotes"
    GROUP BY
        "tokenAddress",
        DATE_TRUNC('day', "timestamp")
),
fee_usd AS (
    SELECT
        fvwd.*,
        COALESCE(pr.max_usd, 0) AS fee_usd,
        COALESCE(pr.max_usd * tradingFeeAmount_real, 0) AS tradingFeeAmount_usd
    FROM
        fee_volume_wo_decimals fvwd
        LEFT JOIN prices pr ON fvwd.feeAddress = pr.tokenAddress
        AND fvwd.evt_day = pr.timestamp_day
),
volume_fee_usd AS (
    SELECT
        fu.*,
        COALESCE(pr.max_usd, 0) AS target_usd,
        COALESCE(pr.max_usd * targetAmount_real, 0) AS targetAmount_usd
    FROM
        fee_usd fu
        LEFT JOIN prices pr ON fu.targetAddress = pr.tokenAddress
        AND fu.evt_day = pr.timestamp_day
)
SELECT
    timestamp,
    feesymbol,
    feeAddress,
    tradingFeeAmount_real,
    tradingFeeAmount_usd,
    targetsymbol,
    targetAddress,
    targetamount_real,
    targetamount_usd,
    "blockId" AS block_number
FROM
    volume_fee_usd
ORDER BY
    timestamp`;
  }
}
