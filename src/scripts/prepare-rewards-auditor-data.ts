#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { createWriteStream, WriteStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';

dotenv.config();

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  campaignId: number;
  outputDir?: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--campaign-id':
        if (!next) throw new Error('--campaign-id requires a value');
        opts.campaignId = parseInt(next, 10);
        if (isNaN(opts.campaignId)) throw new Error('--campaign-id must be an integer');
        i++;
        break;
      case '--output-dir':
        if (!next) throw new Error('--output-dir requires a value');
        opts.outputDir = next;
        i++;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.campaignId === undefined) {
    throw new Error('--campaign-id is required. Use --help for usage information.');
  }
  return opts as CliOptions;
}

function printHelp() {
  console.log(`
Merkl Rewards Audit Data Fetcher

Connects to the production carbon-backend database (using EXTERNAL_DATABASE_*
credentials in .env) and writes the data files needed by the merkl rewards
auditor:
  - campaign_details.json
  - created.csv
  - updated.csv
  - deleted.csv
  - tokens.csv
  - developer_results.csv

Usage:
  npm run prepare-audit-data -- --campaign-id <id> [--output-dir <path>]

Options:
  --campaign-id <id>     Merkl campaign id (required)
  --output-dir <path>    Output directory (default: data/<campaignId>/)
  --help                 Show this help message

Examples:
  npm run prepare-audit-data -- --campaign-id 43
  npm run prepare-audit-data -- --campaign-id 43 --output-dir ../rewards-auditor/data
`);
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

function createDataSource(): DataSource {
  const required = [
    'EXTERNAL_DATABASE_USERNAME',
    'EXTERNAL_DATABASE_PASSWORD',
    'EXTERNAL_DATABASE_HOST',
    'EXTERNAL_DATABASE_NAME',
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Environment variable ${key} is required`);
    }
  }

  // External database (timescale cloud) requires SSL.
  const sslEnabled = process.env.EXTERNAL_DATABASE_SSL_ENABLED !== '0';

  return new DataSource({
    type: 'postgres',
    host: process.env.EXTERNAL_DATABASE_HOST,
    port: parseInt(process.env.EXTERNAL_DATABASE_PORT || '27140', 10),
    username: process.env.EXTERNAL_DATABASE_USERNAME,
    password: process.env.EXTERNAL_DATABASE_PASSWORD,
    database: process.env.EXTERNAL_DATABASE_NAME,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    entities: [],
    synchronize: false,
    logging: false,
    extra: {
      // Larger pool not needed; this script issues sequential queries.
      max: 2,
      statement_timeout: 0,
    },
  });
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

type CellKind = 'int' | 'str';

interface ColSpec {
  name: string;
  kind: CellKind;
}

function csvCell(value: any, kind: CellKind): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (kind === 'int') {
    return String(value);
  }
  const s = typeof value === 'string' ? value : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function writeHeader(stream: WriteStream, cols: ColSpec[]): void {
  stream.write(cols.map((c) => `"${c.name}"`).join(',') + '\n');
}

function writeRow(stream: WriteStream, cols: ColSpec[], row: Record<string, any>): void {
  stream.write(cols.map((c) => csvCell(row[c.name], c.kind)).join(',') + '\n');
}

async function endStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Column specs (order matches the existing files in rewards-auditor/data/)
// ---------------------------------------------------------------------------

const CREATED_COLS: ColSpec[] = [
  { name: 'id', kind: 'int' },
  { name: 'strategyId', kind: 'str' },
  { name: 'blockchainType', kind: 'str' },
  { name: 'exchangeId', kind: 'str' },
  { name: 'timestamp', kind: 'str' },
  { name: 'owner', kind: 'str' },
  { name: 'order0', kind: 'str' },
  { name: 'order1', kind: 'str' },
  { name: 'transactionIndex', kind: 'int' },
  { name: 'transactionHash', kind: 'str' },
  { name: 'logIndex', kind: 'int' },
  { name: 'createdAt', kind: 'str' },
  { name: 'updatedAt', kind: 'str' },
  { name: 'pairId', kind: 'int' },
  { name: 'blockId', kind: 'int' },
  { name: 'token0Id', kind: 'int' },
  { name: 'token1Id', kind: 'int' },
];

const UPDATED_COLS: ColSpec[] = [
  { name: 'id', kind: 'int' },
  { name: 'blockchainType', kind: 'str' },
  { name: 'exchangeId', kind: 'str' },
  { name: 'strategyId', kind: 'str' },
  { name: 'timestamp', kind: 'str' },
  { name: 'reason', kind: 'int' },
  { name: 'order0', kind: 'str' },
  { name: 'order1', kind: 'str' },
  { name: 'transactionIndex', kind: 'int' },
  { name: 'transactionHash', kind: 'str' },
  { name: 'logIndex', kind: 'int' },
  { name: 'createdAt', kind: 'str' },
  { name: 'updatedAt', kind: 'str' },
  { name: 'pairId', kind: 'int' },
  { name: 'blockId', kind: 'int' },
  { name: 'token0Id', kind: 'int' },
  { name: 'token1Id', kind: 'int' },
];

const DELETED_COLS: ColSpec[] = [
  { name: 'id', kind: 'int' },
  { name: 'blockchainType', kind: 'str' },
  { name: 'exchangeId', kind: 'str' },
  { name: 'strategyId', kind: 'str' },
  { name: 'timestamp', kind: 'str' },
  { name: 'order0', kind: 'str' },
  { name: 'order1', kind: 'str' },
  { name: 'transactionIndex', kind: 'int' },
  { name: 'transactionHash', kind: 'str' },
  { name: 'logIndex', kind: 'int' },
  { name: 'createdAt', kind: 'str' },
  { name: 'updatedAt', kind: 'str' },
  { name: 'pairId', kind: 'int' },
  { name: 'blockId', kind: 'int' },
  { name: 'token0Id', kind: 'int' },
  { name: 'token1Id', kind: 'int' },
];

const TOKENS_COLS: ColSpec[] = [
  { name: 'id', kind: 'int' },
  { name: 'blockchainType', kind: 'str' },
  { name: 'exchangeId', kind: 'str' },
  { name: 'address', kind: 'str' },
  { name: 'symbol', kind: 'str' },
  { name: 'name', kind: 'str' },
  { name: 'decimals', kind: 'int' },
  { name: 'createdAt', kind: 'str' },
  { name: 'updatedAt', kind: 'str' },
];

const DEVELOPER_RESULTS_COLS: ColSpec[] = [
  { name: 'id', kind: 'int' },
  { name: 'campaign_id', kind: 'int' },
  { name: 'strategy_id', kind: 'str' },
  { name: 'epoch_number', kind: 'int' },
  { name: 'sub_epoch_number', kind: 'int' },
  { name: 'epoch_start', kind: 'str' },
  { name: 'sub_epoch_timestamp', kind: 'str' },
  { name: 'token0_reward', kind: 'str' },
  { name: 'token1_reward', kind: 'str' },
  { name: 'total_reward', kind: 'str' },
  { name: 'liquidity0', kind: 'str' },
  { name: 'liquidity1', kind: 'str' },
  { name: 'token0_address', kind: 'str' },
  { name: 'token1_address', kind: 'str' },
  { name: 'token0_usd_rate', kind: 'str' },
  { name: 'token1_usd_rate', kind: 'str' },
  { name: 'target_price', kind: 'str' },
  { name: 'eligible0', kind: 'str' },
  { name: 'eligible1', kind: 'str' },
  { name: 'token0_reward_zone_boundary', kind: 'str' },
  { name: 'token1_reward_zone_boundary', kind: 'str' },
  { name: 'token0_weighting', kind: 'str' },
  { name: 'token1_weighting', kind: 'str' },
  { name: 'token0_decimals', kind: 'int' },
  { name: 'token1_decimals', kind: 'int' },
  { name: 'order0_a_compressed', kind: 'str' },
  { name: 'order0_b_compressed', kind: 'str' },
  { name: 'order0_a', kind: 'str' },
  { name: 'order0_b', kind: 'str' },
  { name: 'order0_z', kind: 'str' },
  { name: 'order1_a_compressed', kind: 'str' },
  { name: 'order1_b_compressed', kind: 'str' },
  { name: 'order1_a', kind: 'str' },
  { name: 'order1_b', kind: 'str' },
  { name: 'order1_z', kind: 'str' },
  { name: 'last_event_timestamp', kind: 'str' },
  { name: 'last_processed_block', kind: 'int' },
  { name: 'owner_address', kind: 'str' },
  { name: 'created_at', kind: 'str' },
  { name: 'updated_at', kind: 'str' },
];

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`${new Date().toISOString()}: ${message}`);
}

// ---------------------------------------------------------------------------
// Campaign fetch
// ---------------------------------------------------------------------------

interface CampaignRow {
  id: number;
  blockchainType: string;
  exchangeId: string;
  pairId: number;
  rewardAmount: string;
  rewardTokenAddress: string;
  startDate: string;
  endDate: string;
  opportunityName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchCampaign(ds: DataSource, campaignId: number): Promise<CampaignRow> {
  const rows = await ds.query(
    `SELECT
       id,
       "blockchainType",
       "exchangeId",
       "pairId",
       "rewardAmount",
       "rewardTokenAddress",
       "startDate"::text   AS "startDate",
       "endDate"::text     AS "endDate",
       "opportunityName",
       "isActive",
       "createdAt"::text   AS "createdAt",
       "updatedAt"::text   AS "updatedAt"
     FROM merkl_campaigns
     WHERE id = $1`,
    [campaignId],
  );
  if (rows.length === 0) {
    throw new Error(`Campaign ${campaignId} not found in merkl_campaigns`);
  }
  return rows[0];
}

function rewardAmountForJson(s: string): number | string {
  if (s === null || s === undefined) return s as any;
  const str = String(s);
  if (!/^\d+$/.test(str)) {
    return str;
  }
  try {
    if (BigInt(str) <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(str);
    }
  } catch {
    // fall through
  }
  return str;
}

async function writeCampaignJson(outDir: string, campaign: CampaignRow): Promise<void> {
  const json = [
    {
      id: campaign.id,
      blockchainType: campaign.blockchainType,
      exchangeId: campaign.exchangeId,
      pairId: campaign.pairId,
      rewardAmount: rewardAmountForJson(campaign.rewardAmount),
      rewardTokenAddress: campaign.rewardTokenAddress,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      opportunityName: campaign.opportunityName,
      isActive: campaign.isActive ? 1 : 0,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    },
  ];
  const filePath = path.join(outDir, 'campaign_details.json');
  await writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  log(`✅ Wrote ${filePath}`);
}

// ---------------------------------------------------------------------------
// Event dumpers
// ---------------------------------------------------------------------------

const EVENT_BATCH_SIZE = 50_000;

async function dumpCreatedEvents(ds: DataSource, outDir: string, campaign: CampaignRow): Promise<number> {
  const filePath = path.join(outDir, 'created.csv');
  const stream = createWriteStream(filePath);
  writeHeader(stream, CREATED_COLS);

  let lastId = 0;
  let total = 0;

  while (true) {
    const rows: any[] = await ds.query(
      `SELECT
         id,
         "strategyId",
         "blockchainType",
         "exchangeId",
         timestamp::text     AS "timestamp",
         owner,
         order0,
         order1,
         "transactionIndex",
         "transactionHash",
         "logIndex",
         "createdAt"::text   AS "createdAt",
         "updatedAt"::text   AS "updatedAt",
         "pairId",
         "blockId",
         "token0Id",
         "token1Id"
       FROM "strategy-created-events"
       WHERE "blockchainType" = $1
         AND "exchangeId" = $2
         AND "pairId" = $3
         AND timestamp <= $4
         AND id > $5
       ORDER BY id ASC
       LIMIT $6`,
      [campaign.blockchainType, campaign.exchangeId, campaign.pairId, campaign.endDate, lastId, EVENT_BATCH_SIZE],
    );
    if (rows.length === 0) break;
    for (const row of rows) writeRow(stream, CREATED_COLS, row);
    total += rows.length;
    lastId = rows[rows.length - 1].id;
    if (rows.length < EVENT_BATCH_SIZE) break;
  }

  await endStream(stream);
  log(`✅ Wrote ${filePath} (${total} rows)`);
  return total;
}

async function dumpUpdatedEvents(ds: DataSource, outDir: string, campaign: CampaignRow): Promise<number> {
  const filePath = path.join(outDir, 'updated.csv');
  const stream = createWriteStream(filePath);
  writeHeader(stream, UPDATED_COLS);

  let lastId = 0;
  let total = 0;

  while (true) {
    const rows: any[] = await ds.query(
      `SELECT
         id,
         "blockchainType",
         "exchangeId",
         "strategyId",
         timestamp::text     AS "timestamp",
         reason,
         order0,
         order1,
         "transactionIndex",
         "transactionHash",
         "logIndex",
         "createdAt"::text   AS "createdAt",
         "updatedAt"::text   AS "updatedAt",
         "pairId",
         "blockId",
         "token0Id",
         "token1Id"
       FROM "strategy-updated-events"
       WHERE "blockchainType" = $1
         AND "exchangeId" = $2
         AND "pairId" = $3
         AND timestamp <= $4
         AND id > $5
       ORDER BY id ASC
       LIMIT $6`,
      [campaign.blockchainType, campaign.exchangeId, campaign.pairId, campaign.endDate, lastId, EVENT_BATCH_SIZE],
    );
    if (rows.length === 0) break;
    for (const row of rows) writeRow(stream, UPDATED_COLS, row);
    total += rows.length;
    lastId = rows[rows.length - 1].id;
    if (rows.length < EVENT_BATCH_SIZE) break;
  }

  await endStream(stream);
  log(`✅ Wrote ${filePath} (${total} rows)`);
  return total;
}

async function dumpDeletedEvents(ds: DataSource, outDir: string, campaign: CampaignRow): Promise<number> {
  const filePath = path.join(outDir, 'deleted.csv');
  const stream = createWriteStream(filePath);
  writeHeader(stream, DELETED_COLS);

  let lastId = 0;
  let total = 0;

  while (true) {
    const rows: any[] = await ds.query(
      `SELECT
         id,
         "blockchainType",
         "exchangeId",
         "strategyId",
         timestamp::text     AS "timestamp",
         order0,
         order1,
         "transactionIndex",
         "transactionHash",
         "logIndex",
         "createdAt"::text   AS "createdAt",
         "updatedAt"::text   AS "updatedAt",
         "pairId",
         "blockId",
         "token0Id",
         "token1Id"
       FROM "strategy-deleted-events"
       WHERE "blockchainType" = $1
         AND "exchangeId" = $2
         AND "pairId" = $3
         AND timestamp <= $4
         AND id > $5
       ORDER BY id ASC
       LIMIT $6`,
      [campaign.blockchainType, campaign.exchangeId, campaign.pairId, campaign.endDate, lastId, EVENT_BATCH_SIZE],
    );
    if (rows.length === 0) break;
    for (const row of rows) writeRow(stream, DELETED_COLS, row);
    total += rows.length;
    lastId = rows[rows.length - 1].id;
    if (rows.length < EVENT_BATCH_SIZE) break;
  }

  await endStream(stream);
  log(`✅ Wrote ${filePath} (${total} rows)`);
  return total;
}

// ---------------------------------------------------------------------------
// Tokens dumper
// ---------------------------------------------------------------------------

async function dumpTokens(ds: DataSource, outDir: string, campaign: CampaignRow): Promise<number> {
  const filePath = path.join(outDir, 'tokens.csv');
  const stream = createWriteStream(filePath);
  writeHeader(stream, TOKENS_COLS);

  const rows: any[] = await ds.query(
    `SELECT
       id,
       "blockchainType",
       "exchangeId",
       address,
       symbol,
       name,
       decimals,
       "createdAt"::text AS "createdAt",
       "updatedAt"::text AS "updatedAt"
     FROM tokens
     WHERE "blockchainType" = $1 AND "exchangeId" = $2
     ORDER BY id ASC`,
    [campaign.blockchainType, campaign.exchangeId],
  );
  for (const row of rows) writeRow(stream, TOKENS_COLS, row);

  await endStream(stream);
  log(`✅ Wrote ${filePath} (${rows.length} rows)`);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Developer results dumper (cursor-paginated to avoid memory blow-up)
// ---------------------------------------------------------------------------

const DEV_RESULTS_BATCH_SIZE = 50_000;

async function dumpDeveloperResults(ds: DataSource, outDir: string, campaignId: number): Promise<number> {
  const filePath = path.join(outDir, 'developer_results.csv');
  const stream = createWriteStream(filePath);
  writeHeader(stream, DEVELOPER_RESULTS_COLS);

  let lastId = 0;
  let total = 0;

  while (true) {
    const rows: any[] = await ds.query(
      `SELECT
         id,
         campaign_id,
         strategy_id,
         epoch_number,
         sub_epoch_number,
         epoch_start::text          AS epoch_start,
         sub_epoch_timestamp::text  AS sub_epoch_timestamp,
         token0_reward,
         token1_reward,
         total_reward,
         liquidity0,
         liquidity1,
         token0_address,
         token1_address,
         token0_usd_rate,
         token1_usd_rate,
         target_price,
         eligible0,
         eligible1,
         token0_reward_zone_boundary,
         token1_reward_zone_boundary,
         token0_weighting,
         token1_weighting,
         token0_decimals,
         token1_decimals,
         order0_a_compressed,
         order0_b_compressed,
         order0_a,
         order0_b,
         order0_z,
         order1_a_compressed,
         order1_b_compressed,
         order1_a,
         order1_b,
         order1_z,
         last_event_timestamp::text AS last_event_timestamp,
         last_processed_block,
         owner_address,
         created_at::text           AS created_at,
         updated_at::text           AS updated_at
       FROM merkl_sub_epochs
       WHERE campaign_id = $1
         AND id > $2
       ORDER BY id ASC
       LIMIT $3`,
      [campaignId, lastId, DEV_RESULTS_BATCH_SIZE],
    );
    if (rows.length === 0) break;
    for (const row of rows) writeRow(stream, DEVELOPER_RESULTS_COLS, row);
    total += rows.length;
    lastId = rows[rows.length - 1].id;
    log(`   ... ${total.toLocaleString()} sub-epoch rows written so far`);
    if (rows.length < DEV_RESULTS_BATCH_SIZE) break;
  }

  await endStream(stream);
  log(`✅ Wrote ${filePath} (${total} rows)`);
  return total;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs();

  log(`🚀 Preparing rewards-auditor data for campaign ${opts.campaignId}`);

  const ds = createDataSource();
  await ds.initialize();
  log(`🔗 Connected to ${process.env.EXTERNAL_DATABASE_HOST}/${process.env.EXTERNAL_DATABASE_NAME}`);

  try {
    const campaign = await fetchCampaign(ds, opts.campaignId);
    log(
      `📋 Campaign ${campaign.id}: pair=${campaign.pairId} ` +
        `${campaign.blockchainType}/${campaign.exchangeId} ` +
        `${campaign.startDate} → ${campaign.endDate}`,
    );

    const outDir = opts.outputDir
      ? path.resolve(opts.outputDir)
      : path.resolve(process.cwd(), 'data', String(campaign.id));
    await mkdir(outDir, { recursive: true });
    log(`📁 Output directory: ${outDir}`);

    await writeCampaignJson(outDir, campaign);
    await dumpCreatedEvents(ds, outDir, campaign);
    await dumpUpdatedEvents(ds, outDir, campaign);
    await dumpDeletedEvents(ds, outDir, campaign);
    await dumpTokens(ds, outDir, campaign);
    await dumpDeveloperResults(ds, outDir, campaign.id);

    log(`🎉 Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. Output: ${outDir}`);
  } finally {
    await ds.destroy();
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
