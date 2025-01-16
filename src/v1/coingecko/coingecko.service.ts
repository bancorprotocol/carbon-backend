import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy } from '../../strategy/strategy.entity';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Deployment } from '../../deployment/deployment.service';

const TICKERS_CACHE_KEY_SUFFIX = 'coingecko:tickers';

@Injectable()
export class CoingeckoService {
  constructor(
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async update(deployment: Deployment): Promise<void> {
    const tickers = await this.getTickers(deployment);
    await this.cacheManager.set(
      `${deployment.blockchainType}:${deployment.exchangeId}:${TICKERS_CACHE_KEY_SUFFIX}`,
      tickers,
    );
  }

  async getCachedTickers(deployment: Deployment): Promise<any> {
    return this.cacheManager.get(`${deployment.blockchainType}:${deployment.exchangeId}:${TICKERS_CACHE_KEY_SUFFIX}`);
  }

  private async getTickers(deployment: Deployment): Promise<any> {
    const query = `with created_pairs as (
          Select token0, token1, 
          CAST(token0 as varchar) || '_' || CAST(token1 as varchar) as native_pair,
          LEAST(CAST(token0 as varchar), CAST(token1 as varchar)) || '_' || GREATEST(CAST(token0 as varchar), CAST(token1 as varchar)) AS pair_alpha
          from "pair-created-events"
          where "blockchainType" = '${deployment.blockchainType}' and "exchangeId" = '${deployment.exchangeId}'
      ),
      all_carbon_trades as (
          Select s."timestamp" as evt_block_time, s."sourceAmount", t0.address as sourceToken, s."targetAmount", t1.address as targetToken,
          s."sourceAmount"::double precision/pow(10,t0.decimals) as sourceAmount_real,
          s."targetAmount"::double precision/pow(10,t1.decimals) as targetAmount_real,
          CASE WHEN s."sourceAmount"::double precision = 0 THEN 0 ELSE (s."targetAmount"::double precision/pow(10,t1.decimals)) / (s."sourceAmount"::double precision/pow(10,t0.decimals)) END as rate,
          LEAST(CAST(t0.address as varchar), CAST(t1.address as varchar)) || '_' || GREATEST(CAST(t0.address as varchar), CAST(t1.address as varchar)) AS pair_alpha
          from "tokens-traded-events" s
          left join tokens t0 on t0.id = s."sourceTokenId" and t0."blockchainType" = '${deployment.blockchainType}' and t0."exchangeId" = '${deployment.exchangeId}'
          left join tokens t1 on t1.id = s."targetTokenId" and t1."blockchainType" = '${deployment.blockchainType}' and t1."exchangeId" = '${deployment.exchangeId}'
          where s."blockchainType" = '${deployment.blockchainType}' and s."exchangeId" = '${deployment.exchangeId}'
      ),
      carbon_trades_24h as (
          select evt_block_time, sourceAmount_real, sourceToken, targetAmount_real, targetToken, tt.pair_alpha, native_pair, rate,
              CASE
                  WHEN CAST(tt.sourceToken as varchar) || '_' || CAST(tt.targetToken as varchar) = native_pair then rate
                  ELSE 1/rate 
              END as ordered_rate
          from all_carbon_trades tt
          left join created_pairs p on p.pair_alpha = tt.pair_alpha
          where evt_block_time >= current_timestamp - interval '24' hour
          order by evt_block_time desc
      ),
      hi_lo as (
          SELECT native_pair, min(ordered_rate) as low, max(ordered_rate) as high
          from carbon_trades_24h
          group by 1
      ),
      recent_trade AS (
          SELECT *,
          ROW_NUMBER() OVER (PARTITION BY pair_alpha ORDER BY evt_block_time DESC) AS rn
          FROM all_carbon_trades
      ),
      recent_rate as (
          SELECT pair_alpha, sourceToken, targetToken, rate
          FROM recent_trade
          WHERE rn <= 1
      ),
      grouped_volume as (
          select pair_alpha, sourceToken, targetToken, sum(sourceAmount_real) as source_vol, sum(targetAmount_real) as target_vol
          from carbon_trades_24h
          group by 1,2,3
      ),
      correct_directions as (
          select *, 
              CASE
                  WHEN CAST(v.sourceToken as varchar) || '_' || CAST(v.targetToken as varchar) = native_pair then source_vol 
                  ELSE target_vol 
              END as token0_vol,
              CASE
                  WHEN CAST(v.sourceToken as varchar) || '_' || CAST(v.targetToken as varchar) = native_pair then target_vol 
                  ELSE source_vol 
              END as token1_vol,
              CASE
                  WHEN rate = 0 then 0
                  WHEN CAST(r.sourceToken as varchar) || '_' || CAST(r.targetToken as varchar) = native_pair then rate
                  ELSE 1/rate
              END as last_price
          from created_pairs p
          left join grouped_volume v on v.pair_alpha = p.pair_alpha
          left join recent_rate r on r.pair_alpha = p.pair_alpha
      ),
      aggregated as (
          select native_pair, token0, token1, last_price, sum(token0_vol) as token0_vol, sum(token1_vol) as token1_vol
          from correct_directions
          group by 1,2,3,4
      ),
      prefinal as (
          select  native_pair as pair,
                  token0 as base_currency, t0.symbol as base_symbol, token0_vol as base_volume,
                  token1 as target_currency, t1.symbol as quote_symbol, token1_vol as target_volume,
                  last_price
          from aggregated a
          left join tokens t0 on t0.address = a.token0 and t0."blockchainType" = '${deployment.blockchainType}' and t0."exchangeId" = '${deployment.exchangeId}'
          left join tokens t1 on t1.address = a.token1 and t1."blockchainType" = '${deployment.blockchainType}' and t1."exchangeId" = '${deployment.exchangeId}'
          order by target_volume
      ),
      trade_data as (
          select base_symbol, quote_symbol, pair as ticker_id, base_currency, target_currency,
              CASE 
                  WHEN last_price is NULL THEN 0.0
                  ELSE last_price                
              END as last_price,  
              CASE 
                  WHEN base_volume is NULL THEN 0.0
                  ELSE base_volume                
              END as base_volume,  
              CASE 
                  WHEN target_volume is NULL THEN 0.0
                  ELSE target_volume                
              END as target_volume
          from prefinal
      ),
      raw_pairs as (
          Select p.id as "pairId", p.name, 
          CAST(t0.address as varchar) || '_' || CAST(t1.address as varchar) as native_pair,
          p."token0Id", t0.address as token0, t0.symbol as symbol0, t0.decimals as decimals0, 
          p."token1Id", t1.address as token1, t1.symbol as symbol1, t1.decimals as decimals1
          from "pairs" p
          left join tokens t0 on t0.id = p."token0Id" and t0."blockchainType" = '${deployment.blockchainType}' and t0."exchangeId" = '${deployment.exchangeId}'
          left join tokens t1 on t1.id = p."token1Id" and t1."blockchainType" = '${deployment.blockchainType}' and t1."exchangeId" = '${deployment.exchangeId}'
          where p."blockchainType" = '${deployment.blockchainType}' and p."exchangeId" = '${deployment.exchangeId}'
      ),
      raw_strategies as (
          Select 
              s."id", s."deleted", 
              s."liquidity0"::double precision, 
              s."lowestRate0"::double precision/POW(10, t0.decimals-t1.decimals) as "lowestRate0",
              s."highestRate0"::double precision/POW(10, t0.decimals-t1.decimals) as "highestRate0",
              s."marginalRate0"::double precision/POW(10, t0.decimals-t1.decimals) as "marginalRate0",
              s."liquidity1"::double precision, 
              s."lowestRate1"::double precision/POW(10, t1.decimals-t0.decimals) as "lowestRate1",
              s."highestRate1"::double precision/POW(10, t1.decimals-t0.decimals) as "highestRate1",
              s."marginalRate1"::double precision/POW(10, t1.decimals-t0.decimals) as "marginalRate1",
              s."pairId", s."token0Id", s."token1Id", CAST(t0.address as varchar) || '_' || CAST(t1.address as varchar) as pair_alpha,
              s."token0Id", t0.address as token0, t0.decimals as decimals0, 
              s."token1Id", t1.address as token1, t1.decimals as decimals1
          from "strategies" s
          left join tokens t0 on t0.id = s."token0Id" and t0."blockchainType" = '${deployment.blockchainType}' and t0."exchangeId" = '${deployment.exchangeId}'
          left join tokens t1 on t1.id = s."token1Id" and t1."blockchainType" = '${deployment.blockchainType}' and t1."exchangeId" = '${deployment.exchangeId}'
          where s."blockchainType" = '${deployment.blockchainType}' and s."exchangeId" = '${deployment.exchangeId}'
      ),
      order_flipping as (
          Select s.id, s.deleted, p.name as pair_name, p.native_pair, p."pairId", 
          p."token0Id", p.token0, p.symbol0, p.decimals0, 
          p."token1Id", p.token1, p.symbol1, p.decimals1, 
          CASE WHEN native_pair = pair_alpha THEN s."liquidity0" ELSE s."liquidity1" END as "liquidity0_new",
          CASE WHEN native_pair = pair_alpha THEN s."liquidity1" ELSE s."liquidity0" END as "liquidity1_new",
          CASE WHEN native_pair = pair_alpha THEN s."lowestRate0" ELSE s."lowestRate1" END as "lowestRate0_new",
          CASE WHEN native_pair = pair_alpha THEN s."lowestRate1" ELSE s."lowestRate0" END as "lowestRate1_new",
          CASE WHEN native_pair = pair_alpha THEN s."highestRate0" ELSE s."highestRate1" END as "highestRate0_new",
          CASE WHEN native_pair = pair_alpha THEN s."highestRate1" ELSE s."highestRate0" END as "highestRate1_new",
          CASE WHEN native_pair = pair_alpha THEN s."marginalRate0" ELSE s."marginalRate1" END as "marginalRate0_new",
          CASE WHEN native_pair = pair_alpha THEN s."marginalRate1" ELSE s."marginalRate0" END as "marginalRate1_new"
          from raw_pairs p
          left join raw_strategies s on p."pairId" = s."pairId"
          where deleted = False
      ),
      current_order_pair_stats as (
          select o.id, o.deleted, o.pair_name, o.native_pair, o."pairId", 
              o."token0Id", o.token0, o.symbol0, o.decimals0, q0.usd as price0, 
              o."token1Id", o.token1, o.symbol1, o.decimals1, q1.usd as price1,
              o."liquidity0_new" as "liquidity0",
              o."liquidity1_new" as "liquidity1",
              o."lowestRate0_new" as "lowestRate0",
              o."lowestRate1_new" as "lowestRate1",
              o."highestRate0_new" as "highestRate0",
              o."highestRate1_new" as "highestRate1",
              o."marginalRate0_new" as "marginalRate0",
              o."marginalRate1_new" as "marginalRate1",
              CASE WHEN liquidity0_new = 0 THEN 0 ELSE liquidity0_new/POW(10,decimals0) END as "liquidity0_real",
              CASE WHEN liquidity1_new = 0 THEN 0 ELSE liquidity1_new/POW(10,decimals1) END as "liquidity1_real"
          from order_flipping o
          left join quotes q0 on q0."tokenId" = o."token0Id"  
          left join quotes q1 on q1."tokenId" = o."token1Id"
      ),
      current_strategy_tvl as (
          SELECT *, liquidity0_real * price0::double precision as TVL0_usd, liquidity1_real * price1::double precision as TVL1_usd, 
          liquidity0_real * price0::double precision + liquidity1_real * price1::double precision as strategy_TVL_usd
          FROM current_order_pair_stats   
      ),
      pair_tvls as (
          select native_pair, sum(strategy_TVL_usd) as liquidity_in_usd
          from current_strategy_tvl
          group by 1
      ),
      marginalRates as (
          select native_pair, id, token0, token1, liquidity0, liquidity1,
          s."lowestRate0", s."highestRate0", s."marginalRate0", s."lowestRate1", s."highestRate1", s."marginalRate1"
          from current_order_pair_stats s
      ),
      add_sqrts as (
          select *,
              POW(s."lowestRate0"::double precision,0.5) as lowestRate0_sqrt,
              POW(s."marginalRate0"::double precision,0.5) as marginalRate0_sqrt,
              POW(s."lowestRate1"::double precision,0.5) as lowestRate1_sqrt,
              POW(s."marginalRate1"::double precision,0.5) as marginalRate1_sqrt
          from marginalRates s
      ),
      pair_mins_maxs as (
          select native_pair as native_pairs, min(s."lowestRate0") as minRate0_low, max(s."marginalRate0") as maxRate0_marg, min(s."lowestRate1") as minRate1_low,  max(s."marginalRate1") as maxRate1_marg
          from marginalRates s
          group by 1
      ),
      add_2percs as (
          select *,
              POW( maxRate0_marg::double precision * (100-2)/100, 0.5) as rate0_min2perc_sqrt, -- this is a rate increase of 2%
              POW( maxRate1_marg::double precision * (100-2)/100, 0.5) as rate1_min2perc_sqrt
          from pair_mins_maxs
      ),
      add_volume_per_order as (
          select *,
              CASE 
                  WHEN rate0_min2perc_sqrt <= lowestRate0_sqrt then liquidity0::double precision
                  WHEN rate0_min2perc_sqrt >= marginalRate0_sqrt then 0
                  ELSE liquidity0::double precision * (marginalRate0_sqrt - rate0_min2perc_sqrt) / (marginalRate0_sqrt - lowestRate0_sqrt)
              END as volume0_min2perc,
              CASE 
                  WHEN rate1_min2perc_sqrt <= lowestRate1_sqrt then liquidity1::double precision
                  WHEN rate1_min2perc_sqrt >= marginalRate1_sqrt then 0
                  ELSE liquidity1::double precision * (marginalRate1_sqrt - rate1_min2perc_sqrt) / (marginalRate1_sqrt - lowestRate1_sqrt)
              END as volume1_min2perc
          from add_sqrts s
          left join add_2percs p on p.native_pairs = s.native_pair
      ),
      add_volume_per_order_prices as (
          select *, q0.usd as price0, q1.usd as price1, 
          volume0_min2perc/POW(10,t0.decimals) as volume0_min2perc_real,
          volume0_min2perc/POW(10,t0.decimals) * q0.usd::double precision as volume0_min2perc_usd,
          volume1_min2perc/POW(10,t1.decimals) as volume1_min2perc_real,
          volume1_min2perc/POW(10,t1.decimals) * q1.usd::double precision as volume1_min2perc_usd
          from add_volume_per_order p
          left join tokens t0 on t0.address = p.token0 and t0."blockchainType" = '${deployment.blockchainType}' and t0."exchangeId" = '${deployment.exchangeId}'
          left join tokens t1 on t1.address = p.token1 and t1."blockchainType" = '${deployment.blockchainType}' and t1."exchangeId" = '${deployment.exchangeId}'
          left join quotes q0 on q0."tokenId" = t0."id" and q0."blockchainType" = '${deployment.blockchainType}'
          left join quotes q1 on q1."tokenId" = t1."id" and q1."blockchainType" = '${deployment.blockchainType}'
      ),
      plus2_min2s as (
          select native_pair, sum(volume0_min2perc_real) as volume0_min2perc_tkn, sum(volume1_min2perc_real) as volume1_min2perc_tkn, sum(volume0_min2perc_usd) as volume0_min2perc_usd, sum(volume1_min2perc_usd) as volume1_min2perc_usd
          from add_volume_per_order_prices
          group by 1
      ),
      rate0s as (
          select native_pair, min(1/m."marginalRate0"::double precision) as ask
          from marginalRates m 
          where m."marginalRate0"::double precision > 0 and liquidity0::double precision > 0
          group by 1
      ),
      rate1s as (
          select native_pair, max(m."marginalRate1"::double precision) as bid
          from marginalRates m
          where m."marginalRate1"::double precision > 0 and liquidity1::double precision > 0 
          group by 1
      )
      select 
              base_symbol, quote_symbol, 
              ticker_id, base_currency, target_currency, last_price, base_volume, target_volume, liquidity_in_usd, bid, ask, high, low,
              --volume0_min2perc_tkn as plus2_tkn, -- the amount of token0 that would be SOLD to increase the price by 2%
              --volume1_min2perc_tkn as minus2_tkn, -- the amount of token1 that would be SOLD to increase the price by 2%
              volume0_min2perc_usd as plus2, -- the usd value of token0 that would be SOLD to increase the price by 2%
              volume1_min2perc_usd as minus2 -- the usd value of token1 that would be SOLD to decrease the price by 2%
      from trade_data t
      left join hi_lo h on h.native_pair = t.ticker_id
      left join pair_tvls p on p.native_pair = t.ticker_id
      left join rate0s r0 on r0.native_pair = t.ticker_id
      left join rate1s r1 on r1.native_pair = t.ticker_id
      left join plus2_min2s pl on pl.native_pair = t.ticker_id
`;

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
