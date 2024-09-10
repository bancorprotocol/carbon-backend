import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlDto } from '../v1/analytics/tvl.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';
import moment from 'moment';

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

  async getTvl(deployment: Deployment, params: TvlDto): Promise<any[]> {
    // Prepare start and end dates
    const start = params.start
      ? moment.utc(params.start * 1000).format('YYYY-MM-DD HH:mm:ss')
      : moment.utc().subtract(7, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');

    const end = params.end
      ? moment.utc(params.end * 1000).format('YYYY-MM-DD HH:mm:ss')
      : moment.utc().format('YYYY-MM-DD HH:mm:ss');

    const HARD_LIMIT = 1000;
    const limit = Math.min(params.limit, HARD_LIMIT) || HARD_LIMIT;
    const offset = params.offset || 0;

    // Determine the column to group by based on params.groupBy for TVL query
    const groupByColumn = params.groupBy === GroupBy.PAIR ? 'pairId' : 'address';

    // TVL Query with dynamic grouping, now using stored tvlUsd and grouping by address or pair
    const tvlQuery = `
        SELECT
            time_bucket_gapfill('1 day', tvl.evt_block_time, '${start}', '${end}') AS day,
            tvl."${groupByColumn}",
            ${params.groupBy === GroupBy.PAIR ? 'tvl."pairName", tvl."pairId",' : ''}
            ${params.groupBy === GroupBy.ADDRESS ? 'locf(avg(tvl.tvl::numeric)) AS tvl, symbol,' : ''}
            locf(avg(tvl."tvlUsd"::numeric)) AS "tvlUsd"
        FROM tvl
        WHERE
            tvl."blockchainType" = '${deployment.blockchainType}'
            AND tvl."exchangeId" = '${deployment.exchangeId}'
            AND tvl.evt_block_time <= '${end}'
        GROUP BY tvl."${groupByColumn}", day ${
      params.groupBy === GroupBy.PAIR ? ', tvl."pairName", tvl."pairId"' : ', tvl."symbol"'
    }
        ORDER BY day, tvl."${groupByColumn}"
        LIMIT ${limit} OFFSET ${offset};
    `;

    // Execute the TVL query to get results grouped by address or pair
    const tvlResults = await this.dataSource.query(tvlQuery);

    if (tvlResults.length === 0) {
      return [];
    }

    // Prepare the final result, already including tvlUsd from the query
    const combinedResults = tvlResults.map((tvlRow) => {
      const result: any = {
        day: tvlRow.day,
        chainId: deployment.exchangeId,
        tvlUsd: tvlRow.tvlUsd,
      };

      // Include tvl if grouped by ADDRESS
      if (params.groupBy === GroupBy.ADDRESS) {
        result.tvl = tvlRow.tvl;
        result.address = tvlRow.address;
        result.symbol = tvlRow.symbol;
      }

      // Include pairName and pairId if grouped by PAIR
      if (params.groupBy === GroupBy.PAIR) {
        result.pair = tvlRow.pairName;
        result.pairId = tvlRow.pairId;
      }

      return result;
    });

    return combinedResults;
  }

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

    // Fetch USD rates for all unique addresses in result
    if (firstDate && lastDate) {
      const uniqueAddresses = Array.from(new Set(result.map((row) => `'${row.address}'`))).join(',');
      const usdQuery = `
        SELECT
          time_bucket_gapfill('1 day', hq.timestamp, '${firstDate}', '${lastDate}') AS day,
          hq."tokenAddress" AS address,
          locf(last(hq.usd::numeric, hq.timestamp)) AS usd
        FROM "historic-quotes" hq
        WHERE
          hq."blockchainType" = '${deployment.blockchainType}'
          AND hq."tokenAddress" IN (${uniqueAddresses})
          AND hq.timestamp <= '${lastDate}'
        GROUP BY hq."tokenAddress", day
        ORDER BY day, hq."tokenAddress";
      `;

      const usdResults = await this.dataSource.query(usdQuery);

      // Map USD rates for easy lookup
      const usdMap = new Map<string, number>();
      usdResults.forEach((usdRow) => {
        const day = moment(usdRow.day).format('YYYY-MM-DD'); // Ensure date is formatted as 'YYYY-MM-DD'
        usdMap.set(`${day}-${usdRow.address}`, parseFloat(usdRow.usd) || 0);
      });

      // Process the batches and store with USD rates
      for (let i = 0; i < result.length; i += batchSize) {
        const batch = result.slice(i, i + batchSize).map((record) => {
          const day = moment(record.evt_block_time).format('YYYY-MM-DD');
          const address = record.address.toLowerCase();
          const usdRate = usdMap.get(`${day}-${address}`) || 0;
          const tvlUsd = parseFloat(record.tvl) * usdRate;

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
            usdRate: usdRate.toString(),
            tvlUsd: tvlUsd.toString(),
          };
        });

        await this.tvlRepository.save(batch);
      }
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }
}
