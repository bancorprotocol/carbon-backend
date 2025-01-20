import { Inject, Injectable } from '@nestjs/common';
import { Strategy } from '../../strategy/strategy.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Deployment } from '../../deployment/deployment.service';
import { convertKeysToCamelCase } from '../../utilities';

const ANALYTICS_GENERIC_METRICS_KEY = 'carbon:generic-metrics';
const ANALYTICS_TRADES_COUNT_KEY = 'carbon:trades-count';
const ANALYTICS_TRENDING = 'carbon:trending';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async update(deployment: Deployment): Promise<void> {
    const generic = await this.getGenericMetrics(deployment);
    await this.cacheManager.set(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_GENERIC_METRICS_KEY}`,
      generic,
    );

    const tradeCounts = await this.getTradesCount(deployment);
    await this.cacheManager.set(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_TRADES_COUNT_KEY}`,
      tradeCounts,
    );

    const trending = await this.getTrending(deployment);
    await this.cacheManager.set(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_TRENDING}`,
      trending,
    );
  }

  async getCachedGenericMetrics(deployment: Deployment): Promise<any> {
    return this.cacheManager.get(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_GENERIC_METRICS_KEY}`,
    );
  }

  async getCachedTradesCount(deployment: Deployment): Promise<any> {
    const cache: any = await this.cacheManager.get(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_TRADES_COUNT_KEY}`,
    );

    return cache.map((trade) => {
      return {
        strategyId: trade.id,
        tradeCount: parseInt(trade.trade_count),
      };
    });
  }

  async getCachedTrending(deployment: Deployment): Promise<any> {
    const cache: any = await this.cacheManager.get(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_TRENDING}`,
    );

    return cache;
  }

  private async getGenericMetrics(deployment: Deployment): Promise<any> {
    const query = `
WITH filtered_strategies AS (
    SELECT * 
    FROM strategies 
    WHERE deleted = false
    AND "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}'
    AND (liquidity0::NUMERIC > 0 OR liquidity1::NUMERIC > 0)
), strategies_with_decimals AS (
    SELECT fs.liquidity0, ts0.decimals AS decimals0, fs."token0Id", fs.liquidity1, ts1.decimals AS decimals1, fs."token1Id" 
    FROM filtered_strategies fs 
    LEFT JOIN tokens ts0 ON fs."token0Id" = ts0.id AND ts0."blockchainType" = '${deployment.blockchainType}' AND ts0."exchangeId" = '${deployment.exchangeId}'
    LEFT JOIN tokens ts1 ON fs."token1Id" = ts1.id AND ts1."blockchainType" = '${deployment.blockchainType}' AND ts1."exchangeId" = '${deployment.exchangeId}'
), strategies_with_prices AS (
    SELECT swd.liquidity0::NUMERIC, decimals0::NUMERIC, swd."token0Id", q1.usd::NUMERIC AS price0, swd.liquidity1::NUMERIC, decimals1::NUMERIC, swd."token1Id", q2.usd::NUMERIC AS price1 
    FROM strategies_with_decimals swd 
    LEFT JOIN quotes q1 ON swd."token0Id" = q1."tokenId" AND q1."blockchainType" = '${deployment.blockchainType}'
    LEFT JOIN quotes q2 ON swd."token1Id" = q2."tokenId" AND q2."blockchainType" = '${deployment.blockchainType}'
), strategies_with_liquidity AS (
    SELECT (liquidity0 / POW(10, decimals0) * price0) AS liquidity 
    FROM strategies_with_prices 
    UNION 
    SELECT (liquidity1 / POW(10, decimals1) * price1) AS liquidity 
    FROM strategies_with_prices
), sum_liquidity AS (
    SELECT SUM(liquidity) AS current_liquidity 
    FROM strategies_with_liquidity
), strategies_created AS (
    SELECT COUNT(id) AS strategies_created 
    FROM "strategy-created-events"
    WHERE "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}'
), pairs_created AS (
    SELECT COUNT(id) AS pairs_created 
    FROM "pair-created-events"
    WHERE "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}'    
), unique_traders AS (
    SELECT COUNT(DISTINCT "callerId") AS unique_traders 
    FROM "tokens-traded-events"
    WHERE "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}'    
), active_pairs AS (
    SELECT COUNT(DISTINCT "pairId") AS active_pairs 
    FROM filtered_strategies
), number_trades AS (
    SELECT COUNT(*) AS number_trades 
    FROM "strategy-updated-events"
    WHERE "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}' AND "reason" = 1
), latest_updated_block AS (
    SELECT MIN("last_processed_block"."block") AS last_block, MIN("updatedAt") AS last_timestamp 
    FROM last_processed_block
    WHERE "param" LIKE '%${deployment.blockchainType}-${deployment.exchangeId}%'
), tokens_traded_with_token_info AS (
    SELECT tte."timestamp" AS timestamp, tte."transactionHash" AS transactionHash, tte."blockId" AS blockId, tte."trader" AS trader, tte."byTargetAmount" AS byTargetAmount, tte."sourceTokenId" AS sourceTokenId, tte."targetTokenId" AS targetTokenId, tte."sourceAmount" AS sourceAmount, tte."targetAmount" AS targetAmount, tte."tradingFeeAmount" AS tradingFeeAmount, ts."address" AS sourceAddress, ts."symbol" AS sourceSymbol, ts."decimals" AS sourceDecimals, tt."address" AS targetAddress, tt."symbol" AS targetSymbol, tt."decimals" AS targetDecimals 
    FROM "tokens-traded-events" tte 
    JOIN tokens ts ON tte."sourceTokenId" = ts."id" AND ts."blockchainType" = '${deployment.blockchainType}' AND ts."exchangeId" = '${deployment.exchangeId}'
    JOIN tokens tt ON tte."targetTokenId" = tt."id" AND tt."blockchainType" = '${deployment.blockchainType}' AND tt."exchangeId" = '${deployment.exchangeId}'
    WHERE tte."blockchainType" = '${deployment.blockchainType}' AND tte."exchangeId" = '${deployment.exchangeId}'

), correct_fee_units AS (
    SELECT trader, timestamp, targetSymbol, targetAddress, targetDecimals, targetTokenId, targetAmount::NUMERIC, tradingFeeAmount::NUMERIC, 
        CASE WHEN byTargetAmount = TRUE THEN sourceSymbol ELSE targetSymbol END AS feeSymbol, 
        CASE WHEN byTargetAmount = TRUE THEN sourceAddress ELSE targetAddress END AS feeAddress, 
        CASE WHEN byTargetAmount = TRUE THEN sourceDecimals ELSE targetDecimals END AS feeDecimals 
    FROM tokens_traded_with_token_info
), fee_volume_wo_decimals AS (
    SELECT timestamp, trader, feeSymbol, LOWER(feeAddress) AS feeAddress, tradingFeeAmount / POWER(10, feeDecimals) AS tradingFeeAmount_real, targetSymbol, LOWER(targetAddress) AS targetAddress, targetAmount / POWER(10, targetDecimals) AS targetAmount_real, DATE_TRUNC('day', timestamp) AS evt_day 
    FROM correct_fee_units
), prices AS (
    SELECT LOWER("tokenAddress") AS tokenAddress, MAX("usd"::NUMERIC) AS max_usd, DATE_TRUNC('day', "timestamp") AS timestamp_day 
    FROM "historic-quotes"
    WHERE "blockchainType" = '${deployment.blockchainType}'
    GROUP BY "tokenAddress", DATE_TRUNC('day', "timestamp")
), fee_usd AS (
    SELECT fvwd.*, COALESCE(pr.max_usd, 0) AS fee_usd, COALESCE(pr.max_usd * tradingFeeAmount_real, 0) AS tradingFeeAmount_usd 
    FROM fee_volume_wo_decimals fvwd 
    LEFT JOIN prices pr ON fvwd.feeAddress = pr.tokenAddress AND fvwd.evt_day = pr.timestamp_day
), volume_fee_usd AS (
    SELECT fu.*, COALESCE(pr.max_usd, 0) AS target_usd, COALESCE(pr.max_usd * targetAmount_real, 0) AS targetAmount_usd 
    FROM fee_usd fu 
    LEFT JOIN prices pr ON fu.targetAddress = pr.tokenAddress AND fu.evt_day = pr.timestamp_day
), fee_volume AS (
    SELECT SUM(tradingFeeAmount_usd) AS fees, SUM(targetamount_usd) AS volume 
    FROM volume_fee_usd
) 
SELECT sl.current_liquidity::NUMERIC, sc.strategies_created::INTEGER, pc.pairs_created::INTEGER, ut.unique_traders::INTEGER, ap.active_pairs::INTEGER, nt.number_trades::INTEGER, fv.volume::NUMERIC, fv.fees::NUMERIC, lub.last_block::INTEGER, lub.last_timestamp 
FROM sum_liquidity sl, strategies_created sc, pairs_created pc, unique_traders ut, active_pairs ap, number_trades nt, fee_volume fv, latest_updated_block lub;
    
    `;

    const result = await this.strategy.query(query);
    return result;
  }

  private async getTradesCount(deployment: Deployment): Promise<any> {
    const query = `
      SELECT 
        "strategyId" AS id, 
        COUNT(*) AS trade_count
      FROM "strategy-updated-events" s
      WHERE "blockchainType" = '${deployment.blockchainType}'
      AND "exchangeId" = '${deployment.exchangeId}'
      AND reason = 1
      GROUP BY "strategyId"
    `;

    const result = await this.strategy.query(query);
    return result;
  }

  private async getTrending(deployment: Deployment): Promise<any> {
    const totalTradeCountQuery = this.strategy.query(`
      SELECT 
          COUNT(*)::INT AS trade_count
      FROM "strategy-updated-events"
      WHERE "blockchainType" = '${deployment.blockchainType}'
      AND "exchangeId" = '${deployment.exchangeId}'
      AND "reason" = 1
    `);

    const tradeCountQuery = this.strategy.query(`
      WITH strategy_trade_24hcounts AS (
          SELECT 
              s."blockchainType" AS "blockchainType", 
              s."exchangeId" AS "exchangeId", 
              s."strategyId" AS id, 
              COUNT(s.*)::INT AS strategy_trades_24h
          FROM "strategy-updated-events" s
          WHERE s."timestamp" >= NOW() - INTERVAL '24 HOURS'
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
          AND s."reason" = 1
          GROUP BY 1, 2, 3   
      ),
      strategy_trade_counts AS (
          SELECT 
              s."blockchainType"::TEXT AS "blockchainType", 
              s."exchangeId"::TEXT AS "exchangeId", 
              s."strategyId" AS id, 
              COUNT(s.*)::INT AS strategy_trades
          FROM "strategy-updated-events" s
          WHERE s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
          AND s."reason" = 1
          GROUP BY 1, 2, 3   
      )
      SELECT 
          stc.id, 
          stc.strategy_trades, 
          COALESCE(sc24.strategy_trades_24h, 0) AS strategy_trades_24h, 
          t0.address AS token0, 
          t1.address AS token1, 
          t0.symbol AS symbol0, 
          t1.symbol AS symbol1, 
          t0.symbol || '/' || t1.symbol AS pair_symbol,
          t0.address || '/' || t1.address AS pair_addresses
      FROM strategy_trade_counts stc
      LEFT JOIN "strategy-created-events" s 
          ON s."strategyId" = stc.id 
      AND s."blockchainType"::TEXT = stc."blockchainType"::TEXT 
      AND s."exchangeId"::TEXT = stc."exchangeId"::TEXT
      LEFT JOIN tokens t0 
          ON t0.id = s."token0Id" 
      AND t0."blockchainType"::TEXT = stc."blockchainType"::TEXT 
      AND t0."exchangeId"::TEXT = stc."exchangeId"::TEXT
      LEFT JOIN tokens t1 
          ON t1.id = s."token1Id" 
      AND t1."blockchainType"::TEXT = stc."blockchainType"::TEXT 
      AND t1."exchangeId"::TEXT = stc."exchangeId"::TEXT
      LEFT JOIN strategy_trade_24hcounts sc24 
          ON sc24.id = stc.id 
      AND sc24."blockchainType" = stc."blockchainType"
      AND sc24."exchangeId" = stc."exchangeId"
      ORDER BY 2 DESC; 
    `);

    const pairCountQuery = this.strategy.query(`
      WITH pair_trade_24hcounts AS (
          SELECT 
              s."blockchainType" AS "blockchainType", 
              s."exchangeId" AS "exchangeId", 
              s."pairId" AS pair_id, 
              COUNT(s.*)::INT AS pair_trades_24h
          FROM "strategy-updated-events" s
          WHERE s."timestamp" >= NOW() - INTERVAL '24 HOURS'
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
          AND s."reason" = 1
          GROUP BY 1, 2, 3
      ),
      pair_counts AS (
          SELECT 
              s."blockchainType" AS "blockchainType", 
              s."exchangeId" AS "exchangeId", 
              s."pairId" AS pair_id, 
              COUNT(s.*)::INT AS pair_trades
          FROM "strategy-updated-events" s
          WHERE s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
          AND s."reason" = 1
          GROUP BY 1, 2, 3
      )
      SELECT 
          p.pair_id, 
          p.pair_trades, 
          COALESCE(pc24.pair_trades_24h, 0) AS pair_trades_24h, 
          t0."address" as token0, 
          t1."address" as token1, 
          t0.symbol AS symbol0, 
          t1.symbol AS symbol1, 
          t0.symbol || '/' || t1.symbol AS pair_symbol,
          t0."address" || '/' || t1."address" AS pair_addresses
      FROM pair_counts p
      LEFT JOIN "pairs" pc 
          ON pc."id" = p.pair_id  
      AND pc."blockchainType"::TEXT = p."blockchainType"::TEXT
      AND pc."exchangeId"::TEXT = p."exchangeId"::TEXT
      LEFT JOIN tokens t0 
          ON t0.id = pc."token0Id" 
      AND t0."blockchainType"::TEXT = p."blockchainType"::TEXT
      AND t0."exchangeId"::TEXT = p."exchangeId"::TEXT
      LEFT JOIN tokens t1 
          ON t1.id = pc."token1Id" 
      AND t1."blockchainType"::TEXT = p."blockchainType"::TEXT
      AND t1."exchangeId"::TEXT = p."exchangeId"::TEXT
      LEFT JOIN pair_trade_24hcounts pc24 
          ON pc24.pair_id = p.pair_id
      AND pc24."blockchainType" = p."blockchainType"
      AND pc24."exchangeId" = p."exchangeId"
      ORDER BY p.pair_trades DESC;
    `);

    const [totalTradeCount, tradeCount, pairCount] = await Promise.all([
      totalTradeCountQuery,
      tradeCountQuery,
      pairCountQuery,
    ]);

    return convertKeysToCamelCase({ totalTradeCount: totalTradeCount[0].trade_count, tradeCount, pairCount });
  }
}
