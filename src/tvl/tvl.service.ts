import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlDto } from '../v1/analytics/tvl.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';

@Injectable()
export class TvlService {
  constructor(
    @InjectRepository(Tvl)
    private tvlRepository: Repository<Tvl>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async getTvl(params: TvlDto): Promise<Tvl[]> {
    const queryBuilder = this.tvlRepository.createQueryBuilder('tvl');

    if (params.start) {
      queryBuilder.andWhere('tvl.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      queryBuilder.andWhere('tvl.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    queryBuilder.orderBy('tvl.timestamp', 'DESC');

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
    const startBlock = (await this.lastProcessedBlockService.get('tvl')) || 1;

    // Query to get the TVL data
    const query = `-- Include the previous state up to the start block
WITH previous_state AS (
  SELECT *
  FROM tvl_data
  WHERE block_number <= ${startBlock}
  ORDER BY block_number DESC, sorting_order DESC
  LIMIT 1
),
-- Main query for the specified block range
main_query AS (
  ${this.getTvlQuery(startBlock, endBlock)}
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
        symbol: record.symbol,
        deltaLiquidityReal: record.delta_liquidity_real,
        deltaLiquidityUsd: record.delta_liquidity_usd,
        blockNumber: record.block_number,
      }));
      await this.tvlRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update('tvl', endBlock);
  }

  private getTvlQuery(startBlock: number, endBlock: number): string {
    return `-- Your complex query here
WITH created AS (
    SELECT
        timestamp AS evt_block_time,
        "blockId" AS evt_block_number,
        sce.id AS id,
        order0,
        order1,
        t0.address AS token0,
        t0.symbol AS symbol0,
        t0.decimals AS decimals0,
        t1.address AS token1,
        t1.symbol AS symbol1,
        t1.decimals AS decimals1,
        2 AS reason
    FROM
        "strategy-created-events" sce
        LEFT JOIN tokens t0 ON t0.id = sce."token0Id"
        LEFT JOIN tokens t1 ON t1.id = sce."token1Id"
    WHERE
        sce."blockId" > ${startBlock} AND sce."blockId" <= ${endBlock}
),
updated AS (
    SELECT
        timestamp AS evt_block_time,
        "blockId" AS evt_block_number,
        s."strategyId" AS id,
        order0,
        order1,
        t0.address AS token0,
        t0.symbol AS symbol0,
        t0.decimals AS decimals0,
        t1.address AS token1,
        t1.symbol AS symbol1,
        t1.decimals AS decimals1,
        reason
    FROM
        "strategy-updated-events" s
        LEFT JOIN tokens t0 ON t0.id = s."token0Id"
        LEFT JOIN tokens t1 ON t1.id = s."token1Id"
    WHERE
        s."blockId" > ${startBlock} AND s."blockId" <= ${endBlock}
),
deleted AS (
    SELECT
        timestamp AS evt_block_time,
        "blockId" AS evt_block_number,
        sce."strategyId" AS id,
        order0,
        order1,
        t0.address AS token0,
        t0.symbol AS symbol0,
        t0.decimals AS decimals0,
        t1.address AS token1,
        t1.symbol AS symbol1,
        t1.decimals AS decimals1,
        4 AS reason
    FROM
        "strategy-deleted-events" sce
        LEFT JOIN tokens t0 ON t0.id = sce."token0Id"
        LEFT JOIN tokens t1 ON t1.id = sce."token1Id"
    WHERE
        sce."blockId" > ${startBlock} AND sce."blockId" <= ${endBlock}
),
all_txs AS (
    SELECT
        *
    FROM
        created
    UNION
    SELECT
        *
    FROM
        updated
    UNION
    SELECT
        *
    FROM
        deleted
),
orders_with_y AS (
    SELECT
        *,
        (
            CASE
                WHEN (order0 :: json ->> 'y') IS NOT NULL THEN (order0 :: json ->> 'y') :: double precision
                ELSE 0
            END
        ) AS y0,
        (
            CASE
                WHEN (order1 :: json ->> 'y') IS NOT NULL THEN (order1 :: json ->> 'y') :: double precision
                ELSE 0
            END
        ) AS y1
    FROM
        all_txs
),
orders_with_day AS (
    SELECT
        evt_block_time,
        evt_block_number,
        id,
        reason,
        token0,
        symbol0,
        decimals0,
        y0,
        token1,
        symbol1,
        decimals1,
        y1,
        DATE_TRUNC('day', evt_block_time) AS evt_day
    FROM
        orders_with_y
),
split_orders AS (
    SELECT
        evt_block_time,
        evt_day,
        evt_block_number,
        id,
        reason,
        token0 AS address,
        symbol0 AS symbol,
        decimals0 AS decimals,
        y0 AS y
    FROM
        orders_with_day
    UNION
    ALL
    SELECT
        evt_block_time,
        evt_day,
        evt_block_number,
        id,
        reason,
        token1 AS address,
        symbol1 AS symbol,
        decimals1 AS decimals,
        y1 AS y
    FROM
        orders_with_day
),
orders_with_delta_y AS (
    SELECT
        *,
        COALESCE(
            (
                CASE
                    WHEN reason = 2 THEN y -- created
                    WHEN reason = 4 THEN - y -- deleted
                    ELSE y - LAG(y, 1) OVER (
                        -- updated
                        PARTITION BY id,
                        address
                        ORDER BY
                            evt_block_number
                    )
                END
            ) / POW(10, decimals),
            0
        ) AS y_delta
    FROM
        split_orders
),
liquidity AS (
    SELECT
        *,
        SUM(y_delta) OVER (
            PARTITION BY address
            ORDER BY
                evt_block_number
        ) AS liquidity_real
    FROM
        orders_with_delta_y
),
symbol_dates AS (
    SELECT
        symbol,
        address,
        MIN(evt_day) AS first_appearance
    FROM
        liquidity
    GROUP BY
        symbol,
        address
),
forwarded_dates AS (
    SELECT
        symbol,
        address,
        first_appearance,
        generate_series(first_appearance, CURRENT_DATE, INTERVAL '1 day') AS evt_block_time
    FROM
        symbol_dates
),
missing_dates AS (
    SELECT
        *
    FROM
        forwarded_dates fd
    WHERE
        NOT EXISTS (
            SELECT
                1
            FROM
                liquidity l
            WHERE
                fd.address = l.address
                AND fd.symbol = l.symbol
                AND fd.evt_block_time = l.evt_day
        )
),
forwarded_liquidity AS (
    SELECT
        evt_block_time,
        evt_block_time AS evt_day,
        0 AS evt_block_number,
        CAST(0 AS VARCHAR) AS id,
        5 AS reason,
        LOWER(address) AS address,
        symbol,
        0 AS y,
        0 AS y_delta,
        (
            SELECT
                l.liquidity_real
            FROM
                liquidity l
            WHERE
                l.address = md.address
                AND l.evt_block_time <= md.evt_block_time
            ORDER BY
                l.evt_block_time DESC
            LIMIT
                1
        ) AS liquidity_real
    FROM
        missing_dates md
    UNION
    SELECT
        evt_block_time,
        evt_day,
        evt_block_number,
        liquidity.id,
        reason,
        LOWER(address) AS address,
        symbol,
        y,
        y_delta,
        liquidity_real
    FROM
        liquidity
),
prices AS (
    SELECT
        LOWER("tokenAddress") AS "tokenAddress",
        MAX("usd" :: NUMERIC) AS max_usd,
        DATE_TRUNC('day', "timestamp") AS timestamp_day
    FROM
        "historic-quotes"
    GROUP BY
        "tokenAddress",
        DATE_TRUNC('day', "timestamp")
),
liquidity_usd AS (
    SELECT
        evt_block_time AS timestamp,
        evt_block_number AS block_number,
        id,
        reason,
        symbol,
        address,
        y AS liquidity,
        y_delta AS delta_liquidity_real,
        liquidity_real,
        pr.max_usd :: NUMERIC AS price_usd,
        liquidity_real * pr.max_usd AS liquidity_usd
    FROM
        forwarded_liquidity fl
        LEFT JOIN prices pr ON fl.address = pr."tokenAddress"
        AND fl.evt_day = pr.timestamp_day
),
liquidity_usd_with_delta AS (
    SELECT
        timestamp,
        block_number,
        id,
        reason,
        symbol,
        address,
        liquidity,
        delta_liquidity_real,
        liquidity_real,
        price_usd,
        liquidity_usd,
        COALESCE(
            liquidity_usd - LAG(liquidity_usd) OVER (
                PARTITION BY address
                ORDER BY
                    timestamp
            ),
            liquidity_usd
        ) AS delta_liquidity_usd
    FROM
        liquidity_usd
    WHERE
        price_usd IS NOT NULL
),
liquidity_final AS (
    SELECT
        *,
        0 AS delta_liquidity_usd
    FROM
        liquidity_usd
    WHERE
        price_usd IS NULL
    UNION
    SELECT
        *
    FROM
        liquidity_usd_with_delta
)
SELECT
    timestamp,
    symbol,
    delta_liquidity_real,
    delta_liquidity_usd,
    "blockId" AS block_number
FROM
    liquidity_final
WHERE
    delta_liquidity_real <> 0
    OR delta_liquidity_usd <> 0
ORDER BY
    timestamp`;
  }
}
