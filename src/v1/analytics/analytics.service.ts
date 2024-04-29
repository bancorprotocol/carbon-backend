import { Inject, Injectable } from '@nestjs/common';
import { Strategy } from '../../strategy/strategy.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const ANALYTICS_TVL_CACHE_KEY = 'carbon:analytics:tvl';
const ANALYTICS_VOLUME_CACHE_KEY = 'carbon:volume:tvl';
const ANALYTICS_GENERIC_METRICS_KEY = 'carbon:generic-metrics:tvl';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async update(): Promise<void> {
    const tvl = await this.getTVL();
    this.cacheManager.set(ANALYTICS_TVL_CACHE_KEY, tvl);

    const volume = await this.getVolume();
    this.cacheManager.set(ANALYTICS_VOLUME_CACHE_KEY, volume);

    const generic = await this.getGenericMetrics();
    this.cacheManager.set(ANALYTICS_GENERIC_METRICS_KEY, generic);
  }

  async getCachedTVL(): Promise<any> {
    return this.cacheManager.get(ANALYTICS_TVL_CACHE_KEY);
  }

  private async getTVL(): Promise<any> {
    const query = `WITH created AS (
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
        delta_liquidity_usd
    FROM
        liquidity_final
    WHERE
        delta_liquidity_real <> 0
        OR delta_liquidity_usd <> 0
    ORDER BY
        timestamp`;

    const result = await this.strategy.query(query);
    return result;
  }

  async getCachedVolume(): Promise<any> {
    return this.cacheManager.get(ANALYTICS_VOLUME_CACHE_KEY);
  }

  private async getVolume(): Promise<any> {
    const query = `WITH tokens_traded_with_token_info AS (
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
        tradingFeeAmount_real,
        tradingFeeAmount_usd,
        targetsymbol,
        targetamount_real,
        targetamount_usd
    FROM
        volume_fee_usd
    ORDER BY
        timestamp`;

    const result = await this.strategy.query(query);
    return result;
  }

  async getCachedGenericMetrics(): Promise<any> {
    return this.cacheManager.get(ANALYTICS_GENERIC_METRICS_KEY);
  }

  private async getGenericMetrics(): Promise<any> {
    const query = `WITH filtered_strategies AS (
        SELECT
            *
        FROM
            strategies
        WHERE
            deleted = false
            AND (
                liquidity0 :: NUMERIC > 0
                OR liquidity1 :: NUMERIC > 0
            )
    ),
    strategies_with_decimals AS (
        SELECT
            fs.liquidity0,
            ts0.decimals AS decimals0,
            fs."token0Id",
            fs.liquidity1,
            ts1.decimals AS decimals1,
            fs."token1Id"
        FROM
            filtered_strategies fs
            LEFT JOIN tokens ts0 ON fs."token0Id" = ts0.id
            LEFT JOIN tokens ts1 ON fs."token1Id" = ts1.id
    ),
    strategies_with_prices AS (
        SELECT
            swd.liquidity0 :: NUMERIC,
            decimals0 :: NUMERIC,
            swd."token0Id",
            q1.usd :: NUMERIC AS price0,
            swd.liquidity1 :: NUMERIC,
            decimals1 :: NUMERIC,
            swd."token1Id",
            q2.usd :: NUMERIC AS price1
        FROM
            strategies_with_decimals swd
            LEFT JOIN quotes q1 ON swd."token0Id" = q1."tokenId"
            LEFT JOIN quotes q2 ON swd."token1Id" = q2."tokenId"
    ),
    strategies_with_liquidity AS (
        SELECT
            (liquidity0) / POW(10, decimals0) * price0 AS liquidity
        FROM
            strategies_with_prices
        UNION
        SELECT
            (liquidity1) / POW(10, decimals1) * price1 AS liquidity
        FROM
            strategies_with_prices
    ),
    sum_liquidity AS (
        SELECT
            SUM(liquidity) AS current_liquidity
        FROM
            strategies_with_liquidity
    ),
    strategies_created AS (
        SELECT
            COUNT(id) AS strategies_created
        FROM
            "strategy-created-events"
    ),
    pairs_created AS (
        SELECT
            COUNT(id) AS pairs_created
        FROM
            "pair-created-events"
    ),
    unique_traders AS (
        SELECT
            COUNT(DISTINCT trader) AS unique_traders
        FROM
            "tokens-traded-events"
    ),
    active_pairs AS (
        SELECT
            COUNT(DISTINCT "pairId") AS active_pairs
        FROM
            filtered_strategies
    ),
    number_trades AS (
        SELECT
            COUNT("id") AS number_trades
        FROM
            "tokens-traded-events"
    ),
    latest_updated_block AS (
        SELECT
            MIN("last_processed_block"."block") AS last_block,
            MIN("updatedAt") AS last_timestamp
        FROM
            last_processed_block
    ),
    tokens_traded_with_token_info AS (
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
    ),
    fee_volume AS(
        SELECT
            SUM(tradingFeeAmount_usd) AS fees,
            SUM(targetamount_usd) AS volume
        FROM
            volume_fee_usd
    )
    SELECT
        sl.current_liquidity :: NUMERIC,
        sc.strategies_created :: INTEGER,
        pc.pairs_created :: INTEGER,
        ut.unique_traders :: INTEGER,
        ap.active_pairs :: INTEGER,
        nt.number_trades :: INTEGER,
        fv.volume :: NUMERIC,
        fv.fees :: NUMERIC,
        lub.last_block :: INTEGER,
        lub.last_timestamp
    FROM
        sum_liquidity sl,
        strategies_created sc,
        pairs_created pc,
        unique_traders ut,
        active_pairs ap,
        number_trades nt,
        fee_volume fv,
        latest_updated_block lub`;

    const result = await this.strategy.query(query);
    return result;
  }
}
