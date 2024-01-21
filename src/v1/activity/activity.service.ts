import { Inject, Injectable } from '@nestjs/common';
import { Strategy } from '../../strategy/strategy.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const ACTIVITY_CACHE_KEY = 'carbon:activity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async update(): Promise<void> {
    const activity = await this.getActivity();
    this.cacheManager.set(ACTIVITY_CACHE_KEY, activity);
  }

  async getCachedActivity(): Promise<any> {
    return this.cacheManager.get(ACTIVITY_CACHE_KEY);
  }

  private async getActivity(): Promise<any> {
    const query = `
    WITH created AS (
        SELECT timestamp as evt_block_time, "blockId" as evt_block_number, s.id as id, order0, order1, 
        t0.address as token0, t0.symbol as symbol0, t0.decimals as decimals0,
        t1.address as token1, t1.symbol as symbol1, t1.decimals as decimals1,
        2 as reason, s."transactionHash" as txhash
        FROM "strategy-created-events" s
        left join tokens t0 on t0.id = s."token0Id"
        left join tokens t1 on t1.id = s."token1Id"
    ),
    updated AS (
        SELECT timestamp as evt_block_time, "blockId" as evt_block_number, s."strategyId" as id, order0, order1, 
        t0.address as token0, t0.symbol as symbol0, t0.decimals as decimals0,
        t1.address as token1, t1.symbol as symbol1, t1.decimals as decimals1,
        reason, s."transactionHash" as txhash
        FROM "strategy-updated-events" s
        left join tokens t0 on t0.id = s."token0Id"
        left join tokens t1 on t1.id = s."token1Id"
    ),
    deleted AS (
        SELECT timestamp as evt_block_time, "blockId" as evt_block_number, s."strategyId" as id, order0, order1, 
        t0.address as token0, t0.symbol as symbol0, t0.decimals as decimals0,
        t1.address as token1, t1.symbol as symbol1, t1.decimals as decimals1,
        4 as reason, s."transactionHash" as txhash
        FROM "strategy-deleted-events" s
        left join tokens t0 on t0.id = s."token0Id"
        left join tokens t1 on t1.id = s."token1Id"
    ),
    all_txs AS (
        SELECT *
        FROM created
        UNION
        SELECT *
        FROM updated
        UNION
        SELECT *
        FROM deleted
    ),
    current_orders3 AS (
        SELECT *, 
        (CASE WHEN (order0::json->>'y') IS NOT NULL THEN (order0::json->>'y')::double precision ELSE 0 END) AS y0,
        (CASE WHEN (order1::json->>'y') IS NOT NULL THEN (order1::json->>'y')::double precision ELSE 0 END) AS y1,
        (CASE WHEN (order0::json->>'z') IS NOT NULL THEN (order0::json->>'z')::double precision ELSE 0 END) AS z0,
        (CASE WHEN (order1::json->>'z') IS NOT NULL THEN (order1::json->>'z')::double precision ELSE 0 END) AS z1,
        (CASE WHEN (order0::json->>'A') IS NOT NULL THEN (order0::json->>'A')::BIGINT ELSE 0 END) AS A0,
        (CASE WHEN (order1::json->>'A') IS NOT NULL THEN (order1::json->>'A')::BIGINT ELSE 0 END) AS A1,
        (CASE WHEN (order0::json->>'B') IS NOT NULL THEN (order0::json->>'B')::BIGINT ELSE 0 END) AS B0,
        (CASE WHEN (order1::json->>'B') IS NOT NULL THEN (order1::json->>'B')::BIGINT ELSE 0 END) AS B1
        FROM all_txs
    ),
    deletions_zero as (
    select evt_block_time, evt_block_number, id, token0, token1, reason,
            symbol0, decimals0, symbol1, decimals1, txhash,
        CASE WHEN reason = 4 THEN 0 ELSE y0 END as y0,
        CASE WHEN reason = 4 THEN 0 ELSE y1 END as y1,
        z0, z1, A0, A1, B0, B1
    from current_orders3
    ),
    current_orders4 AS (
        SELECT c.evt_block_time, c.evt_block_number, sce.owner as creation_wallet, c.id, c.token0, c.token1, c.reason, c.y0, c.y1,
            c.symbol0, c.decimals0, c.symbol1, c.decimals1,
            y0 / POW(10, decimals0) AS liquidity0,
            y1 / POW(10, decimals1) AS liquidity1,
            z0 / POW(10, decimals0) as capacity0,--yint
            z1 / POW(10, decimals1) as capacity1,--yint
            ((B0 % POW(2, 48)::BIGINT * POW(2, FLOOR(B0 / POW(2, 48))))) as B0_real, --decodeFloat (value % ONE) << (value // ONE)
            ((B1 % POW(2, 48)::BIGINT * POW(2, FLOOR(B1 / POW(2, 48))))) as B1_real, --decodeFloat (value % ONE) << (value // ONE)
            ((A0 % POW(2, 48)::BIGINT * POW(2, FLOOR(A0 / POW(2, 48))))) as A0_real, --decodeFloat (value % ONE) << (value // ONE)
            ((A1 % POW(2, 48)::BIGINT * POW(2, FLOOR(A1 / POW(2, 48))))) as A1_real, --decodeFloat (value % ONE) << (value // ONE)
            txhash
        FROM deletions_zero c
        left join "strategy-created-events" sce on sce.id = c.id
        --where c.id = CAST('{strategy_id}' as varchar)
        --where creation_wallet = CAST('{creation_wallet}' as varchar)
    ),
    order_lifespan AS (
        SELECT *,
            COALESCE((y0 - LAG(y0, 1) OVER (PARTITION BY id ORDER BY evt_block_number)) / POW(10, decimals0), 0) AS y0_delta,
            COALESCE((y1 - LAG(y1, 1) OVER (PARTITION BY id ORDER BY evt_block_number)) / POW(10, decimals1), 0) AS y1_delta,
            POW((B0_real)/POW(2,48)::BIGINT,2) * POW(10, (decimals1-decimals0)) as lowestRate0,
            POW((B0_real+A0_real)/POW(2,48)::BIGINT,2) * POW(10, (decimals1-decimals0)) as highestRate0,
            POW((B1_real)/POW(2,48)::BIGINT,2) * POW(10, (decimals0-decimals1)) as lowestRate1,
            POW((B1_real+A1_real)/POW(2,48)::BIGINT,2) * POW(10, (decimals0-decimals1)) as highestRate1
        FROM current_orders4
    ),
    dep_with AS (
        SELECT *,
            (CASE WHEN reason = 2 THEN liquidity0 ELSE 0 END) + (CASE WHEN (reason = 0 AND y0_delta > 0) THEN y0_delta ELSE 0 END) AS y0_deposited,
            (CASE WHEN reason = 2 THEN liquidity1 ELSE 0 END) + (CASE WHEN (reason = 0 AND y1_delta > 0) THEN y1_delta ELSE 0 END) AS y1_deposited,
            (CASE WHEN reason = 4 THEN -liquidity0 ELSE 0 END) + (CASE WHEN (reason = 0 AND y0_delta < 0) THEN y0_delta ELSE 0 END) AS y0_withdrawn,
            (CASE WHEN reason = 4 THEN -liquidity1 ELSE 0 END) + (CASE WHEN (reason = 0 AND y1_delta < 0) THEN y1_delta ELSE 0 END) AS y1_withdrawn,
            CAST(symbol0 as varchar) || '/' || CAST(symbol1 as varchar) as base_quote,
            CASE WHEN highestRate0=0 then 0 else 1/highestRate0 end as lowestRate0_norm,
            CASE WHEN lowestRate0=0 then 0 else 1/lowestRate0 end as highestRate0_norm,
            -- 1/highestRate0 as lowestRate0_norm, 1/marginalRate0 as marginalRate0_norm, 1/lowestRate0 as highestRate0_norm,
            lowestRate1 as lowestRate1_norm, highestRate1 as highestRate1_norm
        FROM order_lifespan
    ),
    descriptions AS (
        SELECT *,
            CASE 
                WHEN reason = 2 THEN 'Created' 
                WHEN reason = 0 AND y0_delta > 0 THEN 'Deposited TKN0'
                WHEN reason = 0 AND y1_delta > 0 THEN 'Deposited TKN1'
                WHEN reason = 0 AND y0_delta < 0 THEN 'Withdrew TKN0'
                WHEN reason = 0 AND y1_delta < 0 THEN 'Withdrew TKN1'
                WHEN reason = 0 AND (y0_delta = 0 AND y1_delta = 0) THEN 'Updated Price'
                WHEN reason = 1 THEN 'Trade Occurred'
                WHEN reason = 4 THEN 'Deleted'
                ELSE '0' 
            END AS descr
        FROM dep_with
    ),
    
    all_trades as (
    select id,
        CASE WHEN y0_delta < 0 then -y0_delta else -y1_delta end as strategy_sold,
        CASE WHEN y0_delta < 0 then symbol0 else symbol1 end as token_sold,
        CASE WHEN y0_delta >= 0 then y0_delta else y1_delta end as strategy_bought,
        CASE WHEN y0_delta >= 0 then symbol0 else symbol1 end as token_bought,
        txhash
    from order_lifespan 
    where reason = 1
    and y0_delta != 0
    and y1_delta != 0
    ),
    trade_info as (
    select d.*, a.strategy_sold, a.token_sold, a.strategy_bought, a.token_bought, 
    a.strategy_bought/a.strategy_sold as effective_price, a.token_sold||'/'||a.token_bought as trade_base_quote,
    a.strategy_sold/a.strategy_bought as effective_price_inv, a.token_bought||'/'||a.token_sold as inv_trade_base_quote
    from descriptions d
    left join all_trades a on a.txhash = d.txhash and a.id = d.id
    ),
    complete_info as (
    select *,
    CASE WHEN base_quote = trade_base_quote THEN effective_price ELSE effective_price_inv END as avg_price,
    CASE 
        WHEN descr = 'Trade Occurred' and token_sold = symbol0 THEN 'Sell High'
        WHEN descr = 'Trade Occurred' and token_sold != symbol0 THEN 'Buy Low' 
        WHEN descr = 'Created' THEN 'Create Strategy'
        WHEN descr = 'Deposited TKN0' THEN 'Deposit'
        WHEN descr = 'Deposited TKN1' THEN 'Deposit'
        WHEN descr = 'Withdrew TKN0' THEN 'Withdraw'
        WHEN descr = 'Withdrew TKN1' THEN 'Withdraw'
        WHEN descr = 'Updated Price' THEN 'Edit Price'
        ELSE descr
    END as action
    from trade_info
    )
    select
    creation_wallet, id, action, base_quote, symbol0 as base_sell_token, symbol1 as quote_buy_token, liquidity1 as buy_budget, liquidity0 as sell_budget, y1_delta as buy_budget_change, y0_delta as sell_budget_change,
    lowestrate1_norm as buy_price_a, highestrate1_norm as buy_price_b, lowestrate0_norm as sell_price_a, highestrate0_norm as sell_price_b,
    strategy_sold, token_sold, strategy_bought, token_bought, avg_price, evt_block_time as date, txhash
    from complete_info
    order by evt_block_number asc
    `;

    const result = await this.strategy.query(query);
    return transformKeysToCamelCase(result);
  }
}

const transformKeysToCamelCase = (arr: any[]): any[] =>
  arr.map((obj) =>
    Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]),
    ),
  );