/**
 * Targeted DB seed for preview environments.
 *
 * Connects to the production readonly DB (EXTERNAL_DATABASE_*) and copies
 * only the data needed for a single deployment up to the fork block.
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/preview/seed-preview.ts
 *
 * Required env vars:
 *   EXTERNAL_DATABASE_HOST, EXTERNAL_DATABASE_USERNAME,
 *   EXTERNAL_DATABASE_PASSWORD, EXTERNAL_DATABASE_NAME,
 *   DATABASE_URL, PREVIEW_DEPLOYMENT, FORK_BLOCK_NUMBER
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const DEPLOYMENT_TO_BLOCKCHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  sei: 'sei-network',
  celo: 'celo',
  coti: 'coti',
};

interface SeedConfig {
  exchangeId: string;
  blockchainType: string;
  forkBlock: number;
}

async function getConfig(): Promise<SeedConfig> {
  const exchangeId = process.env.PREVIEW_DEPLOYMENT;
  if (!exchangeId) throw new Error('PREVIEW_DEPLOYMENT is required');

  const blockchainType = DEPLOYMENT_TO_BLOCKCHAIN[exchangeId];
  if (!blockchainType) throw new Error(`Unknown PREVIEW_DEPLOYMENT: ${exchangeId}`);

  const raw = process.env.FORK_BLOCK_NUMBER;
  const forkBlock = raw?.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
  if (isNaN(forkBlock)) throw new Error('FORK_BLOCK_NUMBER must be a valid integer');

  return { exchangeId, blockchainType, forkBlock };
}

function createExternalClient(): Client {
  return new Client({
    host: process.env.EXTERNAL_DATABASE_HOST,
    user: process.env.EXTERNAL_DATABASE_USERNAME,
    password: process.env.EXTERNAL_DATABASE_PASSWORD,
    database: process.env.EXTERNAL_DATABASE_NAME,
    port: parseInt(process.env.EXTERNAL_DATABASE_PORT || '27140', 10),
    ssl: { rejectUnauthorized: false },
  });
}

function createLocalClient(): Client {
  return new Client({ connectionString: process.env.DATABASE_URL });
}

async function copyRows(
  ext: Client,
  local: Client,
  query: string,
  params: any[],
  targetTable: string,
): Promise<number> {
  const result = await ext.query(query, params);
  if (result.rows.length === 0) return 0;

  const columns = Object.keys(result.rows[0]);
  const placeholders = result.rows
    .map((_, rowIdx) => `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`)
    .join(', ');

  const values = result.rows.flatMap((row) => columns.map((col) => row[col]));
  const quotedCols = columns.map((c) => `"${c}"`).join(', ');

  await local.query(
    `INSERT INTO "${targetTable}" (${quotedCols}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    values,
  );

  return result.rows.length;
}

async function copyRowsBatched(
  ext: Client,
  local: Client,
  query: string,
  params: any[],
  targetTable: string,
  batchSize = 500,
): Promise<number> {
  const result = await ext.query(query, params);
  if (result.rows.length === 0) return 0;

  const columns = Object.keys(result.rows[0]);
  let total = 0;

  for (let i = 0; i < result.rows.length; i += batchSize) {
    const batch = result.rows.slice(i, i + batchSize);
    const placeholders = batch
      .map((_, rowIdx) => `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`)
      .join(', ');

    const values = batch.flatMap((row) => columns.map((col) => row[col]));
    const quotedCols = columns.map((c) => `"${c}"`).join(', ');

    await local.query(
      `INSERT INTO "${targetTable}" (${quotedCols}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      values,
    );
    total += batch.length;
  }

  return total;
}

async function getTableColumns(client: Client, table: string): Promise<string> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((r) => `"${r.column_name}"`).join(', ');
}

async function seed(): Promise<void> {
  const config = await getConfig();
  const { exchangeId, blockchainType, forkBlock } = config;

  console.log(`Seeding preview: deployment=${exchangeId}, chain=${blockchainType}, forkBlock=${forkBlock}`);

  const ext = createExternalClient();
  const local = createLocalClient();

  try {
    await ext.connect();
    await local.connect();

    await local.query("SET session_replication_role = 'replica'");

    // 1. Blocks — only copy blocks that the deployment actually references
    const startBlockResult = await ext.query(
      `SELECT MIN(b) FROM (
         SELECT MIN("blockId") as b FROM pairs WHERE "blockchainType" = $1 AND "exchangeId" = $2
         UNION ALL
         SELECT MIN("blockId") as b FROM strategies WHERE "blockchainType" = $1 AND "exchangeId" = $2
       ) sub`,
      [blockchainType, exchangeId],
    );
    const startBlock = startBlockResult.rows[0]?.min || 0;
    console.log(`  Copying blocks (from ${startBlock} to ${forkBlock})...`);
    const blockCount = await copyRowsBatched(
      ext,
      local,
      `SELECT id, "blockchainType", timestamp, "createdAt", "updatedAt"
       FROM blocks
       WHERE "blockchainType" = $1 AND id >= $2 AND id <= $3`,
      [blockchainType, startBlock, forkBlock],
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

    // Get token IDs and addresses for later use (lowercase addresses for historic-quotes matching)
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
       WHERE p."blockchainType" = $1 AND p."exchangeId" = $2 AND p."blockId" <= $3`,
      [blockchainType, exchangeId, forkBlock],
      'pairs',
    );
    console.log(`    ${pairCount} pairs copied`);

    // 4. Strategies (non-deleted only)
    console.log('  Copying strategies...');
    const strategyCount = await copyRows(
      ext,
      local,
      `SELECT s.id, s."blockchainType", s."exchangeId", s."strategyId", s."blockId", s."pairId",
              s."token0Id", s."token1Id", s.deleted, s.liquidity0, s."lowestRate0", s."highestRate0",
              s."marginalRate0", s.liquidity1, s."lowestRate1", s."highestRate1", s."marginalRate1",
              s."encodedOrder0", s."encodedOrder1", s.owner, s."createdAt", s."updatedAt"
       FROM strategies s
       WHERE s."blockchainType" = $1 AND s."exchangeId" = $2 AND s."blockId" <= $3`,
      [blockchainType, exchangeId, forkBlock],
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

    // 5b. Event tables with "blockId" FK (reference blocks.id)
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
    ];

    console.log('  Copying event tables (blockId FK)...');
    for (const table of blockIdEventTables) {
      const cols = await getTableColumns(local, table);
      const count = await copyRowsBatched(
        ext,
        local,
        `SELECT ${cols} FROM "${table}"
         WHERE "blockchainType" = $1 AND "exchangeId" = $2 AND "blockId" <= $3`,
        [blockchainType, exchangeId, forkBlock],
        table,
      );
      if (count > 0) console.log(`    ${table}: ${count} rows`);
    }

    // 5c. Event tables with "blockNumber" column (plain integer, no FK)
    // Note: tvl, total-tvl, volume are skipped — they're computed data the app regenerates
    const blockNumberEventTables = [
      { name: 'activities', blockCol: '"blockNumber"' },
      { name: 'activities-v2', blockCol: '"blockNumber"' },
      { name: 'dex-screener-events-v2', blockCol: '"blockNumber"' },
    ];

    console.log('  Copying event tables (blockNumber)...');
    for (const { name: table, blockCol } of blockNumberEventTables) {
      const cols = await getTableColumns(local, table);
      const count = await copyRowsBatched(
        ext,
        local,
        `SELECT ${cols} FROM "${table}"
         WHERE "blockchainType" = $1 AND "exchangeId" = $2 AND ${blockCol} <= $3`,
        [blockchainType, exchangeId, forkBlock],
        table,
      );
      if (count > 0) console.log(`    ${table}: ${count} rows`);
    }

    // 6. Historic-quotes (sampled 1/day per token, last 30 days — lowercase address matching)
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

      // 7. Quotes (latest for each token)
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

    // 8. Set last_processed_block to forkBlock for this deployment
    console.log('  Setting last_processed_block entries...');
    const paramPrefix = `${blockchainType}-${exchangeId}-`;

    const lpbResult = await ext.query(
      `SELECT id, param, block, "createdAt", "updatedAt"
       FROM last_processed_block
       WHERE param LIKE $1`,
      [`${paramPrefix}%`],
    );

    if (lpbResult.rows.length > 0) {
      for (const row of lpbResult.rows) {
        await local.query(
          `INSERT INTO last_processed_block (id, param, block, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET block = $3, "updatedAt" = now()`,
          [row.id, row.param, forkBlock, row.createdAt, row.updatedAt],
        );
      }
      console.log(`    ${lpbResult.rows.length} last_processed_block entries set to ${forkBlock}`);
    } else {
      console.log('    No last_processed_block entries found for this deployment');
    }

    // 8b. Seed last_processed_block for services with non-standard key prefixes
    //     These keys don't match the ${blockchainType}-${exchangeId}- pattern above.
    //     Use explicit IDs above current max to avoid PK collisions (sequences reset later in step 9).
    const maxIdResult = await local.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM last_processed_block`);
    let nextId = parseInt(maxIdResult.rows[0].max_id, 10) + 1;
    const extraKeys = [
      `carbon-price-${blockchainType}-${exchangeId}`,
      `carbon-graph-price-${blockchainType}-${exchangeId}`,
    ];
    for (const extraParam of extraKeys) {
      await local.query(
        `INSERT INTO last_processed_block (id, param, block, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, now(), now())`,
        [nextId++, extraParam, forkBlock],
      );
    }
    console.log(
      `    Set ${extraKeys.length} extra last_processed_block entries (carbon-price, carbon-graph-price) to ${forkBlock}`,
    );

    // 9. Reset SERIAL sequences so new inserts don't collide with seeded IDs
    console.log('  Resetting sequences...');
    const allSeededTables = await local.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'migrations'`,
    );
    for (const { tablename } of allSeededTables.rows) {
      try {
        await local.query(
          `SELECT setval(pg_get_serial_sequence('"${tablename}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tablename}"), 1))`,
        );
      } catch {
        // table might not have a serial id column — skip
      }
    }
    console.log('    Sequences reset');

    // 10. Delete any data with block > forkBlock (safety net)
    console.log('  Cleaning data beyond fork block...');
    const blockIdTables = [
      'strategies',
      'pairs',
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
    ];
    for (const table of blockIdTables) {
      try {
        const delResult = await local.query(`DELETE FROM "${table}" WHERE "blockId" > $1`, [forkBlock]);
        if (delResult.rowCount > 0) {
          console.log(`    Deleted ${delResult.rowCount} rows from ${table} (blockId > ${forkBlock})`);
        }
      } catch {
        /* table may not exist yet */
      }
    }
    const blockNumTables = ['activities', 'activities-v2', 'dex-screener-events-v2', 'volume'];
    for (const table of blockNumTables) {
      try {
        const delResult = await local.query(`DELETE FROM "${table}" WHERE "blockNumber" > $1`, [forkBlock]);
        if (delResult.rowCount > 0) {
          console.log(`    Deleted ${delResult.rowCount} rows from ${table} (blockNumber > ${forkBlock})`);
        }
      } catch {
        /* table may not exist yet */
      }
    }
    try {
      const delResult = await local.query(`DELETE FROM tvl WHERE "evt_block_number" > $1`, [forkBlock]);
      if (delResult.rowCount > 0) {
        console.log(`    Deleted ${delResult.rowCount} rows from tvl (evt_block_number > ${forkBlock})`);
      }
    } catch {
      /* skip */
    }
    const blockDelResult = await local.query(`DELETE FROM blocks WHERE id > $1 AND "blockchainType" = $2`, [
      forkBlock,
      blockchainType,
    ]);
    if (blockDelResult.rowCount > 0) {
      console.log(`    Deleted ${blockDelResult.rowCount} blocks with id > ${forkBlock}`);
    }

    await local.query("SET session_replication_role = 'origin'");
    console.log('Seed complete!');
  } finally {
    await ext.end().catch(() => undefined);
    await local.end().catch(() => undefined);
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
