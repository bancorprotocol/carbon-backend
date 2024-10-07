import { Inject, Injectable } from '@nestjs/common';
import { Strategy } from '../../strategy/strategy.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Deployment } from '../../deployment/deployment.service';

const ANALYTICS_GENERIC_METRICS_KEY = 'carbon:generic-metrics';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async update(deployment: Deployment): Promise<void> {
    const generic = await this.getGenericMetrics(deployment);
    this.cacheManager.set(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_GENERIC_METRICS_KEY}`,
      generic,
    );
  }

  async getCachedGenericMetrics(deployment: Deployment): Promise<any> {
    return this.cacheManager.get(
      `${deployment.exchangeId}:${deployment.blockchainType}:${ANALYTICS_GENERIC_METRICS_KEY}`,
    );
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
    LEFT JOIN tokens ts0 ON fs."token0Id" = ts0.id 
    LEFT JOIN tokens ts1 ON fs."token1Id" = ts1.id
), strategies_with_prices AS (
    SELECT swd.liquidity0::NUMERIC, decimals0::NUMERIC, swd."token0Id", q1.usd::NUMERIC AS price0, swd.liquidity1::NUMERIC, decimals1::NUMERIC, swd."token1Id", q2.usd::NUMERIC AS price1 
    FROM strategies_with_decimals swd 
    LEFT JOIN quotes q1 ON swd."token0Id" = q1."tokenId" 
    LEFT JOIN quotes q2 ON swd."token1Id" = q2."tokenId"
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
    SELECT COUNT("id") AS number_trades 
    FROM "tokens-traded-events"
    WHERE "blockchainType" = '${deployment.blockchainType}' AND "exchangeId" = '${deployment.exchangeId}'    
), latest_updated_block AS (
    SELECT MIN("last_processed_block"."block") AS last_block, MIN("updatedAt") AS last_timestamp 
    FROM last_processed_block
), tokens_traded_with_token_info AS (
    SELECT tte."timestamp" AS timestamp, tte."transactionHash" AS transactionHash, tte."blockId" AS blockId, tte."trader" AS trader, tte."byTargetAmount" AS byTargetAmount, tte."sourceTokenId" AS sourceTokenId, tte."targetTokenId" AS targetTokenId, tte."sourceAmount" AS sourceAmount, tte."targetAmount" AS targetAmount, tte."tradingFeeAmount" AS tradingFeeAmount, ts."address" AS sourceAddress, ts."symbol" AS sourceSymbol, ts."decimals" AS sourceDecimals, tt."address" AS targetAddress, tt."symbol" AS targetSymbol, tt."decimals" AS targetDecimals 
    FROM "tokens-traded-events" tte 
    JOIN tokens ts ON tte."sourceTokenId" = ts."id" 
    JOIN tokens tt ON tte."targetTokenId" = tt."id"
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
}
