import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlDto } from '../v1/analytics/tvl.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';

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

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`)) || 1;

    // Query to get the TVL data
    const query = `
        -- saved startBlock and saved startDate for each tvl update
-- individual queries receive startDate and endDate
-- Get all StrategyCreated, StrategyUpdated, StrategyDeleted events before endBlock
WITH strategy_created AS (
    SELECT
        0 as transaction_index,
        timestamp AS evt_block_time,
        sce."blockId" AS evt_block_number,
        sce."strategyId" AS id,
        order0,
        order1,
        t0.address AS token0,
        t0.symbol AS symbol0,
        t0.decimals AS decimals0,
        t1.address AS token1,
        t1.symbol AS symbol1,
        t1.decimals AS decimals1,
        2 AS reason,
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
        sue.id as transaction_index,
        timestamp AS evt_block_time,
        sue."blockId" AS evt_block_number,
        sue."strategyId" AS id,
        order0,
        order1,
        t0.address AS token0,
        t0.symbol AS symbol0,
        t0.decimals AS decimals0,
        t1.address AS token1,
        t1.symbol AS symbol1,
        t1.decimals AS decimals1,
        reason,
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
        99999999999 as transaction_index,
        timestamp AS evt_block_time,
        sde."blockId" AS evt_block_number,
        sde."strategyId" AS id,
        order0,
        order1,
        t0.address AS token0,
        t0.symbol AS symbol0,
        t0.decimals AS decimals0,
        t1.address AS token1,
        t1.symbol AS symbol1,
        t1.decimals AS decimals1,
        4 AS reason,
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
    UNION ALL
    SELECT
        *
    FROM
        strategy_updated
    UNION ALL
    SELECT
        *
    FROM
        strategy_deleted
),
selected_txs AS (
    SELECT
        *
    FROM
        all_txs
    WHERE
        evt_block_number > ${startBlock}  -- saved start_block
),
prior_txs AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY evt_block_number DESC, transaction_index DESC NULLS LAST) AS row_num
    FROM
        all_txs
    WHERE
        evt_block_number <= ${startBlock}  -- saved start_block
),
last_strategy_events AS (
    SELECT
        pt.transaction_index,
        pt.id,
        pt.evt_block_number,
        pt.evt_block_time,
        pt.order0,
        pt.order1,
        pt.token0,
        pt.symbol0,
        pt.decimals0,
        pt.token1,
        pt.symbol1,
        pt.decimals1,
        pt.reason,
        pt.pairName
    FROM
        prior_txs pt
    WHERE
        pt.row_num = 1
), selected_txs_with_last_events AS (
    SELECT
        transaction_index,
        evt_block_number,
        evt_block_time,
        id AS strategyId,
        order0,
        order1,
        token0,
        symbol0,
        decimals0,
        token1,
        symbol1,
        decimals1,
        reason,
        pairName
    FROM
        last_strategy_events
    WHERE
        reason != 4 -- not deleted
    UNION ALL
    SELECT
        transaction_index,
        evt_block_number,
        evt_block_time,
        id AS strategyId,
        order0,
        order1,
        token0,
        symbol0,
        decimals0,
        token1,
        symbol1,
        decimals1,
        reason,
        pairName
    FROM
        selected_txs
),
-- Get y and truncated day
orders_with_y_and_day AS (
    SELECT
        evt_block_number,
        evt_block_time,
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
        COALESCE((order0 :: json ->> 'y') :: double precision, 0) AS y0,
        COALESCE((order1 :: json ->> 'y') :: double precision, 0) AS y1
    FROM
        selected_txs_with_last_events
),
split_orders AS (
    SELECT
        evt_block_time,
        evt_day,
        evt_block_number,
        strategyId,
        pairname,
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
        evt_day,
        evt_block_number,
        strategyId,
        pairname,
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
                WHEN reason = 4 THEN 0 -- deleted
                ELSE y
            END
        ) / POW(10, decimals) AS tvl
    FROM
        split_orders
),
min_max_evt_day AS (
    SELECT
        strategyId,
        address,
        pairName,
        symbol,
        MIN(evt_day) + INTERVAL '1 day' AS min_evt_day,
        MAX(evt_day) AS max_evt_day
    FROM
        orders_with_tvl
    GROUP BY
        strategyId,
        address,
        pairName,
        symbol
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
                    id <= ${startBlock}  -- saved start_block
                ORDER BY
                    id DESC
                LIMIT
                    1
            ), TO_DATE('1970-01-01', 'YYYY-MM-DD')
        ) AS timestamp
),
start_end_dates AS (
    SELECT
        mmed.strategyId,
        mmed.address,
        mmed.pairName,
        mmed.symbol,
        CASE
            WHEN (
                SELECT
                    timestamp
                FROM
                    start_date_from_blocks
                LIMIT
                    1
            ) <= mmed.min_evt_day THEN mmed.min_evt_day
            ELSE (
                SELECT
                    timestamp
                FROM
                    start_date_from_blocks
                LIMIT
                    1
            )
        END AS startDate,
        CASE
            WHEN owt.reason = 4 THEN mmed.max_evt_day
            ELSE CURRENT_DATE
        END AS endDate
    FROM
        min_max_evt_day mmed
        LEFT JOIN (
            SELECT
                strategyId,
                address,
                pairName,
                symbol,
                reason,
                evt_day
            FROM
                (
                    SELECT
                        strategyId,
                        address,
                        pairName,
                        symbol,
                        reason,
                        evt_day,
                        ROW_NUMBER() OVER (
                            PARTITION BY strategyId
                            ORDER BY
                                evt_block_number DESC
                        ) AS rn
                    FROM
                        orders_with_tvl
                ) sub
            WHERE
                rn = 1
        ) owt ON mmed.strategyId = owt.strategyId
        AND mmed.max_evt_day = owt.evt_day
),
forwarded_dates AS (
    SELECT
        strategyId,
        address,
        pairName,
        symbol,
        startDate,
        endDate,
        generate_series(startDate, endDate, INTERVAL '1 day') AS evt_block_time
    FROM
        start_end_dates
),
missing_dates AS (
    SELECT
        strategyId,
        address,
        pairName,
        symbol,
        evt_block_time
    FROM
        forwarded_dates fd
    WHERE
        NOT EXISTS (
            SELECT
                1
            FROM
                orders_with_tvl owt
            WHERE
                fd.strategyId = owt.strategyId
                AND fd.evt_block_time = owt.evt_day
        )
),
tvl_with_missing_dates AS (
    SELECT
        evt_block_time,
        evt_day,
        evt_block_number,
        strategyId,
        pairname,
        reason,
        address,
        symbol,
        tvl
    FROM
        orders_with_tvl
    UNION
    ALL
    SELECT
        evt_block_time,
        evt_block_time AS evt_day,
        NULL AS evt_block_number,
        strategyId,
        pairname,
        5 AS reason,
        address,
        symbol,
        NULL AS tvl
    FROM
        missing_dates
),
tvl_forwarded AS (
    SELECT
        evt_block_time,
        strategyId,
        pairName,
        symbol,
        address,
        first_value(tvl) OVER (
            PARTITION BY strategyId,
            address,
            grp
            ORDER BY
                evt_block_time
        ) AS tvl
    FROM
        (
            SELECT
                evt_block_time,
                strategyId,
                pairName,
                symbol,
                address,
                count(tvl) OVER (
                    PARTITION BY strategyId,
                    address
                    ORDER BY
                        evt_block_time
                ) AS grp,
                tvl
            FROM
                tvl_with_missing_dates
        ) sub
),
orders_with_prices AS (
    SELECT
        tf.*,
        hq.usd :: NUMERIC AS symbolPrice
    FROM
        tvl_forwarded tf
        LEFT JOIN LATERAL(
            SELECT
                usd
            FROM
                "historic-quotes"
            WHERE
                "tokenAddress" = tf.address
                AND timestamp <= tf.evt_block_time + INTERVAL '1day'
            ORDER BY
                timestamp DESC
            LIMIT
                1
        ) hq ON TRUE
),
tvl_rows_to_add AS (
    SELECT
        evt_block_time,
        strategyId,
        pairName,
        symbol,
        tvl,
        COALESCE(symbolPrice * tvl, 0) AS tvl_usd
    FROM
        orders_with_prices
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
SELECT * FROM tvl_rows_to_add
    `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId: record.strategyid,
        pair: record.pairname,
        symbol: record.symbol,
        tvl: record.tvl,
        tvlUsd: record.tvl_usd,
        timestamp: record.evt_block_time,
      }));
      await this.tvlRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }
}
