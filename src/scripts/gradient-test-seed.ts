/**
 * Gradient Test Seed Script
 *
 * Inserts realistic gradient strategy data into the local database
 * so that the running server returns mixed regular + gradient API responses.
 *
 * Uses parameters from carbon-gradients-contracts tradeTestData.json (all 6 gradient types).
 *
 * Prerequisites:
 *   - Local PostgreSQL with carbon-backend schema (run the server with DB_SYNC=1 once)
 *   - DATABASE_URL env var set
 *
 * Usage:
 *   npx ts-node src/scripts/gradient-test-seed.ts
 *   npx ts-node src/scripts/gradient-test-seed.ts --clean   # remove seeded data first
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const BLOCKCHAIN_TYPE = 'ethereum';
const EXCHANGE_ID = 'ethereum';

const GRADIENT_TYPE_NAMES = [
  'LINEAR_INCREASE',
  'LINEAR_DECREASE',
  'LINEAR_INV_INCREASE',
  'LINEAR_INV_DECREASE',
  'EXPONENTIAL_INCREASE',
  'EXPONENTIAL_DECREASE',
];

const TOKEN0 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC
const TOKEN1 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
const OWNER = '0x0000000000000000000000000000000000GRAD01';
const BLOCK_NUMBER = 24571200;

const STRATEGIES = [
  { gradientType: '0', order0Liq: '45600000000000000000000', order1Liq: '12300000000000000000000' },
  { gradientType: '1', order0Liq: '45600000000000000000000', order1Liq: '12300000000000000000000' },
  { gradientType: '2', order0Liq: '45600000000000000000000', order1Liq: '12300000000000000000000' },
  { gradientType: '3', order0Liq: '45600000000000000000000', order1Liq: '12300000000000000000000' },
  { gradientType: '4', order0Liq: '45600000000000000000000', order1Liq: '12300000000000000000000' },
  { gradientType: '5', order0Liq: '45600000000000000000000', order1Liq: '12300000000000000000000' },
];

const COMMON_ORDER = {
  initialRate: '6001066667089',
  tradingStartTime: 1730329400,
  expiry: 1767586793,
  multiFactor: '2814749',
};

const COMMON_ORDER1 = {
  initialRate: '1897467523720620',
  tradingStartTime: 1730329400,
  expiry: 1767586793,
  multiFactor: '2814749',
};

function strategyId(index: number): string {
  return `1157920892373161954235709850086879078532699846656405640394575840079131296399${37 + index}`;
}

async function lookupTokenAndPairIds(client: Client): Promise<{ token0Id: number | null; token1Id: number | null; pairId: number | null }> {
  const t0Res = await client.query(
    `SELECT id FROM tokens WHERE LOWER(address) = LOWER($1) AND "exchangeId" = $2 LIMIT 1`,
    [TOKEN0, EXCHANGE_ID],
  );
  const t1Res = await client.query(
    `SELECT id FROM tokens WHERE LOWER(address) = LOWER($1) AND "exchangeId" = $2 LIMIT 1`,
    [TOKEN1, EXCHANGE_ID],
  );
  const token0Id = t0Res.rows[0]?.id || null;
  const token1Id = t1Res.rows[0]?.id || null;

  let pairId: number | null = null;
  if (token0Id && token1Id) {
    const pRes = await client.query(
      `SELECT id FROM pairs WHERE "token0Id" = $1 AND "token1Id" = $2 AND "exchangeId" = $3 LIMIT 1`,
      [token0Id, token1Id, EXCHANGE_ID],
    );
    if (pRes.rows.length === 0) {
      const pRes2 = await client.query(
        `SELECT id FROM pairs WHERE "token0Id" = $1 AND "token1Id" = $2 AND "exchangeId" = $3 LIMIT 1`,
        [token1Id, token0Id, EXCHANGE_ID],
      );
      pairId = pRes2.rows[0]?.id || null;
    } else {
      pairId = pRes.rows[0].id;
    }
  }

  console.log(`  Resolved token0Id=${token0Id}, token1Id=${token1Id}, pairId=${pairId}`);
  return { token0Id, token1Id, pairId };
}

async function clean(client: Client) {
  console.log('Cleaning existing gradient test data...');

  for (const table of [
    'gradient_strategies',
    'gradient_strategy_realtime',
    'gradient_strategy_created_events',
    'gradient_strategy_updated_events',
    'gradient_strategy_deleted_events',
    'gradient_strategy_liquidity_updated_events',
    'gradient_trading_fee_ppm_events',
    'gradient_pair_trading_fee_ppm_events',
  ]) {
    await client.query(`DELETE FROM "${table}" WHERE "blockchainType" = $1 AND "exchangeId" = $2`, [
      BLOCKCHAIN_TYPE,
      EXCHANGE_ID,
    ]);
  }

  await client.query(
    `DELETE FROM "activities-v2" WHERE "blockchainType" = $1 AND "exchangeId" = $2 AND "currentOwner" = $3`,
    [BLOCKCHAIN_TYPE, EXCHANGE_ID, OWNER],
  );
  await client.query(
    `DELETE FROM "dex-screener-events-v2" WHERE "blockchainType" = $1 AND "exchangeId" = $2 AND "maker" = $3`,
    [BLOCKCHAIN_TYPE, EXCHANGE_ID, OWNER],
  );

  console.log('Cleaned.');
}

async function seedRealtimeStrategies(client: Client) {
  console.log('Seeding gradient_strategy_realtime...');

  for (let i = 0; i < STRATEGIES.length; i++) {
    const s = STRATEGIES[i];
    const id = strategyId(i);

    await client.query(
      `INSERT INTO "gradient_strategy_realtime"
        ("blockchainType", "exchangeId", "strategyId", "owner",
         "token0Address", "token1Address",
         "order0Liquidity", "order0InitialPrice", "order0TradingStartTime", "order0Expiry", "order0MultiFactor", "order0GradientType",
         "order1Liquidity", "order1InitialPrice", "order1TradingStartTime", "order1Expiry", "order1MultiFactor", "order1GradientType",
         "deleted")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT ("blockchainType","exchangeId","strategyId") DO UPDATE SET
         "order0Liquidity"=EXCLUDED."order0Liquidity",
         "order0GradientType"=EXCLUDED."order0GradientType",
         "order1Liquidity"=EXCLUDED."order1Liquidity",
         "order1GradientType"=EXCLUDED."order1GradientType",
         "deleted"=false`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, id, OWNER,
        TOKEN0, TOKEN1,
        s.order0Liq, COMMON_ORDER.initialRate, COMMON_ORDER.tradingStartTime, COMMON_ORDER.expiry, COMMON_ORDER.multiFactor, s.gradientType,
        s.order1Liq, COMMON_ORDER1.initialRate, COMMON_ORDER1.tradingStartTime, COMMON_ORDER1.expiry, COMMON_ORDER1.multiFactor, s.gradientType,
        false,
      ],
    );

    console.log(`  [${i + 1}/6] Strategy ${id} (${GRADIENT_TYPE_NAMES[i]})`);
  }
}

async function seedCreatedEvents(client: Client, token0Id: number | null, token1Id: number | null, pairId: number | null) {
  console.log('Seeding gradient_strategy_created_events...');

  for (let i = 0; i < STRATEGIES.length; i++) {
    const s = STRATEGIES[i];
    const id = strategyId(i);
    const txHash = `0x${'gradient_created_'.padEnd(64, i.toString())}`;

    await client.query(
      `INSERT INTO "gradient_strategy_created_events"
        ("blockchainType", "exchangeId", "strategyId", "blockId",
         "transactionHash", "transactionIndex", "logIndex",
         "token0Id", "token1Id", "pairId", "owner",
         "order0Liquidity", "order0InitialPrice", "order0TradingStartTime", "order0Expiry", "order0MultiFactor", "order0GradientType",
         "order1Liquidity", "order1InitialPrice", "order1TradingStartTime", "order1Expiry", "order1MultiFactor", "order1GradientType")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT ("transactionIndex","transactionHash","logIndex") DO NOTHING`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, id, BLOCK_NUMBER,
        txHash, i, i,
        token0Id, token1Id, pairId, OWNER,
        s.order0Liq, COMMON_ORDER.initialRate, COMMON_ORDER.tradingStartTime, COMMON_ORDER.expiry, COMMON_ORDER.multiFactor, s.gradientType,
        s.order1Liq, COMMON_ORDER1.initialRate, COMMON_ORDER1.tradingStartTime, COMMON_ORDER1.expiry, COMMON_ORDER1.multiFactor, s.gradientType,
      ],
    );
  }
}

async function seedGradientStrategies(client: Client) {
  console.log('Seeding gradient_strategies...');

  for (let i = 0; i < STRATEGIES.length; i++) {
    const s = STRATEGIES[i];
    const id = strategyId(i);

    await client.query(
      `INSERT INTO "gradient_strategies"
        ("blockchainType", "exchangeId", "strategyId", "token0", "token1", "owner",
         "order0Liquidity", "order0InitialPrice", "order0TradingStartTime", "order0Expiry", "order0MultiFactor", "order0GradientType",
         "order1Liquidity", "order1InitialPrice", "order1TradingStartTime", "order1Expiry", "order1MultiFactor", "order1GradientType",
         "blockNumber", "deleted")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT ("blockchainType","exchangeId","strategyId") DO UPDATE SET
         "order0Liquidity"=EXCLUDED."order0Liquidity",
         "order0GradientType"=EXCLUDED."order0GradientType",
         "order1Liquidity"=EXCLUDED."order1Liquidity",
         "order1GradientType"=EXCLUDED."order1GradientType",
         "deleted"=false`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, id, TOKEN0, TOKEN1, OWNER,
        s.order0Liq, COMMON_ORDER.initialRate, COMMON_ORDER.tradingStartTime, COMMON_ORDER.expiry, COMMON_ORDER.multiFactor, s.gradientType,
        s.order1Liq, COMMON_ORDER1.initialRate, COMMON_ORDER1.tradingStartTime, COMMON_ORDER1.expiry, COMMON_ORDER1.multiFactor, s.gradientType,
        BLOCK_NUMBER, false,
      ],
    );
  }

  console.log('  6 gradient strategies inserted');
}

async function seedUpdatedEvents(client: Client, token0Id: number | null, token1Id: number | null, pairId: number | null) {
  console.log('Seeding gradient_strategy_updated_events (manual edits)...');

  for (let i = 0; i < STRATEGIES.length; i++) {
    const s = STRATEGIES[i];
    const id = strategyId(i);

    for (let t = 0; t < 2; t++) {
      const txHash = `0x${'gradient_edit_'.padEnd(62, `${i}${t}`)}`;

      await client.query(
        `INSERT INTO "gradient_strategy_updated_events"
          ("blockchainType", "exchangeId", "strategyId", "blockId",
           "transactionHash", "transactionIndex", "logIndex",
           "token0Id", "token1Id", "pairId",
           "order0Liquidity", "order0InitialPrice", "order0TradingStartTime", "order0Expiry", "order0MultiFactor", "order0GradientType",
           "order1Liquidity", "order1InitialPrice", "order1TradingStartTime", "order1Expiry", "order1MultiFactor", "order1GradientType")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT ("transactionIndex","transactionHash","logIndex") DO NOTHING`,
        [
          BLOCKCHAIN_TYPE, EXCHANGE_ID, id, BLOCK_NUMBER + t + 1,
          txHash, i, t,
          token0Id, token1Id, pairId,
          s.order0Liq, COMMON_ORDER.initialRate, COMMON_ORDER.tradingStartTime, COMMON_ORDER.expiry, COMMON_ORDER.multiFactor, s.gradientType,
          s.order1Liq, COMMON_ORDER1.initialRate, COMMON_ORDER1.tradingStartTime, COMMON_ORDER1.expiry, COMMON_ORDER1.multiFactor, s.gradientType,
        ],
      );
    }
  }
}

async function seedLiquidityUpdatedEvents(client: Client, token0Id: number | null, token1Id: number | null, pairId: number | null) {
  console.log('Seeding gradient_strategy_liquidity_updated_events (trade events)...');

  const timestamp = new Date(Date.now() - 3600000);

  for (let i = 0; i < STRATEGIES.length; i++) {
    const s = STRATEGIES[i];
    const id = strategyId(i);

    for (let t = 0; t < 2; t++) {
      const txHash = `0x${'gradient_liq_upd_'.padEnd(62, `${i}${t}`)}`;

      await client.query(
        `INSERT INTO "gradient_strategy_liquidity_updated_events"
          ("blockchainType", "exchangeId", "strategyId", "blockId",
           "transactionHash", "transactionIndex", "logIndex",
           "timestamp", "token0Id", "token1Id", "pairId", "liquidity0", "liquidity1")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT ("transactionIndex","transactionHash","logIndex") DO NOTHING`,
        [
          BLOCKCHAIN_TYPE, EXCHANGE_ID, id, BLOCK_NUMBER + t + 1,
          txHash, i, t,
          new Date(timestamp.getTime() + (t + 1) * 60000),
          token0Id, token1Id, pairId, s.order0Liq, s.order1Liq,
        ],
      );
    }
  }

  console.log('  12 liquidity updated events inserted (2 per strategy)');
}

async function seedActivities(client: Client) {
  console.log('Seeding activities-v2 for gradient strategies...');

  const timestamp = new Date(Date.now() - 3600000);

  for (let i = 0; i < STRATEGIES.length; i++) {
    const id = strategyId(i);
    const txHash = `0x${'grad_act_create_'.padEnd(64, i.toString())}`;

    await client.query(
      `INSERT INTO "activities-v2"
        ("blockchainType", "exchangeId", "strategyId", "currentOwner", "action",
         "baseQuote", "baseSellToken", "baseSellTokenAddress",
         "quoteBuyToken", "quoteBuyTokenAddress",
         "buyBudget", "sellBudget",
         "buyPriceA", "buyPriceMarg", "buyPriceB",
         "sellPriceA", "sellPriceMarg", "sellPriceB",
         "timestamp", "txhash", "blockNumber", "logIndex", "transactionIndex")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT DO NOTHING`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, id, OWNER, 'strategy_created',
        'USDC/WETH', 'USDC', TOKEN0,
        'WETH', TOKEN1,
        '12300', '45600000000000000',
        '0.0001', '0.00015', '0.0002',
        '1500', '1600', '1700',
        timestamp, txHash, BLOCK_NUMBER, i, i,
      ],
    );
  }

  for (let t = 0; t < 2; t++) {
    const id = strategyId(t);
    const txHash = `0x${'grad_act_trade_'.padEnd(64, t.toString())}`;

    await client.query(
      `INSERT INTO "activities-v2"
        ("blockchainType", "exchangeId", "strategyId", "currentOwner", "action",
         "baseQuote", "baseSellToken", "baseSellTokenAddress",
         "quoteBuyToken", "quoteBuyTokenAddress",
         "buyBudget", "sellBudget",
         "buyPriceA", "buyPriceMarg", "buyPriceB",
         "sellPriceA", "sellPriceMarg", "sellPriceB",
         "strategySold", "tokenSold", "strategyBought", "tokenBought", "avgPrice",
         "timestamp", "txhash", "blockNumber", "logIndex", "transactionIndex")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       ON CONFLICT DO NOTHING`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, id, OWNER, 'sell_high',
        'USDC/WETH', 'USDC', TOKEN0,
        'WETH', TOKEN1,
        '12200', '45500000000000000',
        '0.0001', '0.00015', '0.0002',
        '1500', '1600', '1700',
        '100000000', 'USDC', '50000000000000000', 'WETH', '1600',
        new Date(timestamp.getTime() + (t + 1) * 60000),
        txHash, BLOCK_NUMBER + t + 1, t + 6, t,
      ],
    );
  }

  console.log('  6 strategy_created + 2 sell_high activities inserted');
}

async function seedDexScreenerEvents(client: Client) {
  console.log('Seeding dex-screener-events-v2...');

  const pairResult = await client.query(
    `SELECT p.id FROM pairs p
       JOIN tokens t0 ON p."token0Id" = t0.id
       JOIN tokens t1 ON p."token1Id" = t1.id
     WHERE p."blockchainType" = $1 AND p."exchangeId" = $2
       AND LOWER(t0.address) = LOWER($3) AND LOWER(t1.address) = LOWER($4)
     LIMIT 1`,
    [BLOCKCHAIN_TYPE, EXCHANGE_ID, TOKEN0, TOKEN1],
  );

  let pairId: number;
  if (pairResult.rows.length > 0) {
    pairId = pairResult.rows[0].id;
  } else {
    const reversedResult = await client.query(
      `SELECT p.id FROM pairs p
         JOIN tokens t0 ON p."token0Id" = t0.id
         JOIN tokens t1 ON p."token1Id" = t1.id
       WHERE p."blockchainType" = $1 AND p."exchangeId" = $2
         AND LOWER(t0.address) = LOWER($3) AND LOWER(t1.address) = LOWER($4)
       LIMIT 1`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID, TOKEN1, TOKEN0],
    );
    if (reversedResult.rows.length > 0) {
      pairId = reversedResult.rows[0].id;
    } else {
      const fallback = await client.query(
        `SELECT id FROM pairs WHERE "blockchainType" = $1 AND "exchangeId" = $2 LIMIT 1`,
        [BLOCKCHAIN_TYPE, EXCHANGE_ID],
      );
      pairId = fallback.rows[0]?.id || 1;
      console.log(`  Warning: USDC/WETH pair not found, using fallback pairId=${pairId}`);
    }
  }

  console.log(`  Using pairId=${pairId}`);

  const blockTimestamp = new Date(Date.now() - 3600000);

  for (let i = 0; i < 2; i++) {
    const txnId = `0x${'grad_dex_join_'.padEnd(64, i.toString())}`;
    await client.query(
      `INSERT INTO "dex-screener-events-v2"
        ("blockchainType", "exchangeId", "blockNumber", "blockTimestamp",
         "eventType", "txnId", "txnIndex", "eventIndex", "maker", "pairId",
         "amount0", "amount1", "reserves0", "reserves1")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT DO NOTHING`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, BLOCK_NUMBER, blockTimestamp,
        'join', txnId, i, `${i}.0`, OWNER, pairId,
        '45600000000', '12300000000000000000', '100000000000', '50000000000000000000',
      ],
    );
  }

  for (let i = 0; i < 2; i++) {
    const txnId = `0x${'grad_dex_swap_'.padEnd(64, i.toString())}`;
    await client.query(
      `INSERT INTO "dex-screener-events-v2"
        ("blockchainType", "exchangeId", "blockNumber", "blockTimestamp",
         "eventType", "txnId", "txnIndex", "eventIndex", "maker", "pairId",
         "asset0In", "asset1Out", "priceNative", "reserves0", "reserves1")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT DO NOTHING`,
      [
        BLOCKCHAIN_TYPE, EXCHANGE_ID, BLOCK_NUMBER + 1, blockTimestamp,
        'swap', txnId, i, `${i + 2}.0`, OWNER, pairId,
        '1000000000', '500000000000000000', '0.0005', '101000000000', '49500000000000000000',
      ],
    );
  }

  console.log('  2 join + 2 swap dex-screener events inserted');
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and set it.');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const shouldClean = process.argv.includes('--clean');
    if (shouldClean) {
      await clean(client);
    }

    const { token0Id, token1Id, pairId } = await lookupTokenAndPairIds(client);

    await seedRealtimeStrategies(client);
    await seedCreatedEvents(client, token0Id, token1Id, pairId);
    await seedGradientStrategies(client);
    await seedUpdatedEvents(client, token0Id, token1Id, pairId);
    await seedLiquidityUpdatedEvents(client, token0Id, token1Id, pairId);
    await seedActivities(client);
    await seedDexScreenerEvents(client);

    const rtCount = await client.query(
      `SELECT COUNT(*) FROM "gradient_strategy_realtime" WHERE "blockchainType"=$1 AND "exchangeId"=$2 AND deleted=false`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID],
    );
    const createdCount = await client.query(
      `SELECT COUNT(*) FROM "gradient_strategy_created_events" WHERE "blockchainType"=$1 AND "exchangeId"=$2`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID],
    );
    const updatedCount = await client.query(
      `SELECT COUNT(*) FROM "gradient_strategy_updated_events" WHERE "blockchainType"=$1 AND "exchangeId"=$2`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID],
    );
    const liqUpdatedCount = await client.query(
      `SELECT COUNT(*) FROM "gradient_strategy_liquidity_updated_events" WHERE "blockchainType"=$1 AND "exchangeId"=$2`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID],
    );
    const activityCount = await client.query(
      `SELECT COUNT(*) FROM "activities-v2" WHERE "blockchainType"=$1 AND "exchangeId"=$2 AND "currentOwner"=$3`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID, OWNER],
    );
    const dexEventCount = await client.query(
      `SELECT COUNT(*) FROM "dex-screener-events-v2" WHERE "blockchainType"=$1 AND "exchangeId"=$2 AND "maker"=$3`,
      [BLOCKCHAIN_TYPE, EXCHANGE_ID, OWNER],
    );

    console.log('\nSeed complete:');
    console.log(`  gradient_strategy_realtime:                  ${rtCount.rows[0].count} strategies`);
    console.log(`  gradient_strategy_created_events:            ${createdCount.rows[0].count} events`);
    console.log(`  gradient_strategy_updated_events:            ${updatedCount.rows[0].count} events (edits)`);
    console.log(`  gradient_strategy_liquidity_updated_events:  ${liqUpdatedCount.rows[0].count} events (trades)`);
    console.log(`  activities-v2 (gradient):                    ${activityCount.rows[0].count} activities`);
    console.log(`  dex-screener-events-v2 (gradient):           ${dexEventCount.rows[0].count} events`);
    console.log(`\nGradient types covered: ${GRADIENT_TYPE_NAMES.join(', ')}`);
    console.log(`Token pair: ${TOKEN0} / ${TOKEN1}`);
    console.log('\nStart the server with SHOULD_HARVEST=0 and run gradient-test-verify.ts');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
