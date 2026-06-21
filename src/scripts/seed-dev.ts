/**
 * Fast, deployment-scoped seed for the local dev DB.
 *
 * Mirrors the preview seed (src/preview/seed-preview.ts) but targets the normal
 * dev database (DATABASE_URL): it drops & recreates the database, runs the
 * migrations, then copies the chosen deployment from the production readonly DB
 * (EXTERNAL_DATABASE_*) up to the latest production block.
 *
 * Ethereum is ALWAYS seeded (in addition to the chosen deployment) because every
 * other deployment prices its tokens against Ethereum quotes/historic-quotes.
 *
 * Usage:
 *   npm run db:seed:fast -- coti
 *   SEED_DEPLOYMENT=coti npm run db:seed:fast
 *
 * Required env vars:
 *   DATABASE_URL, EXTERNAL_DATABASE_HOST, EXTERNAL_DATABASE_USERNAME,
 *   EXTERNAL_DATABASE_PASSWORD, EXTERNAL_DATABASE_NAME
 */

import { execSync } from 'child_process';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { DEPLOYMENT_TO_BLOCKCHAIN, createExternalClient, runSeed } from '../preview/seed-preview';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

function resolveDeployment(): { exchangeId: string; blockchainType: string } {
  const exchangeId = process.argv[2] || process.env.SEED_DEPLOYMENT;
  const supported = Object.keys(DEPLOYMENT_TO_BLOCKCHAIN).join(', ');

  if (!exchangeId) {
    throw new Error(
      `No deployment specified. Pass one as an argument (e.g. "npm run db:seed:fast -- coti") ` +
        `or via SEED_DEPLOYMENT. Supported: ${supported}`,
    );
  }

  const blockchainType = DEPLOYMENT_TO_BLOCKCHAIN[exchangeId];
  if (!blockchainType) {
    throw new Error(`Unknown deployment "${exchangeId}". Supported: ${supported}`);
  }

  return { exchangeId, blockchainType };
}

function parseDbName(databaseUrl: string): string {
  const dbName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!dbName) throw new Error('Could not determine database name from DATABASE_URL');
  return dbName;
}

function maintenanceUrl(databaseUrl: string): string {
  // Connect to the default "postgres" db so we can drop/create the target db.
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

async function recreateDatabase(databaseUrl: string): Promise<void> {
  const dbName = parseDbName(databaseUrl);
  const admin = new Client({ connectionString: maintenanceUrl(databaseUrl) });

  await admin.connect();
  try {
    console.log(`Terminating existing connections to "${dbName}"...`);
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    console.log(`Dropping database "${dbName}" (if it exists)...`);
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`Creating database "${dbName}"...`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end().catch(() => undefined);
  }
}

async function enableTimescale(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
  } catch (err) {
    console.warn(`  Warning: could not create timescaledb extension: ${(err as Error).message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function getLatestProductionBlock(blockchainType: string): Promise<number> {
  const ext = createExternalClient();
  await ext.connect();
  try {
    const result = await ext.query(`SELECT MAX(id) AS max FROM blocks WHERE "blockchainType" = $1`, [blockchainType]);
    const max = result.rows[0]?.max;
    if (max === null || max === undefined) {
      throw new Error(`No blocks found in production for blockchainType "${blockchainType}"`);
    }
    return parseInt(max, 10);
  } finally {
    await ext.end().catch(() => undefined);
  }
}

const ETHEREUM_EXCHANGE_ID = 'ethereum';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const { exchangeId, blockchainType } = resolveDeployment();

  // Ethereum is always seeded: every other deployment prices its tokens against
  // Ethereum quotes/historic-quotes (see CarbonPriceService + QuoteService.mapEthereumTokens).
  const deploymentsToSeed = [
    { exchangeId: ETHEREUM_EXCHANGE_ID, blockchainType: DEPLOYMENT_TO_BLOCKCHAIN[ETHEREUM_EXCHANGE_ID] },
  ];
  if (exchangeId !== ETHEREUM_EXCHANGE_ID) {
    deploymentsToSeed.push({ exchangeId, blockchainType });
  }
  console.log(`Dev seed: ${deploymentsToSeed.map((d) => d.exchangeId).join(' + ')}`);

  // 1. Drop & recreate the dev DB
  await recreateDatabase(databaseUrl);

  // 2. Run migrations (builds, then runs against src/typeorm.config.ts using DATABASE_URL)
  console.log('Running migrations...');
  execSync('npm run migration:run', { stdio: 'inherit' });

  // 3. Ensure timescaledb is available for any hypertable migrations
  await enableTimescale(databaseUrl);

  // 4. Seed each deployment up to its own latest production block (Ethereum first, dependency for the rest)
  for (const d of deploymentsToSeed) {
    const forkBlock = await getLatestProductionBlock(d.blockchainType);
    console.log(`Latest production block for ${d.blockchainType}: ${forkBlock}`);
    await runSeed({ exchangeId: d.exchangeId, blockchainType: d.blockchainType, forkBlock });
  }

  // 5. Compact (matches preview post-seed step)
  console.log('Running VACUUM ANALYZE...');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('VACUUM ANALYZE');
  } finally {
    await client.end().catch(() => undefined);
  }

  console.log('Dev seed complete!');
}

main().catch((err) => {
  console.error('Dev seed failed:', err);
  process.exit(1);
});
