import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlDto } from '../v1/analytics/tvl.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';
import moment from 'moment';

@Injectable()
export class TvlService {
  constructor(
    @InjectRepository(Tvl)
    private tvlRepository: Repository<Tvl>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async getTvl(deployment: Deployment, params: TvlDto): Promise<Tvl[]> {
    let start;
    if (params.start) {
      start = moment.utc(params.start * 1000).format('YYYY-MM-DD HH:mm:ss');
    } else {
      start = moment.utc().subtract(7, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');
    }

    let end;
    if (params.end) {
      end = moment.utc(params.end * 1000).format('YYYY-MM-DD HH:mm:ss');
    } else {
      end = moment.utc().format('YYYY-MM-DD HH:mm:ss');
    }

    const limit = params.limit || 10000; // Default limit of 10,000
    const offset = params.offset || 0;

    const query = `
WITH start_block_from_date AS (
    SELECT
        COALESCE(
            (
                SELECT
                    id
                FROM
                    "blocks"
                WHERE
                    timestamp <= DATE_TRUNC('day', TIMESTAMP '${start}') -- start_date
                    AND "blockchainType" = '${deployment.blockchainType}'
                ORDER BY
                    timestamp DESC
                LIMIT
                    1
            ), 0
        ) AS evt_block_number
),
cast_tvl AS (
    SELECT
        evt_block_time,
        evt_block_number,
        DATE_TRUNC('day', evt_block_time) AS evt_day,
        transaction_index,
        strategyId,
        pairName,
        reason :: INTEGER,
        address,
        symbol,
        tvl :: DOUBLE PRECISION
    FROM
        tvl
    WHERE
        "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}'
),
selected_txs AS (
    SELECT
        *
    FROM
        cast_tvl
    WHERE
        evt_block_number > (
            SELECT
                evt_block_number
            FROM
                start_block_from_date
            LIMIT
                1
        )
), prior_txs AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY strategyId
            ORDER BY
                evt_block_number DESC,
                transaction_index DESC NULLS LAST
        ) AS row_num
    FROM
        cast_tvl
    WHERE
        evt_block_number <= (
            SELECT
                evt_block_number
            FROM
                start_block_from_date
            LIMIT
                1
        )
), last_strategy_events AS (
    SELECT
        pt.transaction_index,
        pt.strategyId,
        pt.evt_day,
        pt.evt_block_number,
        pt.evt_block_time,
        pt.address,
        pt.symbol,
        pt.reason,
        pt.pairName,
        pt.tvl
    FROM
        prior_txs pt
    WHERE
        pt.row_num = 1
),
selected_txs_with_last_events AS (
    SELECT
        transaction_index,
        evt_day,
        evt_block_number,
        evt_block_time,
        strategyId,
        address,
        symbol,
        reason,
        pairName,
        tvl
    FROM
        last_strategy_events
    WHERE
        reason != 4 -- not deleted
    UNION
    ALL
    SELECT
        transaction_index,
        evt_day,
        evt_block_number,
        evt_block_time,
        strategyId,
        address,
        symbol,
        reason,
        pairName,
        tvl
    FROM
        selected_txs
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
        selected_txs_with_last_events
    GROUP BY
        strategyId,
        address,
        pairName,
        symbol
),
start_end_dates AS (
    SELECT
        mmed.strategyId,
        mmed.address,
        mmed.pairName,
        mmed.symbol,
        CASE
            WHEN '${start}' <= mmed.min_evt_day THEN mmed.min_evt_day
            ELSE '${start}'
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
                        selected_txs_with_last_events
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
                selected_txs_with_last_events stwl
            WHERE
                fd.strategyId = stwl.strategyId
                AND fd.evt_block_time = stwl.evt_day
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
        selected_txs_with_last_events
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
tvl_forwarded_with_price AS (
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
daily_tvl AS (
    SELECT
        evt_block_time,
        strategyId,
        pairName,
        symbol,
        address,
        tvl,
        COALESCE(symbolPrice * tvl, 0) AS tvl_usd
    FROM
        tvl_forwarded_with_price
    WHERE
        evt_block_time >= '${start}' -- start date
    ORDER BY
        evt_block_time
),
symbol_daily_aggregates AS (
    SELECT
        DATE_TRUNC('day', evt_block_time) AS evt_day,
        strategyId,
        address,
        symbol,
        AVG(tvl) AS avg_tvl,
        AVG(tvl_usd) AS avg_tvl_usd
    FROM
        daily_tvl
    WHERE
        evt_block_time BETWEEN DATE_TRUNC(
            'day',
            TIMESTAMP '${start}'
        )
        AND DATE_TRUNC(
            'day',
            TIMESTAMP '${end}' 
        )
    GROUP BY
        DATE_TRUNC('day', evt_block_time),
        strategyId,
        address,
        symbol
),
symbol_final_aggregates AS (
    SELECT
        evt_day,
        symbol,
        address,
        SUM(avg_tvl) AS total_tvl,
        SUM(avg_tvl_usd) AS total_tvl_usd
    FROM
        symbol_daily_aggregates
    GROUP BY
        evt_day,
        address,
        symbol
)
SELECT
    *
FROM
    symbol_final_aggregates
ORDER BY
    evt_day
LIMIT ${limit}
OFFSET ${offset};
    
    `;

    return await this.dataSource.query(query);
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
        evt_block_number > ${startBlock} -- saved start_block
),
-- Get y and truncated day
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
        transaction_index,
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
start_date_from_blocks AS (
    SELECT
        COALESCE(
            (
                SELECT
                    DATE_TRUNC('day', timestamp)
                FROM
                    "blocks"
                WHERE
                    id <= ${startBlock} -- saved start_block
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
    reason,
    address,
    symbol,
    tvl
FROM
    tvl    
    `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyid: record.strategyid,
        pairname: record.pairname,
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
