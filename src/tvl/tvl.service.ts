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
    const groupByColumn = params.groupBy || GroupBy.ADDRESS;

    // TVL Query with dynamic grouping
    const tvlQuery = `
        SELECT *
        FROM (
        SELECT
            time_bucket_gapfill('1 day', tvl.evt_block_time, '${start}', '${end}') AS day,
            tvl.${groupByColumn},
            locf(avg(tvl.tvl::numeric)) AS tvl
        FROM tvl
        WHERE
            tvl."blockchainType" = '${deployment.blockchainType}'
            AND tvl."exchangeId" = '${deployment.exchangeId}'
            AND tvl.evt_block_time <= '${end}'
        GROUP BY tvl.${groupByColumn}, day
        ORDER BY day, tvl.${groupByColumn}
        ) AS subquery
        WHERE subquery.day BETWEEN '${start}' AND '${end}'
        ORDER BY subquery.day, subquery.${groupByColumn}
        LIMIT ${limit} OFFSET ${offset};
    `;

    // Execute the TVL query first to get unique addresses
    const tvlResults = await this.dataSource.query(tvlQuery);

    if (tvlResults.length === 0) {
      return [];
    }

    // Extract unique addresses from the TVL results
    const uniqueAddresses = Array.from(new Set(tvlResults.map((row) => `'${row.address}'`))).join(',');

    // Calculate the start and end dates for the USD query
    const firstDate = tvlResults.length > 0 ? moment(tvlResults[0].day).format('YYYY-MM-DD HH:mm:ss') : start;
    const lastDate =
      tvlResults.length > 0 ? moment(tvlResults[tvlResults.length - 1].day).format('YYYY-MM-DD HH:mm:ss') : end;

    // USD Query always grouped by address, with dynamically generated addresses list
    const extraGap = moment.utc(firstDate).subtract(3, 'months').format('YYYY-MM-DD HH:mm:ss');

    const usdQuery = `
      SELECT *
      FROM (
        SELECT
          time_bucket_gapfill('1 day', hq.timestamp, '${firstDate}', '${lastDate}') AS day,
          hq."tokenAddress" AS address,
          locf(last(hq.usd::numeric, hq.timestamp)) AS usd
        FROM "historic-quotes" hq
        WHERE
          hq."blockchainType" = '${deployment.blockchainType}'
          AND hq."tokenAddress" IN (${uniqueAddresses})
          AND hq.timestamp <= '${lastDate}'
          AND hq.timestamp >= '${extraGap}'
        GROUP BY hq."tokenAddress", day
        ORDER BY day, hq."tokenAddress"
      ) AS subquery
      WHERE subquery.day BETWEEN '${firstDate}' AND '${lastDate}'
      ORDER BY subquery.day, subquery.address;
    `;

    // Execute the USD query after TVL query to filter by addresses from TVL results
    const usdResults = await this.dataSource.query(usdQuery);

    // Combine TVL and USD results based on day and address
    const usdMap = new Map<string, string>();

    usdResults.forEach((usdRow) => {
      const key = `${usdRow.day}-${usdRow.address}`;
      if (!usdRow.usd) {
        usdMap.set(key, '0');
      } else {
        usdMap.set(key, usdRow.usd.toString());
      }
    });

    // Calculate the TVL in USD and prepare the final result
    const combinedResults = tvlResults.map((tvlRow) => {
      const key = `${tvlRow.day}-${tvlRow.address}`;
      const usdValue = usdMap.get(key) || '0';
      const tvlUsd = (parseFloat(tvlRow.tvl) * parseFloat(usdValue)).toString();

      return {
        day: tvlRow.day,
        blockchainType: tvlRow.blockchainType,
        exchangeId: tvlRow.exchangeId,
        [groupByColumn]: tvlRow[groupByColumn],
        tvl: tvlRow.tvl,
        usdRate: usdValue,
        tvlUsd: tvlUsd,
      };
    });

    return combinedResults;
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`)) || 1;

    // Query to get the TVL data
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
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
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
      }));
      await this.tvlRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }
}
