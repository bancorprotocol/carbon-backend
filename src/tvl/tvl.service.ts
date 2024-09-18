import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlTokensDto } from '../v1/analytics/tvl.tokens.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';
import moment from 'moment';
import Decimal from 'decimal.js';
import { PairsDictionary } from '../pair/pair.service';

export enum GroupBy {
  ADDRESS = 'address',
  PAIR = 'pair',
}

@Injectable()
export class TvlService {
  constructor(
    @InjectRepository(Tvl)
    private tvlRepository: Repository<Tvl>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`)) || 1;

    const query = `
      WITH strategy_created AS (
      SELECT
          0 AS transaction_index,
          timestamp AS evt_block_time,
          sce."blockId" AS evt_block_number,
          sce."strategyId" AS strategyId,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          2 AS reason,
          sce."pairId" AS pairId,
          ps."name" AS pairName
      FROM
          "strategy-created-events" sce
          LEFT JOIN tokens t0 ON t0.id = sce."token0Id"
          LEFT JOIN tokens t1 ON t1.id = sce."token1Id"
          LEFT JOIN pairs ps ON ps.id = sce."pairId"
      WHERE
          sce."exchangeId" = '${deployment.exchangeId}'
      ),
      strategy_updated AS (
      SELECT
          sue.id AS transaction_index,
          timestamp AS evt_block_time,
          sue."blockId" AS evt_block_number,
          sue."strategyId" AS strategyId,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          reason,
          sue."pairId" AS pairId,
          ps."name" AS pairName
      FROM
          "strategy-updated-events" sue
          LEFT JOIN tokens t0 ON t0.id = sue."token0Id"
          LEFT JOIN tokens t1 ON t1.id = sue."token1Id"
          LEFT JOIN pairs ps ON ps."id" = sue."pairId"
      WHERE
          sue."exchangeId" = '${deployment.exchangeId}'         
      ),
      strategy_deleted AS (
      SELECT
          99999999999 AS transaction_index,
          timestamp AS evt_block_time,
          sde."blockId" AS evt_block_number,
          sde."strategyId" AS strategyId,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          4 AS reason,
          sde."pairId" AS pairId,
          ps."name" AS pairName
      FROM
          "strategy-deleted-events" sde
          LEFT JOIN tokens t0 ON t0.id = sde."token0Id"
          LEFT JOIN tokens t1 ON t1.id = sde."token1Id"
          LEFT JOIN pairs ps ON ps."id" = sde."pairId"
      WHERE
          sde."exchangeId" = '${deployment.exchangeId}'
      ),
      all_txs AS (
      SELECT
          *
      FROM
          strategy_created
      UNION
      ALL
      SELECT
          *
      FROM
          strategy_updated
      UNION
      ALL
      SELECT
          *
      FROM
          strategy_deleted
      ),
      recent_txs AS (
      SELECT
          *
      FROM
          all_txs
      WHERE
          evt_block_number > ${startBlock} 
      ),
      
      orders_with_y_and_day AS (
      SELECT
          evt_block_number,
          evt_block_time,
          transaction_index,
          DATE_TRUNC('day', evt_block_time) AS evt_day,
          token0,
          strategyId,
          symbol0,
          decimals0,
          token1,
          symbol1,
          decimals1,
          reason,
          pairName,
          pairId,
          COALESCE((order0 :: json ->> 'y') :: double precision, 0) AS y0,
          COALESCE((order1 :: json ->> 'y') :: double precision, 0) AS y1
      FROM
          recent_txs
      ),
      split_orders AS (
      SELECT
          evt_block_time,
          transaction_index,
          evt_day,
          evt_block_number,
          strategyId,
          pairName,
          pairId,
          reason,
          LOWER(token0) AS address,
          symbol0 AS symbol,
          decimals0 AS decimals,
          y0 AS y
      FROM
          orders_with_y_and_day
      UNION
      ALL
      SELECT
          evt_block_time,
          transaction_index,
          evt_day,
          evt_block_number,
          strategyId,
          pairName,
          pairId,
          reason,
          LOWER(token1) AS address,
          symbol1 AS symbol,
          decimals1 AS decimals,
          y1 AS y
      FROM
          orders_with_y_and_day
      ),
      orders_with_tvl AS (
      SELECT
          *,
          (
              CASE
                  WHEN reason = 4 THEN 0 
                  ELSE y
              END
          ) / POW(10, decimals) AS tvl
      FROM
          split_orders
      ),
      start_date_from_blocks AS (
      SELECT
          COALESCE(
              (
                  SELECT
                      DATE_TRUNC('day', timestamp)
                  FROM
                      "blocks"
                  WHERE
                      id <= ${startBlock} 
                  ORDER BY
                      id DESC
                  LIMIT
                      1
              ), TO_DATE('1970-01-01', 'YYYY-MM-DD')
          ) AS timestamp
      ),
      tvl AS (
      SELECT
          *
      FROM
          orders_with_tvl
      WHERE
          evt_block_time >= (
              SELECT
                  timestamp
              FROM
                  start_date_from_blocks
              LIMIT
                  1
          )
      ORDER BY
          evt_block_time
      )
      SELECT
      evt_block_time,
      evt_block_number,
      evt_day,
      transaction_index,
      strategyId,
      pairName,
      pairId,
      reason,
      address,
      symbol,
      tvl
      FROM
      tvl
      ORDER BY
      evt_block_time,
      transaction_index,
      address
      `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;

    // Get the range of block time from TVL result to fetch relevant USD rates
    const firstDate = result.length > 0 ? moment(result[0].evt_block_time).format('YYYY-MM-DD HH:mm:ss') : null;
    const lastDate =
      result.length > 0 ? moment(result[result.length - 1].evt_block_time).format('YYYY-MM-DD HH:mm:ss') : null;

    if (firstDate && lastDate) {
      // Process the batches and store with USD rates
      for (let i = 0; i < result.length; i += batchSize) {
        const batch = result.slice(i, i + batchSize).map((record) => {
          return {
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
            strategyId: record.strategyid,
            pairName: record.pairname,
            pairId: record.pairid,
            symbol: record.symbol,
            tvl: record.tvl,
            evt_block_time: record.evt_block_time,
            address: record.address,
            reason: record.reason,
            evt_block_number: record.evt_block_number,
            transaction_index: record.transaction_index,
          };
        });

        await this.tvlRepository.save(batch);
      }
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }

  private async generateTvlByAddress(deployment: Deployment, params: TvlTokensDto): Promise<any[]> {
    const { addresses: _addresses } = params;

    // Ensure the address is an array and convert it to lowercase
    const addresses = _addresses.map((addr) => addr.toLowerCase());

    // Format start and end using moment.js to the required timestamp format
    const startFormatted = moment.unix(params.start).format('YYYY-MM-DD');
    const endFormatted = moment.unix(params.end).add(1, 'day').format('YYYY-MM-DD');

    const query = `
      WITH gapfilled_tvl AS (
        SELECT 
          time_bucket_gapfill('1 day', "evt_block_time", '${startFormatted}', '${endFormatted}') AS "timestam",
          address,
          symbol,
          locf(LAST("tvl"::decimal, "evt_block_time")) AS "daily_tvl",
          "strategyId"
        FROM 
          tvl
        WHERE 
          address IN (${addresses.map((addr) => `'${addr}'`).join(', ')})
          AND "exchangeId" = '${deployment.exchangeId}'
          AND "blockchainType" = '${deployment.blockchainType}'
        GROUP BY 
          address,
          timestam,
          symbol,
          "strategyId"          
        ORDER BY 
          "timestam" ASC
      )
      SELECT
        "timestam",
        address,
        symbol,
        SUM("daily_tvl")::decimal AS total_daily_tvl
      FROM 
        gapfilled_tvl
      WHERE 
        "timestam" >= '${startFormatted}'
      GROUP BY 
        "timestam", address, symbol
      ORDER BY 
        "timestam" ASC
      OFFSET ${params.offset} LIMIT ${params.limit};
    `;

    // Execute the query using the data source
    const result = await this.dataSource.query(query);

    // Format the output as requested using moment.js
    const formattedResult = result.map((row) => ({
      day: moment.utc(row.timestam).unix(),
      tvl: parseFloat(row.total_daily_tvl),
      address: row.address,
      symbol: row.symbol,
    }));

    return formattedResult;
  }

  async getUsdRates(deployment: Deployment, addresses: string[], start: string, end: string): Promise<any[]> {
    const query = `
      SELECT
        time_bucket_gapfill('1 day', timestamp, '${start}', '${end}') AS day,
        "tokenAddress" AS address,
        locf(avg("usd"::numeric)) AS usd  
      FROM "historic-quotes"
      WHERE
        "blockchainType" = '${deployment.blockchainType}'
        AND "tokenAddress" IN (${addresses.map((address) => `'${address.toLowerCase()}'`).join(',')})
      GROUP BY "tokenAddress", day;
    `;

    const result = await this.dataSource.query(query);

    return result.map((row) => ({
      day: moment.utc(row.day).unix(),
      address: row.address.toLowerCase(),
      usd: parseFloat(row.usd),
    }));
  }

  async getTvlByAddress(deployment: Deployment, params: TvlTokensDto): Promise<any[]> {
    const start = params.start ?? moment().subtract(1, 'year').unix();
    const end = params.end ?? moment().unix();
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 10000;
    const updatedParams = { ...params, start, end, offset, limit };

    // Format start and end to the required timestamp string format
    const startFormatted = moment.unix(start).format('YYYY-MM-DD HH:mm:ss');
    const endFormatted = moment.unix(end).format('YYYY-MM-DD HH:mm:ss');

    // Use Promise.all to run both methods concurrently
    const [tvlData, usdRates] = await Promise.all([
      this.generateTvlByAddress(deployment, updatedParams),
      this.getUsdRates(deployment, updatedParams.addresses, startFormatted, endFormatted), // Use the formatted start/end
    ]);

    // Combine TVL data with USD rates
    const combinedResult = tvlData.map((tvlEntry) => {
      const usdRate = usdRates.find(
        (usdEntry) => usdEntry.day === tvlEntry.day && usdEntry.address === tvlEntry.address,
      );
      const tvlUsd = usdRate ? new Decimal(tvlEntry.tvl).mul(new Decimal(usdRate.usd)).toNumber() : null;
      return {
        ...tvlEntry,
        tvlUsd,
      };
    });

    return combinedResult;
  }

  async getTvlByPair(deployment: Deployment, params: TvlTokensDto, pairs: PairsDictionary): Promise<any[]> {
    const start = params.start ?? moment().subtract(1, 'year').unix();
    const end = params.end ?? moment().unix();
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 10000;
    const updatedParams = { ...params, start, end, offset, limit };

    // Format start and end to the required timestamp string format
    const startFormatted = moment.unix(start).format('YYYY-MM-DD HH:mm:ss');
    const endFormatted = moment.unix(end).format('YYYY-MM-DD HH:mm:ss');

    // Use Promise.all to run both methods concurrently
    const [tvlData, usdRates] = await Promise.all([
      this.generateTvlByAddress(deployment, updatedParams),
      this.getUsdRates(deployment, updatedParams.addresses, startFormatted, endFormatted), // Use the formatted start/end
    ]);

    // Combine TVL data with USD rates
    const combinedResult = tvlData.map((tvlEntry) => {
      const usdRate = usdRates.find(
        (usdEntry) => usdEntry.day === tvlEntry.day && usdEntry.address === tvlEntry.address,
      );
      const tvlUsd = usdRate ? new Decimal(tvlEntry.tvl).mul(new Decimal(usdRate.usd)).toNumber() : null;
      return {
        ...tvlEntry,
        tvlUsd,
      };
    });

    return combinedResult;
  }
}
