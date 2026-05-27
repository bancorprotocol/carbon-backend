/**
 * Local DB Seed
 *
 * Fast targeted import from the prod readonly DB (EXTERNAL_DATABASE_*) into
 * the local DATABASE_URL for ONE deployment. Modeled on the preview seeder
 * but with no fork-block filtering — copies the full row set for the chosen
 * deployment so the local backend behaves identically to prod.
 *
 * Replaces the old `src/scripts/seed.js` (full pg_dump). Assumes the local
 * schema already exists — run `npm start` once or `npm run migration:run`
 * first.
 *
 * Usage:
 *   npm run db:seed                            # defaults to --deployment=ethereum
 *   npm run db:seed -- --deployment=celo
 *   npm run db:seed -- --deployment=sei
 *   (or: npx ts-node -r tsconfig-paths/register src/scripts/db/seed.ts --deployment=coti)
 *
 * Required env (loaded from .env if NODE_ENV !== 'production'):
 *   EXTERNAL_DATABASE_HOST, EXTERNAL_DATABASE_USERNAME,
 *   EXTERNAL_DATABASE_PASSWORD, EXTERNAL_DATABASE_NAME, DATABASE_URL
 */

import * as dotenv from 'dotenv';
import {
  DEPLOYMENT_TO_BLOCKCHAIN,
  copyRows,
  copyRowsBatched,
  createExternalClient,
  createLocalClient,
  getTableColumns,
  resetSequences,
} from './seed-helpers';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

function parseDeploymentArg(): string {
  const arg = process.argv.find((a) => a.startsWith('--deployment='));
  const value = arg ? arg.split('=')[1] : 'ethereum';
  if (!DEPLOYMENT_TO_BLOCKCHAIN[value]) {
    const valid = Object.keys(DEPLOYMENT_TO_BLOCKCHAIN).join(', ');
    console.error(`Unknown --deployment="${value}". Valid values: ${valid}`);
    process.exit(1);
  }
  return value;
}

async function assertSchema(local: any): Promise<void> {
  const required = ['tokens', 'pairs', 'strategies', 'blocks', 'last_processed_block'];
  for (const t of required) {
    const cols = await getTableColumns(local, t);
    if (!cols) {
      console.error(
        `Local schema is missing table "${t}". Run \`npm start\` once (or \`npm run migration:run\`) to create the schema, then re-run db:seed.`,
      );
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  const exchangeId = parseDeploymentArg();
  const blockchainType = DEPLOYMENT_TO_BLOCKCHAIN[exchangeId];

  console.log(`Seeding local DB: deployment=${exchangeId}, chain=${blockchainType}`);

  const ext = createExternalClient();
  const local = createLocalClient();

  try {
    await ext.connect();
    await local.connect();

    await assertSchema(local);

    await local.query("SET session_replication_role = 'replica'");

    // 1. Blocks — copy every block the deployment ever references.
    const blockRangeResult = await ext.query(
      `SELECT MIN(b) AS min_block, MAX(b) AS max_block FROM (
         SELECT MIN("blockId") as b FROM pairs WHERE "blockchainType" = $1 AND "exchangeId" = $2
         UNION ALL
         SELECT MAX("blockId") as b FROM pairs WHERE "blockchainType" = $1 AND "exchangeId" = $2
         UNION ALL
         SELECT MIN("blockId") as b FROM strategies WHERE "blockchainType" = $1 AND "exchangeId" = $2
         UNION ALL
         SELECT MAX("blockId") as b FROM strategies WHERE "blockchainType" = $1 AND "exchangeId" = $2
       ) sub`,
      [blockchainType, exchangeId],
    );
    const startBlock = blockRangeResult.rows[0]?.min_block || 0;
    const endBlock = blockRangeResult.rows[0]?.max_block || 0;
    console.log(`  Copying blocks (from ${startBlock} to ${endBlock})...`);
    const blockCount = await copyRowsBatched(
      ext,
      local,
      `SELECT id, "blockchainType", timestamp, "createdAt", "updatedAt"
       FROM blocks
       WHERE "blockchainType" = $1 AND id >= $2 AND id <= $3`,
      [blockchainType, startBlock, endBlock],
      'blocks',
    );
    console.log(`    ${blockCount} blocks copied`);

    // 2. Tokens
    console.log('  Copying tokens...');
    const tokenCount = await copyRows(
      ext,
      local,
      `SELECT id, "blockchainType", "exchangeId", address, symbol, name, decimals, "createdAt", "updatedAt"
       FROM tokens
       WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
      [blockchainType, exchangeId],
      'tokens',
    );
    console.log(`    ${tokenCount} tokens copied`);

    const tokenResult = await ext.query(
      `SELECT id, address FROM tokens WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
      [blockchainType, exchangeId],
    );
    const tokenIds = tokenResult.rows.map((r) => r.id);
    const tokenAddresses = tokenResult.rows.map((r) => r.address.toLowerCase());

    // 3. Pairs
    console.log('  Copying pairs...');
    const pairCount = await copyRows(
      ext,
      local,
      `SELECT p.id, p."blockchainType", p."exchangeId", p."blockId", p."token0Id", p."token1Id", p.name, p."createdAt", p."updatedAt"
       FROM pairs p
       WHERE p."blockchainType" = $1 AND p."exchangeId" = $2`,
      [blockchainType, exchangeId],
      'pairs',
    );
    console.log(`    ${pairCount} pairs copied`);

    // 4. Strategies
    console.log('  Copying strategies...');
    const strategyCount = await copyRows(
      ext,
      local,
      `SELECT s.id, s."blockchainType", s."exchangeId", s."strategyId",
              s."blockId", s."pairId", s."token0Id", s."token1Id", s.deleted,
              s.liquidity0, s."lowestRate0", s."highestRate0", s."marginalRate0",
              s.liquidity1, s."lowestRate1", s."highestRate1", s."marginalRate1",
              s."encodedOrder0", s."encodedOrder1", s.owner, s."createdAt", s."updatedAt"
       FROM strategies s
       WHERE s."blockchainType" = $1 AND s."exchangeId" = $2`,
      [blockchainType, exchangeId],
      'strategies',
    );
    console.log(`    ${strategyCount} strategies copied`);

    // 5. Strategy-realtime
    console.log('  Copying strategy-realtime...');
    const realtimeCount = await copyRows(
      ext,
      local,
      `SELECT id, "blockchainType", "exchangeId", "strategyId", owner, "token0Address", "token1Address",
              liquidity0, "lowestRate0", "highestRate0", "marginalRate0",
              liquidity1, "lowestRate1", "highestRate1", "marginalRate1",
              "encodedOrder0", "encodedOrder1", deleted, "createdAt", "updatedAt"
       FROM "strategy-realtime"
       WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
      [blockchainType, exchangeId],
      'strategy-realtime',
    );
    console.log(`    ${realtimeCount} strategy-realtime rows copied`);

    // 6. Event tables with "blockId" FK
    const blockIdEventTables = [
      'strategy-created-events',
      'strategy-updated-events',
      'strategy-deleted-events',
      'pair-created-events',
      'pair-trading-fee-ppm-updated-events',
      'trading-fee-ppm-updated-events',
      'tokens-traded-events',
      'voucher-transfer-events',
      'arbitrage-executed-events',
      'arbitrage-executed-events-v2',
      'vortex-funds-withdrawn-events',
      'vortex-tokens-traded-events',
      'vortex-trading-reset-events',
      // Gradient event tables — only present on chains with gradient support.
      'gradient_strategy_created_events',
      'gradient_strategy_updated_events',
      'gradient_strategy_deleted_events',
      'gradient_strategy_liquidity_updated_events',
      'gradient_trading_fee_ppm_events',
      'gradient_pair_trading_fee_ppm_events',
    ];

    console.log('  Copying event tables (blockId FK)...');
    for (const table of blockIdEventTables) {
      try {
        const cols = await getTableColumns(local, table);
        if (!cols) continue;
        const count = await copyRowsBatched(
          ext,
          local,
          `SELECT ${cols} FROM "${table}"
           WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
          [blockchainType, exchangeId],
          table,
        );
        if (count > 0) console.log(`    ${table}: ${count} rows`);
      } catch (err) {
        console.log(`    ${table}: skipped (${(err as Error).message})`);
      }
    }

    // 7. Gradient snapshot tables (current state)
    console.log('  Copying gradient snapshot tables...');
    for (const table of ['gradient_strategies', 'gradient_strategy_realtime']) {
      try {
        const cols = await getTableColumns(local, table);
        if (!cols) continue;
        const count = await copyRowsBatched(
          ext,
          local,
          `SELECT ${cols} FROM "${table}"
           WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
          [blockchainType, exchangeId],
          table,
        );
        if (count > 0) console.log(`    ${table}: ${count} rows`);
      } catch (err) {
        console.log(`    ${table}: skipped (${(err as Error).message})`);
      }
    }

    // 8. Event tables keyed by "blockNumber" (plain integer, no FK)
    const blockNumberEventTables: { name: string; blockCol: string }[] = [
      { name: 'activities', blockCol: '"blockNumber"' },
      { name: 'activities-v2', blockCol: '"blockNumber"' },
      { name: 'dex-screener-events-v2', blockCol: '"blockNumber"' },
    ];

    console.log('  Copying event tables (blockNumber)...');
    for (const { name: table } of blockNumberEventTables) {
      const cols = await getTableColumns(local, table);
      if (!cols) continue;
      const count = await copyRowsBatched(
        ext,
        local,
        `SELECT ${cols} FROM "${table}"
         WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
        [blockchainType, exchangeId],
        table,
      );
      if (count > 0) console.log(`    ${table}: ${count} rows`);
    }

    // 9. Historic-quotes (sampled 1/day per token, last 30 days)
    if (tokenAddresses.length > 0) {
      console.log(`  Copying historic-quotes (1/day, 30 days, ${tokenAddresses.length} tokens)...`);
      const addressPlaceholders = tokenAddresses.map((_, i) => `$${i + 2}`).join(', ');
      const hqCount = await copyRowsBatched(
        ext,
        local,
        `SELECT DISTINCT ON (date_trunc('day', timestamp), LOWER("tokenAddress"))
                id, "blockchainType", timestamp, "tokenAddress", provider, usd, "createdAt", "updatedAt"
         FROM "historic-quotes"
         WHERE "blockchainType" = $1
           AND LOWER("tokenAddress") IN (${addressPlaceholders})
           AND timestamp >= now() - interval '30 days'
         ORDER BY date_trunc('day', timestamp), LOWER("tokenAddress"), timestamp DESC`,
        [blockchainType, ...tokenAddresses],
        'historic-quotes',
      );
      console.log(`    ${hqCount} historic-quote rows copied`);

      // 10. Quotes (latest for each token)
      console.log('  Copying latest quotes...');
      const tokenIdPlaceholders = tokenIds.map((_, i) => `$${i + 2}`).join(', ');
      const quoteCount = await copyRows(
        ext,
        local,
        `SELECT DISTINCT ON ("tokenId")
                id, "blockchainType", provider, timestamp, "tokenId", usd, "createdAt", "updatedAt"
         FROM quotes
         WHERE "blockchainType" = $1 AND "tokenId" IN (${tokenIdPlaceholders})
         ORDER BY "tokenId", timestamp DESC`,
        [blockchainType, ...tokenIds],
        'quotes',
      );
      console.log(`    ${quoteCount} quote rows copied`);
    }

    // 11. last_processed_block — copy verbatim from prod so the local harvester
    //     resumes exactly where prod is at (no clamping, no fork-block magic).
    console.log('  Copying last_processed_block entries...');
    const paramPrefix = `${blockchainType}-${exchangeId}-`;
    const lpbResult = await ext.query(
      `SELECT id, param, block, "createdAt", "updatedAt"
       FROM last_processed_block
       WHERE param LIKE $1
          OR param = $2
          OR param = $3`,
      [`${paramPrefix}%`, `carbon-price-${blockchainType}-${exchangeId}`, `carbon-graph-price-${blockchainType}-${exchangeId}`],
    );
    if (lpbResult.rows.length > 0) {
      for (const row of lpbResult.rows) {
        await local.query(
          `INSERT INTO last_processed_block (id, param, block, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET block = $3, "updatedAt" = now()`,
          [row.id, row.param, row.block, row.createdAt, row.updatedAt],
        );
      }
      console.log(`    ${lpbResult.rows.length} last_processed_block entries copied`);
    } else {
      console.log('    No last_processed_block entries found for this deployment');
    }

    // 12. Reset SERIAL sequences so new inserts don't collide with seeded IDs
    console.log('  Resetting sequences...');
    await resetSequences(local);
    console.log('    Sequences reset');

    await local.query("SET session_replication_role = 'origin'");
    console.log(`\nSeed complete: deployment=${exchangeId}, chain=${blockchainType}`);
  } finally {
    await ext.end().catch(() => undefined);
    await local.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
