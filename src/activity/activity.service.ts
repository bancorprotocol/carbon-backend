import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';
import { Activity } from './activity.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { ActivityDto } from '../v1/activity/activity.dto';
import { ActivityMetaDto } from '../v1/activity/activity-meta.dto';
import { Deployment } from '../deployment/deployment.service';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    private lastProcessedBlockService: LastProcessedBlockService,
    private dataSource: DataSource,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    // Get the last processed block number
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-activities`)) ||
      1;

    // Query to get the activity data
    const query = `
-- Find the most recent event FROM each strategy to determine who needs updating
WITH selector_created AS (
  SELECT
    "strategyId",
    "blockId",
    'created' AS current_state
  FROM
    "strategy-created-events"
  WHERE
    "blockchainType" = '${deployment.blockchainType}'
    AND "exchangeId" = '${deployment.exchangeId}'
),
selector_strategyupdated AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY "strategyId"
      ORDER BY
        "id" DESC
    ) AS rn
  FROM
    "strategy-updated-events"
  WHERE
    "blockchainType" = '${deployment.blockchainType}'
    AND "exchangeId" = '${deployment.exchangeId}'
),
selector_most_recent_su AS (
  SELECT
    "strategyId",
    "blockId",
    'updated' AS current_state
  FROM
    selector_strategyupdated
  WHERE
    rn = 1
),
selector_deleted AS (
  SELECT
    "strategyId",
    "blockId",
    'deleted' AS current_state
  FROM
    "strategy-deleted-events"
  WHERE
    "blockchainType" = '${deployment.blockchainType}'
    AND "exchangeId" = '${deployment.exchangeId}'
),
all_states AS (
  SELECT
    *
  FROM
    selector_created
  UNION
  ALL
  SELECT
    *
  FROM
    selector_most_recent_su
  UNION
  ALL
  SELECT
    *
  FROM
    selector_deleted
),
all_states_marked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY "strategyId"
      ORDER BY
        "blockId" DESC
    ) AS rn
  FROM
    all_states
),
recently_updated_strategies AS (
  SELECT
    *
  FROM
    all_states_marked
  WHERE
    rn = 1
    AND "blockId" > ${startBlock}
),
-- For each strategy that needs updating we can get the prior state AND insert that into the original flow
prior_strategyupdated AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY "strategyId"
      ORDER BY
        "id" DESC
    ) AS rn
  FROM
    "strategy-updated-events"
  WHERE
    "blockId" <= ${startBlock}
    AND "blockchainType" = '${deployment.blockchainType}'
    AND "exchangeId" = '${deployment.exchangeId}'
),
updated_insert AS (
  SELECT
    1 AS sorting_order,
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
    reason,
    s."transactionHash" AS txhash,
    TRUE AS deleteme
  FROM
    prior_strategyupdated s
    LEFT JOIN tokens t0 ON t0.id = s."token0Id"
    LEFT JOIN tokens t1 ON t1.id = s."token1Id"
  WHERE
    rn = 1
    AND "strategyId" IN (
      SELECT
        "strategyId"
      FROM
        recently_updated_strategies
    )
),
created_insert AS (
  SELECT
    0 AS sorting_order,
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
    2 AS reason,
    s."transactionHash" AS txhash,
    TRUE AS deleteme
  FROM
    "strategy-created-events" s
    LEFT JOIN tokens t0 ON t0.id = s."token0Id"
    LEFT JOIN tokens t1 ON t1.id = s."token1Id"
  WHERE
    s."strategyId" NOT IN (
      SELECT
        "strategyId"
      FROM
        "strategy-updated-events"
      WHERE
        "blockId" < ${startBlock}
        AND "blockchainType" = '${deployment.blockchainType}'
        AND "exchangeId" = '${deployment.exchangeId}'
    )
    AND s."blockchainType" = '${deployment.blockchainType}'
    AND s."exchangeId" = '${deployment.exchangeId}'
),
-- ORIGINAL QUERY STARTS HERE
created AS (
  SELECT
    0 AS sorting_order,
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
    2 AS reason,
    s."transactionHash" AS txhash,
    FALSE AS deleteme
  FROM
    "strategy-created-events" s
    LEFT JOIN tokens t0 ON t0.id = s."token0Id"
    LEFT JOIN tokens t1 ON t1.id = s."token1Id"
  WHERE
    "blockId" > ${startBlock}
    AND s."blockchainType" = '${deployment.blockchainType}'
    AND s."exchangeId" = '${deployment.exchangeId}'
),
updated AS (
  SELECT
    s."id" AS sorting_order,
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
    reason,
    s."transactionHash" AS txhash,
    FALSE AS deleteme
  FROM
    "strategy-updated-events" s
    LEFT JOIN tokens t0 ON t0.id = s."token0Id"
    LEFT JOIN tokens t1 ON t1.id = s."token1Id"
  WHERE
    "blockId" > ${startBlock}
    AND s."blockchainType" = '${deployment.blockchainType}'
    AND s."exchangeId" = '${deployment.exchangeId}'
),
deleted AS (
  SELECT
    999999999 AS sorting_order,
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
    4 AS reason,
    s."transactionHash" AS txhash,
    FALSE AS deleteme
  FROM
    "strategy-deleted-events" s
    LEFT JOIN tokens t0 ON t0.id = s."token0Id"
    LEFT JOIN tokens t1 ON t1.id = s."token1Id"
  WHERE
    "blockId" > ${startBlock}
    AND s."blockchainType" = '${deployment.blockchainType}'
    AND s."exchangeId" = '${deployment.exchangeId}'
),
all_txs AS (
  SELECT
    *
  FROM
    created
  UNION
  ALL
  SELECT
    *
  FROM
    created_insert
  UNION
  ALL
  SELECT
    *
  FROM
    updated_insert
  UNION
  ALL
  SELECT
    *
  FROM
    updated
  UNION
  ALL
  SELECT
    *
  FROM
    deleted
),
current_orders3 AS (
  SELECT
    *,
    (
      CASE
        WHEN (order0 :: json ->> 'y') IS NOT NULL THEN (order0 :: json ->> 'y') :: DOUBLE PRECISION
        ELSE 0
      END
    ) AS y0,
    (
      CASE
        WHEN (order1 :: json ->> 'y') IS NOT NULL THEN (order1 :: json ->> 'y') :: DOUBLE PRECISION
        ELSE 0
      END
    ) AS y1,
    (
      CASE
        WHEN (order0 :: json ->> 'z') IS NOT NULL THEN (order0 :: json ->> 'z') :: DOUBLE PRECISION
        ELSE 0
      END
    ) AS z0,
    (
      CASE
        WHEN (order1 :: json ->> 'z') IS NOT NULL THEN (order1 :: json ->> 'z') :: DOUBLE PRECISION
        ELSE 0
      END
    ) AS z1,
    (
      CASE
        WHEN (order0 :: json ->> 'A') IS NOT NULL THEN (order0 :: json ->> 'A') :: BIGINT
        ELSE 0
      END
    ) AS A0,
    (
      CASE
        WHEN (order1 :: json ->> 'A') IS NOT NULL THEN (order1 :: json ->> 'A') :: BIGINT
        ELSE 0
      END
    ) AS A1,
    (
      CASE
        WHEN (order0 :: json ->> 'B') IS NOT NULL THEN (order0 :: json ->> 'B') :: BIGINT
        ELSE 0
      END
    ) AS B0,
    (
      CASE
        WHEN (order1 :: json ->> 'B') IS NOT NULL THEN (order1 :: json ->> 'B') :: BIGINT
        ELSE 0
      END
    ) AS B1
  FROM
    all_txs
),
deletions_zero AS (
  SELECT
    sorting_order,
    deleteme,
    evt_block_time,
    evt_block_number,
    id,
    token0,
    token1,
    reason,
    symbol0,
    decimals0,
    symbol1,
    decimals1,
    txhash,
    CASE
      WHEN reason = 4 THEN 0
      ELSE y0
    END AS y0,
    CASE
      WHEN reason = 4 THEN 0
      ELSE y1
    END AS y1,
    z0,
    z1,
    A0,
    A1,
    B0,
    B1
  FROM
    current_orders3
),
current_orders4 AS (
  SELECT
    c.sorting_order,
    c.deleteme,
    c.evt_block_time,
    c.evt_block_number,
    sce.owner AS creation_wallet,
    c.id,
    c.token0,
    c.token1,
    c.reason,
    c.y0,
    c.y1,
    c.symbol0,
    c.decimals0,
    c.symbol1,
    c.decimals1,
    y0 / POW(10, decimals0) AS liquidity0,
    y1 / POW(10, decimals1) AS liquidity1,
    z0 / POW(10, decimals0) AS capacity0,
    z1 / POW(10, decimals1) AS capacity1,
    (
      B0 % POW(2, 48) :: BIGINT * POW(2, FLOOR(B0 / POW(2, 48)))
    ) AS B0_real,
    (
      B1 % POW(2, 48) :: BIGINT * POW(2, FLOOR(B1 / POW(2, 48)))
    ) AS B1_real,
    (
      A0 % POW(2, 48) :: BIGINT * POW(2, FLOOR(A0 / POW(2, 48)))
    ) AS A0_real,
    (
      A1 % POW(2, 48) :: BIGINT * POW(2, FLOOR(A1 / POW(2, 48)))
    ) AS A1_real,
    COALESCE(
      (
        B0 - LAG(B0, 1) OVER (
          PARTITION BY c.id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS B0_delta,
    COALESCE(
      (
        B1 - LAG(B1, 1) OVER (
          PARTITION BY c.id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS B1_delta,
    COALESCE(
      (
        A0 - LAG(A0, 1) OVER (
          PARTITION BY c.id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS A0_delta,
    COALESCE(
      (
        A1 - LAG(A1, 1) OVER (
          PARTITION BY c.id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS A1_delta,
    txhash
  FROM
    deletions_zero c
    LEFT JOIN "strategy-created-events" sce ON sce."strategyId" = c.id
    WHERE sce."blockchainType" = '${deployment.blockchainType}'
    AND sce."exchangeId" = '${deployment.exchangeId}'    
),
order_lifespan AS (
  SELECT
    *,
    COALESCE(
      (
        y0 - LAG(y0, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ) / POW(10, decimals0),
      0
    ) AS y0_delta,
    COALESCE(
      (
        y1 - LAG(y1, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ) / POW(10, decimals1),
      0
    ) AS y1_delta,
    POW((B0_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals1 - decimals0)) AS lowestRate0,
    CASE
      WHEN liquidity0 = capacity0 THEN POW((B0_real + A0_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals1 - decimals0))
      ELSE POW(
        (B0_real + A0_real * liquidity0 / capacity0) / POW(2, 48) :: BIGINT,
        2
      ) * POW(10, (decimals1 - decimals0))
    END AS marginalRate0,
    POW((B0_real + A0_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals1 - decimals0)) AS highestRate0,
    POW((B1_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals0 - decimals1)) AS lowestRate1,
    CASE
      WHEN liquidity1 = capacity1 THEN POW((B1_real + A1_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals0 - decimals1))
      ELSE POW(
        (B1_real + A1_real * liquidity1 / capacity1) / POW(2, 48) :: BIGINT,
        2
      ) * POW(10, (decimals0 - decimals1))
    END AS marginalRate1,
    POW((B1_real + A1_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals0 - decimals1)) AS highestRate1
  FROM
    current_orders4
),
dep_with AS (
  SELECT
    *,
    CASE
      WHEN reason = 2 THEN liquidity0
      ELSE 0
    END + CASE
      WHEN (
        reason = 0
        AND y0_delta > 0
      ) THEN y0_delta
      ELSE 0
    END AS y0_deposited,
    CASE
      WHEN reason = 2 THEN liquidity1
      ELSE 0
    END + CASE
      WHEN (
        reason = 0
        AND y1_delta > 0
      ) THEN y1_delta
      ELSE 0
    END AS y1_deposited,
    CASE
      WHEN reason = 4 THEN - liquidity0
      ELSE 0
    END + CASE
      WHEN (
        reason = 0
        AND y0_delta < 0
      ) THEN y0_delta
      ELSE 0
    END AS y0_withdrawn,
    CASE
      WHEN reason = 4 THEN - liquidity1
      ELSE 0
    END + CASE
      WHEN (
        reason = 0
        AND y1_delta < 0
      ) THEN y1_delta
      ELSE 0
    END AS y1_withdrawn,
    CAST(symbol0 AS VARCHAR) || '/' || CAST(symbol1 AS VARCHAR) AS base_quote,
    CASE
      WHEN highestRate0 = 0 THEN 0
      ELSE 1 / highestRate0
    END AS lowestRate0_norm,
    CASE
      WHEN marginalRate0 = 0 THEN 0
      ELSE 1 / marginalRate0
    END AS marginalRate0_norm,
    CASE
      WHEN lowestRate0 = 0 THEN 0
      ELSE 1 / lowestRate0
    END AS highestRate0_norm,
    lowestRate1 AS lowestRate1_norm,
    marginalRate1 AS marginalRate1_norm,
    highestRate1 AS highestRate1_norm
  FROM
    order_lifespan
),
add_price_delta AS (
  SELECT
    *,
    COALESCE(
      (
        lowestRate0_norm - LAG(lowestRate0_norm, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS lowestRate0_norm_delta,
    COALESCE(
      (
        marginalRate0_norm - LAG(marginalRate0_norm, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS marginalRate0_norm_delta,
    COALESCE(
      (
        highestRate0_norm - LAG(highestRate0_norm, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS highestRate0_norm_delta,
    COALESCE(
      (
        lowestRate1_norm - LAG(lowestRate1_norm, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS lowestRate1_norm_delta,
    COALESCE(
      (
        marginalRate1_norm - LAG(marginalRate1_norm, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS marginalRate1_norm_delta,
    COALESCE(
      (
        highestRate1_norm - LAG(highestRate1_norm, 1) OVER (
          PARTITION BY id
          ORDER BY
            sorting_order
        )
      ),
      0
    ) AS highestRate1_norm_delta
  FROM
    dep_with
),
descriptions AS (
  SELECT
    *,
    CASE
      WHEN reason = 2 THEN 'Created'
      WHEN reason = 0
      AND (
        ABS(B0_delta) > 1
        OR ABS(B1_delta) > 1
        OR ABS(A0_delta) > 1
        OR ABS(A1_delta) > 1
      )
      AND (
        (
          y0_delta > 0
          AND y1_delta = 0
        )
        OR (
          y0_delta = 0
          AND y1_delta > 0
        )
        OR (
          y0_delta > 0
          AND y1_delta > 0
        )
      ) THEN 'edit_deposit'
      WHEN reason = 0
      AND (
        ABS(B0_delta) > 1
        OR ABS(B1_delta) > 1
        OR ABS(A0_delta) > 1
        OR ABS(A1_delta) > 1
      )
      AND (
        (
          y0_delta < 0
          AND y1_delta = 0
        )
        OR (
          y0_delta = 0
          AND y1_delta < 0
        )
        OR (
          y0_delta < 0
          AND y1_delta < 0
        )
      ) THEN 'edit_withdraw'
      WHEN reason = 0
      AND (
        ABS(B0_delta) > 1
        OR ABS(B1_delta) > 1
        OR ABS(A0_delta) > 1
        OR ABS(A1_delta) > 1
      )
      AND (
        y0_delta != 0
        OR y1_delta != 0
      ) THEN 'edit_deposit_withdraw'
      WHEN reason = 0
      AND (
        ABS(B0_delta) > 1
        OR ABS(B1_delta) > 1
        OR ABS(A0_delta) > 1
        OR ABS(A1_delta) > 1
      ) THEN 'Updated Price'
      WHEN reason = 0
      AND y0_delta > 0 THEN 'Deposited TKN0'
      WHEN reason = 0
      AND y1_delta > 0 THEN 'Deposited TKN1'
      WHEN reason = 0
      AND y0_delta < 0 THEN 'Withdrew TKN0'
      WHEN reason = 0
      AND y1_delta < 0 THEN 'Withdrew TKN1'
      WHEN reason = 1 THEN 'Trade Occurred'
      WHEN reason = 4 THEN 'deleted'
      ELSE 'edit_price'
    END AS descr
  FROM
    add_price_delta
),
all_trades AS (
  SELECT
    sorting_order,
    deleteme,
    id,
    CASE
      WHEN (
        y0_delta < 0
        AND y1_delta >= 0
      )
      OR (
        y0_delta = 0
        AND y1_delta > 0
      ) THEN - y0_delta
      ELSE - y1_delta
    END AS strategy_sold,
    CASE
      WHEN (
        y0_delta < 0
        AND y1_delta >= 0
      )
      OR (
        y0_delta = 0
        AND y1_delta > 0
      ) THEN symbol0
      ELSE symbol1
    END AS token_sold,
    CASE
      WHEN (
        y0_delta > 0
        AND y1_delta <= 0
      )
      OR (
        y0_delta = 0
        AND y1_delta < 0
      ) THEN y0_delta
      ELSE y1_delta
    END AS strategy_bought,
    CASE
      WHEN (
        y0_delta > 0
        AND y1_delta <= 0
      )
      OR (
        y0_delta = 0
        AND y1_delta < 0
      ) THEN symbol0
      ELSE symbol1
    END AS token_bought,
    txhash
  FROM
    order_lifespan
  WHERE
    reason = 1
),
trade_info AS (
  SELECT
    d.*,
    a.strategy_sold,
    a.token_sold,
    a.strategy_bought,
    a.token_bought,
    CASE
      WHEN a.strategy_sold = 0 THEN 0
      ELSE a.strategy_bought / a.strategy_sold
    END AS effective_price,
    a.token_sold || '/' || a.token_bought AS trade_base_quote,
    CASE
      WHEN a.strategy_bought = 0 THEN 0
      ELSE a.strategy_sold / a.strategy_bought
    END AS effective_price_inv,
    a.token_bought || '/' || a.token_sold AS inv_trade_base_quote
  FROM
    descriptions d
    LEFT JOIN all_trades a ON a.txhash = d.txhash
    AND a.id = d.id
    AND a.sorting_order = d.sorting_order
),
voucher_transfers AS (
  SELECT
    *
  FROM
    "voucher-transfer-events" s
  WHERE
    s."from" != '0x0000000000000000000000000000000000000000'
    AND s."to" != '0x0000000000000000000000000000000000000000'
    AND s."blockchainType" = '${deployment.blockchainType}'
    AND s."exchangeId" = '${deployment.exchangeId}'
),
RankedVoucherTransfers AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY "strategyId"
      ORDER BY
        "blockId" DESC
    ) AS rn
  FROM
    voucher_transfers
),
most_recent_transfer AS (
  SELECT
    *
  FROM
    RankedVoucherTransfers
  WHERE
    rn = 1
),
voucher_minimal AS (
  SELECT
    "strategyId" AS id,
    'transfer_strategy' AS action,
    "from" AS old_owner,
    "to" AS new_owner,
    timestamp AS date,
    "transactionHash" AS txhash,
    "blockId" AS block_number
  FROM
    voucher_transfers
),
complete_info AS (
  SELECT
    ti.*,
    CASE
      WHEN base_quote = trade_base_quote THEN effective_price
      ELSE effective_price_inv
    END AS avg_price,
    CASE
      WHEN descr = 'Trade Occurred'
      AND token_sold = symbol0 THEN 'sell_high'
      WHEN descr = 'Trade Occurred'
      AND token_sold != symbol0 THEN 'buy_low'
      WHEN descr = 'Created' THEN 'create_strategy'
      WHEN descr = 'Deposited TKN0' THEN 'deposit'
      WHEN descr = 'Deposited TKN1' THEN 'deposit'
      WHEN descr = 'Withdrew TKN0' THEN 'withdraw'
      WHEN descr = 'Withdrew TKN1' THEN 'withdraw'
      WHEN descr = 'Updated Price'
      AND NOT (
        lowestRate0_norm != 0
        OR highestRate0_norm != 0
        OR lowestRate1_norm != 0
        OR highestRate1_norm != 0
      ) THEN 'strategy_paused'
      WHEN descr = 'Updated Price' THEN 'edit_price'
      ELSE descr
    END AS action,
    CASE
      WHEN mrt."strategyId" IS NOT NULL THEN mrt."to"
      ELSE ti.creation_wallet
    END AS current_owner
  FROM
    trade_info ti
    LEFT JOIN most_recent_transfer mrt ON ti.id = mrt."strategyId"
),
complete_renamed AS (
  SELECT
    sorting_order,
    deleteme,
    evt_block_number AS block_number,
    creation_wallet,
    current_owner,
    id,
    action,
    base_quote,
    token0 AS base_sell_token_address,
    symbol0 AS base_sell_token,
    token1 AS quote_buy_token_address,
    symbol1 AS quote_buy_token,
    liquidity1 AS buy_budget,
    liquidity0 AS sell_budget,
    y1_delta AS buy_budget_change,
    y0_delta AS sell_budget_change,
    lowestrate1_norm AS buy_price_a,
    marginalRate1_norm AS buy_price_marg,
    highestrate1_norm AS buy_price_b,
    lowestrate0_norm AS sell_price_a,
    marginalRate0_norm AS sell_price_marg,
    highestrate0_norm AS sell_price_b,
    lowestrate1_norm_delta AS buy_price_a_delta,
    marginalRate1_norm_delta AS buy_price_marg_delta,
    highestrate1_norm_delta AS buy_price_b_delta,
    lowestrate0_norm_delta AS sell_price_a_delta,
    marginalRate0_norm_delta AS sell_price_marg_delta,
    highestrate0_norm_delta AS sell_price_b_delta,
    strategy_sold,
    token_sold,
    strategy_bought,
    token_bought,
    avg_price,
    evt_block_time AS date,
    txhash
  FROM
    complete_info
),
RankedCompleteInfo AS (
  SELECT
    ci.*,
    ROW_NUMBER() OVER (
      PARTITION BY vm.id
      ORDER BY
        ci.date DESC
    ) AS rn
  FROM
    voucher_minimal vm
    LEFT JOIN complete_renamed ci ON ci.id = vm.id
    AND ci.date <= vm.date
),
prior_action AS (
  SELECT
    *
  FROM
    RankedCompleteInfo
  WHERE
    rn = 1
),
transfer_action AS (
  SELECT
    sorting_order,
    deleteme,
    creation_wallet,
    current_owner,
    vm.id,
    vm.action,
    base_quote,
    base_sell_token,
    base_sell_token_address,
    quote_buy_token,
    quote_buy_token_address,
    buy_budget,
    sell_budget,
    NULL :: DOUBLE PRECISION AS buy_budget_change,
    NULL :: DOUBLE PRECISION AS sell_budget_change,
    buy_price_a,
    buy_price_marg,
    buy_price_b,
    sell_price_a,
    sell_price_marg,
    sell_price_b,
    buy_price_a_delta,
    buy_price_marg_delta,
    buy_price_b_delta,
    sell_price_a_delta,
    sell_price_marg_delta,
    sell_price_b_delta,
    NULL :: DOUBLE PRECISION AS strategy_sold,
    NULL AS token_sold,
    NULL :: DOUBLE PRECISION AS strategy_bought,
    NULL AS token_bought,
    NULL :: DOUBLE PRECISION AS avg_price,
    vm.date,
    vm.txhash,
    vm.old_owner,
    vm.new_owner,
    vm.block_number
  FROM
    voucher_minimal vm
    LEFT JOIN prior_action pa ON pa.id = vm.id
),
complete_actions AS (
  SELECT
    sorting_order,
    deleteme,
    creation_wallet,
    current_owner,
    NULL AS old_owner,
    NULL AS new_owner,
    id,
    action,
    base_quote,
    base_sell_token,
    base_sell_token_address,
    quote_buy_token,
    quote_buy_token_address,
    buy_budget,
    sell_budget,
    buy_budget_change,
    sell_budget_change,
    buy_price_a,
    buy_price_marg,
    buy_price_b,
    sell_price_a,
    sell_price_marg,
    sell_price_b,
    buy_price_a_delta,
    buy_price_marg_delta,
    buy_price_b_delta,
    sell_price_a_delta,
    sell_price_marg_delta,
    sell_price_b_delta,
    strategy_sold,
    token_sold,
    strategy_bought,
    token_bought,
    avg_price,
    date,
    txhash,
    block_number
  FROM
    complete_renamed
  UNION
  ALL
  SELECT
    sorting_order,
    deleteme,
    creation_wallet,
    current_owner,
    old_owner,
    new_owner,
    id,
    action,
    base_quote,
    base_sell_token,
    base_sell_token_address,
    quote_buy_token,
    quote_buy_token_address,
    buy_budget,
    sell_budget,
    buy_budget_change,
    sell_budget_change,
    buy_price_a,
    buy_price_marg,
    buy_price_b,
    sell_price_a,
    sell_price_marg,
    sell_price_b,
    buy_price_a_delta,
    buy_price_marg_delta,
    buy_price_b_delta,
    sell_price_a_delta,
    sell_price_marg_delta,
    sell_price_b_delta,
    strategy_sold,
    token_sold,
    strategy_bought,
    token_bought,
    avg_price,
    date,
    txhash,
    block_number
  FROM
    transfer_action
)
SELECT
  creation_wallet,
  current_owner,
  old_owner,
  new_owner,
  id,
  action,
  base_quote,
  base_sell_token,
  base_sell_token_address,
  quote_buy_token,
  quote_buy_token_address,
  buy_budget,
  sell_budget,
  buy_budget_change,
  sell_budget_change,
  buy_price_a,
  buy_price_marg,
  buy_price_b,
  sell_price_a,
  sell_price_marg,
  sell_price_b,
  buy_price_a_delta,
  buy_price_marg_delta,
  buy_price_b_delta,
  sell_price_a_delta,
  sell_price_marg_delta,
  sell_price_b_delta,
  strategy_sold,
  token_sold,
  strategy_bought,
  token_bought,
  avg_price,
  date,
  txhash,
  block_number
FROM
  complete_actions
WHERE
  deleteme IS FALSE
ORDER BY
  block_number,
  sorting_order    
    `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
        creationWallet: record.creation_wallet,
        currentOwner: record.current_owner,
        oldOwner: record.old_owner,
        newOwner: record.new_owner,
        strategyId: record.id,
        action: record.action,
        baseQuote: record.base_quote,
        baseSellToken: record.base_sell_token,
        baseSellTokenAddress: record.base_sell_token_address,
        quoteBuyToken: record.quote_buy_token,
        quoteBuyTokenAddress: record.quote_buy_token_address,
        buyBudget: record.buy_budget,
        sellBudget: record.sell_budget,
        buyBudgetChange: record.buy_budget_change,
        sellBudgetChange: record.sell_budget_change,
        buyPriceA: record.buy_price_a,
        buyPriceMarg: record.buy_price_marg,
        buyPriceB: record.buy_price_b,
        sellPriceA: record.sell_price_a,
        sellPriceMarg: record.sell_price_marg,
        sellPriceB: record.sell_price_b,
        buyPriceADelta: record.buy_price_a_delta,
        buyPriceMargDelta: record.buy_price_marg_delta,
        buyPriceBDelta: record.buy_price_b_delta,
        sellPriceADelta: record.sell_price_a_delta,
        sellPriceMargDelta: record.sell_price_marg_delta,
        sellPriceBDelta: record.sell_price_b_delta,
        strategySold: record.strategy_sold,
        tokenSold: record.token_sold,
        strategyBought: record.strategy_bought,
        tokenBought: record.token_bought,
        avgPrice: record.avg_price,
        timestamp: record.date,
        txhash: record.txhash,
        blockNumber: record.block_number,
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      }));
      await this.activityRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(
      `${deployment.blockchainType}-${deployment.exchangeId}-activities`,
      endBlock,
    );
  }

  async getFilteredActivities(params: ActivityDto | ActivityMetaDto, deployment: Deployment): Promise<Activity[]> {
    const queryBuilder = this.activityRepository.createQueryBuilder('activity');

    queryBuilder.where('activity.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId });

    if (params.start) {
      queryBuilder.andWhere('activity.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      queryBuilder.andWhere('activity.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    if (params.actions) {
      const actionsArray = Array.isArray(params.actions) ? params.actions : [params.actions];
      queryBuilder.andWhere(
        new Brackets((qb) => {
          actionsArray.forEach((action, index) => {
            qb.orWhere(`activity.action LIKE :action${index}`, { [`action${index}`]: `%${action}%` });
          });
        }),
      );
    }

    if (params.ownerId) {
      queryBuilder.andWhere('(activity.creationWallet = :ownerId OR activity.currentOwner = :ownerId)', {
        ownerId: params.ownerId,
      });
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      queryBuilder.andWhere('activity."strategyId" IN (:...strategyIds)', { strategyIds });
    }

    if (params.pairs) {
      const pairs = params.pairs.split(',').map((pair) => pair.split('_').sort());
      queryBuilder.andWhere(
        new Brackets((qb) => {
          pairs.forEach((pair) => {
            qb.orWhere(
              '(LOWER(activity.quoteBuyTokenAddress) = :pair0 AND LOWER(activity.baseSellTokenAddress) = :pair1)',
              { pair0: pair[0].toLowerCase(), pair1: pair[1].toLowerCase() },
            );
          });
        }),
      );
    }

    if (params.token0 && !params.token1) {
      queryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token0 OR LOWER(activity.baseSellTokenAddress) = :token0)',
        { token0: params.token0.toLowerCase() },
      );
    }

    if (params.token1 && !params.token0) {
      queryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token1 OR LOWER(activity.baseSellTokenAddress) = :token1)',
        { token1: params.token1.toLowerCase() },
      );
    }

    if (params.token0 && params.token1) {
      queryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) IN (:...tokens) AND LOWER(activity.baseSellTokenAddress) IN (:...tokens))',
        { tokens: [params.token0.toLowerCase(), params.token1.toLowerCase()] },
      );
    }

    queryBuilder.orderBy('activity.timestamp', 'DESC');

    if ('limit' in params && params.limit) {
      queryBuilder.take(params.limit);
    }

    if ('offset' in params && params.offset) {
      queryBuilder.skip(params.offset);
    }

    return queryBuilder.getMany();
  }

  async getActivityMeta(params: ActivityMetaDto, deployment: Deployment): Promise<any> {
    const baseQueryBuilder = this.activityRepository.createQueryBuilder('activity');

    baseQueryBuilder.where('activity.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId });

    if (params.start) {
      baseQueryBuilder.andWhere('activity.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      baseQueryBuilder.andWhere('activity.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    if (params.actions) {
      const actionsArray = Array.isArray(params.actions) ? params.actions : [params.actions];
      baseQueryBuilder.andWhere(
        new Brackets((qb) => {
          actionsArray.forEach((action, index) => {
            qb.orWhere(`activity.action LIKE :action${index}`, { [`action${index}`]: `%${action}%` });
          });
        }),
      );
    }

    if (params.ownerId) {
      baseQueryBuilder.andWhere('(activity.creationWallet = :ownerId OR activity.currentOwner = :ownerId)', {
        ownerId: params.ownerId,
      });
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      baseQueryBuilder.andWhere('activity."strategyId" IN (:...strategyIds)', { strategyIds });
    }

    if (params.pairs) {
      const pairs = params.pairs.split(',').map((pair) => pair.split('_').sort());
      baseQueryBuilder.andWhere(
        new Brackets((qb) => {
          pairs.forEach((pair) => {
            qb.orWhere(
              '(LOWER(activity.quoteBuyTokenAddress) = :pair0 AND LOWER(activity.baseSellTokenAddress) = :pair1)',
              { pair0: pair[0].toLowerCase(), pair1: pair[1].toLowerCase() },
            );
          });
        }),
      );
    }

    if (params.token0 && !params.token1) {
      baseQueryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token0 OR LOWER(activity.baseSellTokenAddress) = :token0)',
        { token0: params.token0.toLowerCase() },
      );
    }

    if (params.token1 && !params.token0) {
      baseQueryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token1 OR LOWER(activity.baseSellTokenAddress) = :token1)',
        { token1: params.token1.toLowerCase() },
      );
    }

    if (params.token0 && params.token1) {
      baseQueryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) IN (:...tokens) AND LOWER(activity.baseSellTokenAddress) IN (:...tokens))',
        { tokens: [params.token0.toLowerCase(), params.token1.toLowerCase()] },
      );
    }

    const countQuery = baseQueryBuilder.clone().getCount();

    const actionsQuery = baseQueryBuilder.clone().select('activity.action').distinct(true).getRawMany();

    const pairsQuery = baseQueryBuilder
      .clone()
      .select(['LOWER(activity.quoteBuyTokenAddress) AS quote', 'LOWER(activity.baseSellTokenAddress) AS base'])
      .groupBy('quote')
      .addGroupBy('base')
      .getRawMany();

    const strategiesQuery = baseQueryBuilder
      .clone()
      .select(['activity.strategyId', 'activity.baseSellTokenAddress', 'activity.quoteBuyTokenAddress'])
      .distinct(true)
      .getRawMany();

    // Execute queries in parallel
    const [size, actions, pairs, strategies] = await Promise.all([
      countQuery,
      actionsQuery,
      pairsQuery,
      strategiesQuery,
    ]);

    return {
      size,
      actions: actions.map((action) => action.activity_action),
      pairs: pairs.map((pair) => [pair.quote, pair.base]),
      strategies: strategies.reduce((acc, d) => {
        acc[d.activity_strategyId] = [d.activity_baseSellTokenAddress, d.activity_quoteBuyTokenAddress];
        return acc;
      }, {}),
    };
  }
}
