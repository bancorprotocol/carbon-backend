import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy } from 'src/strategy/strategy.entity';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const EVENTS_CACHE_KEY = 'carbon:dexScreener:events';
const PAIRS_CACHE_KEY = 'carbon:dexScreener:pairs';

@Injectable()
export class DexScreenerService {
  constructor(
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async update(): Promise<void> {
    const events = await this.getEvents();
    this.cacheManager.set(EVENTS_CACHE_KEY, events);

    const pairs = await this.getPairs();
    this.cacheManager.set(PAIRS_CACHE_KEY, pairs);
  }

  async getCachedEvents(): Promise<any> {
    return this.cacheManager.get(EVENTS_CACHE_KEY);
  }

  private async getEvents(): Promise<any> {
    const query = `WITH created AS (
        SELECT
            sce.timestamp AS blockTimestamp,
            sce."blockId" AS blockNumber,
            sce."transactionHash" AS txnId,
            sce."transactionIndex" AS txnIndex,
            sce."logIndex" AS eventIndex,
            sce."owner" AS maker,
            sce."pairId" AS pairId,
            sce.id AS id,
            sce.order0,
            sce.order1,
            t0.address AS address0,
            t0.decimals AS decimals0,
            t1.address AS address1,
            t1.decimals AS decimals1,
            2 AS reason
        FROM
            "strategy-created-events" sce
            LEFT JOIN tokens t0 ON t0.id = sce."token0Id"
            LEFT JOIN tokens t1 ON t1.id = sce."token1Id"
    ),
    updated AS (
        SELECT
            sue."timestamp" AS blockTimestamp,
            sue."blockId" AS blockNumber,
            sue."transactionHash" AS txnId,
            sue."transactionIndex" AS txnIndex,
            sue."logIndex" AS eventIndex,
            vte."to" AS maker,
            sue."pairId" AS pairId,
            sue."strategyId" AS id,
            sue.order0,
            sue.order1,
            t0.address AS address0,
            t0.decimals AS decimals0,
            t1.address AS address1,
            t1.decimals AS decimals1,
            sue.reason
        FROM
            "strategy-updated-events" sue
            LEFT JOIN tokens t0 ON t0.id = sue."token0Id"
            LEFT JOIN tokens t1 ON t1.id = sue."token1Id"
            LEFT JOIN LATERAL (
                SELECT
                    "blockId",
                    "to"
                FROM
                    "voucher-transfer-events" vte
                WHERE
                    vte."strategyId" = sue."strategyId"
                    AND vte."blockId" < sue."blockId"
                ORDER BY
                    "blockId" DESC
                LIMIT
                    1
            ) vte ON TRUE
    ),
    deleted AS (
        SELECT
            sde."timestamp" AS blockTimestamp,
            sde."blockId" AS blockNumber,
            sde."transactionHash" AS txnId,
            sde."transactionIndex" AS txnIndex,
            sde."logIndex" AS eventIndex,
            vte."to" AS maker,
            sde."pairId" AS pairId,
            sde."strategyId" AS id,
            sde.order0,
            sde.order1,
            t0.address AS address0,
            t0.decimals AS decimals0,
            t1.address AS address1,
            t1.decimals AS decimals1,
            3 AS reason
        FROM
            "strategy-deleted-events" sde
            LEFT JOIN tokens t0 ON t0.id = sde."token0Id"
            LEFT JOIN tokens t1 ON t1.id = sde."token1Id"
            LEFT JOIN LATERAL (
                SELECT
                    "blockId",
                    "to"
                FROM
                    "voucher-transfer-events" vte
                WHERE
                    vte."strategyId" = sde."strategyId"
                    AND vte."blockId" < sde."blockId"
                ORDER BY
                    "blockId" DESC
                LIMIT
                    1
            ) vte ON TRUE
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
    orders_with_delta_y AS (
        SELECT
            *,
            COALESCE(
                (
                    CASE
                        WHEN reason = 2 THEN y0 -- created
                        WHEN reason = 3 THEN - y0 -- deleted
                        ELSE y0 - LAG(y0, 1) OVER (
                            -- updated
                            PARTITION BY id,
                            address0
                            ORDER BY
                                blockNumber
                        )
                    END
                ) / POW(10, decimals0),
                0
            ) AS y_delta0,
            COALESCE(
                (
                    CASE
                        WHEN reason = 2 THEN y1 -- created
                        WHEN reason = 3 THEN - y1 -- deleted
                        ELSE y1 - LAG(y1, 1) OVER (
                            -- updated
                            PARTITION BY id,
                            address1
                            ORDER BY
                                blockNumber
                        )
                    END
                ) / POW(10, decimals1),
                0
            ) AS y_delta1
        FROM
            orders_with_y
    ),
    orders_with_reserves AS (
        SELECT
            *,
            SUM(y_delta0) OVER (
                PARTITION BY address0
                ORDER BY
                    blockTimestamp
            ) AS liquidity_real0,
            SUM(y_delta1) OVER (
                PARTITION BY address1
                ORDER BY
                    blockTimestamp
            ) AS liquidity_real1,
            address0 <= address1 AS isAddress0Asset0
        FROM
            orders_with_delta_y
    ),
    orders_sorted AS (
        SELECT
            *,
            CASE
                WHEN isAddress0Asset0 THEN y_delta0
                ELSE y_delta1
            END AS amount0,
            CASE
                WHEN isAddress0Asset0 THEN y_delta1
                ELSE y_delta0
            END AS amount1,
            CASE
                WHEN isAddress0Asset0 THEN liquidity_real0
                ELSE liquidity_real1
            END AS reserves0,
            CASE
                WHEN isAddress0Asset0 THEN liquidity_real1
                ELSE liquidity_real0
            END AS reserves1
        FROM
            orders_with_reserves
    ),
    non_trade_liquidity AS (
        SELECT
            *,
            CASE
                WHEN reason = 0
                AND amount0 >= 0
                AND amount1 >= 0 THEN 0
                WHEN reason = 0
                AND amount0 <= 0
                AND amount1 <= 0 THEN 1
                WHEN reason = 0
                AND amount0 < 0
                AND amount1 > 0 THEN 2 --asset0 is join, asset1 is exit
                WHEN reason = 0
                AND amount0 > 0
                AND amount1 < 0 THEN 3 --asset0 is exit, asset1 is join
                WHEN reason = 2 THEN 0
                WHEN reason = 3 THEN 1
                ELSE 4 --unexpected, drop
            END AS join_exit
        FROM
            orders_sorted
        WHERE
            reason != 1 -- no trades
    ),
    trade_liquidity AS (
        SELECT
            *
        FROM
            orders_sorted
        WHERE
            reason = 1 -- trades
    ),
    join_exit_events AS (
        SELECT
            blockNumber,
            blockTimestamp,
            'join' AS eventType,
            txnId,
            txnIndex,
            eventIndex,
            maker,
            pairId,
            amount0,
            amount1,
            reserves0,
            reserves1
        FROM
            non_trade_liquidity
        WHERE
            join_exit = 0
        UNION
        SELECT
            blockNumber,
            blockTimestamp,
            'exit' AS eventType,
            txnId,
            txnIndex,
            eventIndex,
            maker,
            pairId,
            ABS(amount0) AS amount0,
            ABS(amount1) AS amount1,
            reserves0,
            reserves1
        FROM
            non_trade_liquidity
        WHERE
            join_exit = 1
        UNION
        (
            SELECT
                blockNumber,
                blockTimestamp,
                'join' AS eventType,
                txnId,
                txnIndex,
                eventIndex,
                maker,
                pairId,
                amount0,
                NULL AS amount1,
                reserves0,
                NULL AS reserves1
            FROM
                non_trade_liquidity
            WHERE
                join_exit = 2
            UNION
            SELECT
                blockNumber,
                blockTimestamp,
                'exit' AS eventType,
                txnId,
                txnIndex,
                eventIndex + 0.5,
                maker,
                pairId,
                NULL AS amount0,
                ABS(amount1) AS amount1,
                NULL AS reserves0,
                reserves1
            FROM
                non_trade_liquidity
            WHERE
                join_exit = 2
        )
        UNION
        (
            SELECT
                blockNumber,
                blockTimestamp,
                'exit' AS eventType,
                txnId,
                txnIndex,
                eventIndex,
                maker,
                pairId,
                ABS(amount0) AS amount0,
                NULL AS amount1,
                reserves0,
                NULL AS reserves1
            FROM
                non_trade_liquidity
            WHERE
                join_exit = 3
            UNION
            SELECT
                blockNumber,
                blockTimestamp,
                'join' AS eventType,
                txnId,
                txnIndex,
                eventIndex + 0.5,
                maker,
                pairId,
                NULL AS amount0,
                amount1,
                NULL AS reserves0,
                reserves1
            FROM
                non_trade_liquidity
            WHERE
                join_exit = 3
        )
    ),
    swap_events AS (
        SELECT
            tte.timestamp AS blockTimestamp,
            tte."blockId" AS blockNumber,
            'swap' AS eventType,
            tte."transactionHash" AS txnId,
            tte."transactionIndex" AS txnIndex,
            tte."logIndex" AS eventIndex,
            tte."callerId" AS maker,
            tte."pairId" AS pairId,
            tte."blockId",
            tte."sourceAmount" :: NUMERIC / POW(10, ts.decimals) AS sourceAmount,
            tte."targetAmount" :: NUMERIC / POW(10, tt.decimals) AS targetAmount,
            ts.address AS sourceAddress,
            tt.address AS targetAddress,
            ts.address <= tt.address AS isSourceAsset0
        FROM
            "tokens-traded-events" tte
            LEFT JOIN "tokens" ts ON tte."sourceTokenId" = ts.id
            LEFT JOIN "tokens" tt ON tte."targetTokenId" = tt.id
    ),
    swap_events_with_address AS (
        SELECT
            *,
            CASE
                WHEN isSourceAsset0 THEN sourceAmount --address0 is source, address1 is target
                ELSE NULL
            END AS asset0In,
            CASE
                WHEN NOT isSourceAsset0 THEN sourceAmount --address1 is source, address0 is target
                ELSE NULL
            END AS asset1In,
            CASE
                WHEN isSourceAsset0 THEN targetAmount --address0 is source, address1 is target
                ELSE NULL
            END AS asset1Out,
            CASE
                WHEN NOT isSourceAsset0 THEN targetAmount --address1 is source, address0 is target
                ELSE NULL
            END AS asset0Out,
            CASE
                WHEN isSourceAsset0 THEN CASE
                    --address0 is source, address1 is target
                    WHEN targetAmount != 0 THEN sourceAmount / targetAmount
                    ELSE 0
                END
                ELSE CASE
                    WHEN sourceAmount != 0 THEN targetAmount / sourceAmount
                    ELSE 0
                END
            END AS priceNative
        FROM
            swap_events
    ),
    swap_events_with_reserves AS (
        SELECT
            sewd.blockTimestamp,
            sewd.blockNumber,
            sewd.eventType,
            sewd.txnId,
            sewd.txnIndex,
            sewd.eventIndex,
            sewd.maker,
            sewd.pairId,
            sewd.asset0In,
            sewd.asset0Out,
            sewd.asset1In,
            sewd.asset1Out,
            sewd.priceNative,
            COALESCE(tl1.reserves0, 0) AS reserves0,
            --only null on trades with 0 source and target amount
            COALESCE(tl2.reserves1, 0) AS reserves1 --only null on trades with 0 source and target amount
        FROM
            swap_events_with_address sewd
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN sewd.sourceAddress = address0 THEN reserves0
                        ELSE reserves1
                    END AS reserves0
                FROM
                    trade_liquidity tl
                WHERE
                    sewd.txnId = tl.txnId
                    AND sewd.pairId = tl.pairId
                    AND (
                        sewd.sourceAddress = tl.address0
                        OR sewd.sourceAddress = tl.address1
                    )
                LIMIT
                    1
            ) tl1 ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN sewd.targetAddress = address0 THEN reserves0
                        ELSE reserves1
                    END AS reserves1
                FROM
                    trade_liquidity tl
                WHERE
                    sewd.txnId = tl.txnId
                    AND sewd.pairId = tl.pairId
                    AND (
                        sewd.targetAddress = tl.address0
                        OR sewd.targetAddress = tl.address1
                    )
                LIMIT
                    1
            ) tl2 ON TRUE
    )
    SELECT
        COALESCE(jee.blockNumber, sewr.blockNumber) AS blockNumber,
        COALESCE(jee.blockTimestamp, sewr.blockTimestamp) AS blockTimestamp,
        COALESCE(jee.txnId, sewr.txnId) AS txnId,
        COALESCE(jee.txnIndex, sewr.txnIndex) AS txnIndex,
        COALESCE(jee.eventIndex, sewr.eventIndex) AS eventIndex,
        COALESCE(jee.eventType, sewr.eventType) AS eventType,
        COALESCE(jee.maker, sewr.maker) AS maker,
        COALESCE(jee.pairId, sewr.pairId) AS pairId,
        COALESCE(jee.reserves0, sewr.reserves0) AS reserves0,
        COALESCE(jee.reserves0, sewr.reserves0) AS reserves1,
        jee.amount0,
        jee.amount1,
        sewr.asset0In,
        sewr.asset0Out,
        sewr.asset1In,
        sewr.asset1Out,
        sewr.priceNative
    FROM
        join_exit_events jee FULL
        OUTER JOIN swap_events_with_reserves sewr ON sewr.blockNumber = jee.blockNumber
    ORDER BY
        blockNumber`;

    const result = await this.strategy.query(query);
    result.forEach((r) => {
      for (const [key, value] of Object.entries(r)) {
        if (value === null) {
          r[key] = 0;
        }
      }
    });
    return result;
  }

  async getCachedPairs(): Promise<any> {
    return this.cacheManager.get(PAIRS_CACHE_KEY);
  }

  private async getPairs(): Promise<any> {
    const query = `WITH pairs AS (
      SELECT
          id,
          'carbondefi' AS dexKey,
          CASE
              WHEN token0 <= token1 THEN token0
              ELSE token1
          END AS asset0Id,
          CASE
              WHEN token0 <= token1 THEN token1
              ELSE token0
          END AS asset1Id,
          "blockId" AS createdAtBlockNumber,
          "createdAt" AS createdAtBlockTimestamp,
          "transactionHash" AS createdAtTxnId
      FROM
          "pair-created-events"
  ),
  pairFees AS (
      SELECT
          DISTINCT ON ("pairId") "pairId",
          "newFeePPM" :: NUMERIC AS feePPM,
          "blockId"
      FROM
          "pair-trading-fee-ppm-updated-events"
      ORDER BY
          "pairId",
          "blockId" DESC
  ),
  latestDefaultFee AS (
      SELECT
          "newFeePPM" :: NUMERIC AS feePPM
      FROM
          "trading-fee-ppm-updated-events"
      WHERE
          "blockId" = (
              SELECT
                  MAX("blockId")
              FROM
                  "trading-fee-ppm-updated-events"
          )
      LIMIT
          1
  ), pairsWithFee AS (
      SELECT
          ps.*,
          COALESCE(
              pf.feePPM,
              (
                  SELECT
                      feePPM
                  FROM
                      latestDefaultFee
              )
          ) / 100 AS feeBps
      FROM
          pairs ps
          LEFT JOIN pairFees pf ON ps.id = pf."pairId"
  )
  SELECT
      *
  FROM
      pairsWithFee`;

    const result = await this.strategy.query(query);
    result.forEach((r) => {
      for (const [key, value] of Object.entries(r)) {
        if (value === null) {
          r[key] = 0;
        }
      }
    });
    return result;
  }
}
