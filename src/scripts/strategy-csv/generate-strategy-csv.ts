#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { createWriteStream, WriteStream } from 'fs';
import {
  RawEvent,
  TokenInfo,
  FeePPMEntry,
  VoucherTransfer,
  TradeDirectionEntry,
  CsvRow,
  CSV_HEADERS,
  csvRowToLine,
  processStrategyEvents,
  sortEvents,
} from './processing';

dotenv.config();

const BATCH_SIZE = 50_000;

const DEPLOYMENT_MAP: Record<string, { blockchainType: string; exchangeId: string }> = {
  ethereum: { blockchainType: 'ethereum', exchangeId: 'ethereum' },
  bnb: { blockchainType: 'bnb', exchangeId: 'bnb-dna' },
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  deployment: string;
  outputPath: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    deployment: 'ethereum',
    outputPath: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--deployment':
        if (!next) throw new Error('--deployment requires a value');
        options.deployment = next;
        i++;
        break;
      case '--output':
        if (!next) throw new Error('--output requires a value');
        options.outputPath = next;
        i++;
        break;
      case '--help':
        console.log(`
Strategy CSV Generator

Usage: npm run generate-strategy-csv -- [options]

Options:
  --deployment <name>   Deployment name (default: ethereum). Available: ${Object.keys(DEPLOYMENT_MAP).join(', ')}
  --output <path>       Output file path (default: strategy_events_<deployment>_<timestamp>.csv)
  --help                Show this help message
`);
        process.exit(0);
    }
  }

  if (!DEPLOYMENT_MAP[options.deployment]) {
    throw new Error(`Unknown deployment: ${options.deployment}. Available: ${Object.keys(DEPLOYMENT_MAP).join(', ')}`);
  }

  if (!options.outputPath) {
    options.outputPath = `strategy_events_${options.deployment}_${Date.now()}.csv`;
  }

  return options;
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

function createDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL_ENABLED === '1'
        ? {
            ca: process.env.CARBON_BACKEND_SQL_CERTIFICATION,
            ciphers: [
              'ECDHE-RSA-AES128-SHA256',
              'DHE-RSA-AES128-SHA256',
              'AES128-GCM-SHA256',
              '!RC4',
              'HIGH',
              '!MD5',
              '!aNULL',
            ].join(':'),
            honorCipherOrder: true,
            rejectUnauthorized: false,
          }
        : false,
    entities: [],
    synchronize: false,
    logging: false,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function queryTokens(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
): Promise<Map<number, TokenInfo>> {
  const rows = await ds.query(
    `SELECT id, address, symbol, decimals FROM tokens WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
    [blockchainType, exchangeId],
  );
  const map = new Map<number, TokenInfo>();
  for (const r of rows) {
    map.set(r.id, { address: r.address, symbol: r.symbol, decimals: r.decimals });
  }
  return map;
}

interface CreatedEventRow {
  strategyId: string;
  blockId: number;
  transactionIndex: number;
  logIndex: number;
  transactionHash: string;
  timestamp: Date;
  order0: string;
  order1: string;
  owner: string;
  token0Id: number;
  token1Id: number;
  pairId: number;
}

async function queryCreatedEvents(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
): Promise<Map<string, CreatedEventRow>> {
  const rows: any[] = await ds.query(
    `SELECT
      "strategyId" as "strategyId",
      "blockId" as "blockId",
      "transactionIndex" as "transactionIndex",
      "logIndex" as "logIndex",
      "transactionHash" as "transactionHash",
      "timestamp" as "timestamp",
      order0, order1, owner,
      "token0Id" as "token0Id",
      "token1Id" as "token1Id",
      "pairId" as "pairId"
    FROM "strategy-created-events"
    WHERE "blockchainType" = $1 AND "exchangeId" = $2`,
    [blockchainType, exchangeId],
  );
  const map = new Map<string, CreatedEventRow>();
  for (const r of rows) {
    map.set(r.strategyId, r);
  }
  return map;
}

async function queryGlobalFeeHistory(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
): Promise<FeePPMEntry[]> {
  const rows: any[] = await ds.query(
    `SELECT "blockId" as "blockId", "newFeePPM" as "newFeePPM"
     FROM "trading-fee-ppm-updated-events"
     WHERE "blockchainType" = $1 AND "exchangeId" = $2
     ORDER BY "blockId" ASC`,
    [blockchainType, exchangeId],
  );
  return rows.map((r) => ({ blockId: r.blockId, newFeePPM: r.newFeePPM }));
}

async function queryPairFeeHistory(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
): Promise<Map<number, FeePPMEntry[]>> {
  const rows: any[] = await ds.query(
    `SELECT "pairId" as "pairId", "blockId" as "blockId", "newFeePPM" as "newFeePPM"
     FROM "pair-trading-fee-ppm-updated-events"
     WHERE "blockchainType" = $1 AND "exchangeId" = $2
     ORDER BY "pairId" ASC, "blockId" ASC`,
    [blockchainType, exchangeId],
  );
  const map = new Map<number, FeePPMEntry[]>();
  for (const r of rows) {
    if (!map.has(r.pairId)) map.set(r.pairId, []);
    map.get(r.pairId)!.push({ blockId: r.blockId, newFeePPM: r.newFeePPM });
  }
  return map;
}

async function queryVoucherTransfers(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
): Promise<Map<string, VoucherTransfer[]>> {
  const rows: any[] = await ds.query(
    `SELECT
      "strategyId" as "strategyId",
      "blockId" as "blockId",
      "transactionIndex" as "transactionIndex",
      "logIndex" as "logIndex",
      "to" as "to"
     FROM "voucher-transfer-events"
     WHERE "blockchainType" = $1 AND "exchangeId" = $2
     ORDER BY "blockId" ASC, "transactionIndex" ASC, "logIndex" ASC`,
    [blockchainType, exchangeId],
  );
  const map = new Map<string, VoucherTransfer[]>();
  for (const r of rows) {
    if (!map.has(r.strategyId)) map.set(r.strategyId, []);
    map.get(r.strategyId)!.push({
      strategyId: r.strategyId,
      blockId: r.blockId,
      transactionIndex: r.transactionIndex,
      logIndex: r.logIndex,
      to: r.to,
    });
  }
  return map;
}

async function queryTradeDirectionsForTxHashes(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
  txHashes: string[],
): Promise<Map<string, TradeDirectionEntry[]>> {
  const map = new Map<string, TradeDirectionEntry[]>();
  if (txHashes.length === 0) return map;

  const rows: any[] = await ds.query(
    `SELECT "transactionHash" as "transactionHash", "logIndex" as "logIndex", "byTargetAmount" as "byTargetAmount"
     FROM "tokens-traded-events"
     WHERE "blockchainType" = $1 AND "exchangeId" = $2
       AND "transactionHash" = ANY($3)
     ORDER BY "transactionHash", "logIndex"`,
    [blockchainType, exchangeId, txHashes],
  );
  for (const r of rows) {
    if (!map.has(r.transactionHash)) map.set(r.transactionHash, []);
    map.get(r.transactionHash)!.push({ logIndex: r.logIndex, byTargetAmount: r.byTargetAmount });
  }
  return map;
}

async function queryUpdatedEventsBatch(
  ds: DataSource,
  blockchainType: string,
  exchangeId: string,
  offset: number,
  limit: number,
): Promise<any[]> {
  return ds.query(
    `SELECT
      "strategyId" as "strategyId",
      "blockId" as "blockId",
      "transactionIndex" as "transactionIndex",
      "logIndex" as "logIndex",
      "transactionHash" as "transactionHash",
      "timestamp" as "timestamp",
      order0, order1, reason,
      "token0Id" as "token0Id",
      "token1Id" as "token1Id",
      "pairId" as "pairId"
     FROM "strategy-updated-events"
     WHERE "blockchainType" = $1 AND "exchangeId" = $2
     ORDER BY "strategyId" ASC, "blockId" ASC, "transactionIndex" ASC, "logIndex" ASC
     LIMIT $3 OFFSET $4`,
    [blockchainType, exchangeId, limit, offset],
  );
}

// ---------------------------------------------------------------------------
// Main processing
// ---------------------------------------------------------------------------

function createdToRawEvent(c: CreatedEventRow): RawEvent {
  return {
    strategyId: c.strategyId,
    blockId: c.blockId,
    transactionIndex: c.transactionIndex,
    logIndex: c.logIndex,
    transactionHash: c.transactionHash,
    timestamp: c.timestamp,
    order0: c.order0,
    order1: c.order1,
    reason: 2,
    owner: c.owner,
    token0Id: c.token0Id,
    token1Id: c.token1Id,
    pairId: c.pairId,
  };
}

function rowToRawEvent(r: any): RawEvent {
  return {
    strategyId: r.strategyId,
    blockId: r.blockId,
    transactionIndex: r.transactionIndex,
    logIndex: r.logIndex,
    transactionHash: r.transactionHash,
    timestamp: r.timestamp,
    order0: r.order0,
    order1: r.order1,
    reason: r.reason,
    token0Id: r.token0Id,
    token1Id: r.token1Id,
    pairId: r.pairId,
  };
}

function flushStrategy(
  strategyId: string,
  accumulatedEvents: RawEvent[],
  createdEvents: Map<string, CreatedEventRow>,
  tokenMap: Map<number, TokenInfo>,
  pairFeeHistory: Map<number, FeePPMEntry[]>,
  globalFeeHistory: FeePPMEntry[],
  transferMap: Map<string, VoucherTransfer[]>,
  tradeDirectionMap: Map<string, TradeDirectionEntry[]>,
  stream: WriteStream,
): number {
  const created = createdEvents.get(strategyId);
  if (!created) return 0;

  const creationEvent = createdToRawEvent(created);
  const allEvents = sortEvents([creationEvent, ...accumulatedEvents]);

  const token0 = tokenMap.get(created.token0Id);
  const token1 = tokenMap.get(created.token1Id);
  if (!token0 || !token1) {
    console.warn(
      `Skipping strategy ${strategyId}: token info not found (t0Id=${created.token0Id}, t1Id=${created.token1Id})`,
    );
    return 0;
  }

  const transfers = transferMap.get(strategyId) || [];
  const rows = processStrategyEvents(
    allEvents,
    token0,
    token1,
    created.pairId,
    pairFeeHistory,
    globalFeeHistory,
    transfers,
    created.owner,
    tradeDirectionMap,
  );

  for (const row of rows) {
    stream.write(csvRowToLine(row) + '\n');
  }

  return rows.length;
}

async function main() {
  const startTime = Date.now();
  console.log('Starting strategy CSV generation...');

  const options = parseArgs();
  const depConfig = DEPLOYMENT_MAP[options.deployment];
  console.log(`Deployment: ${options.deployment} (${depConfig.blockchainType} / ${depConfig.exchangeId})`);
  console.log(`Output: ${options.outputPath}`);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const ds = createDataSource();
  await ds.initialize();
  console.log('Database connected');

  try {
    // Upfront queries
    console.log('Loading tokens...');
    const tokenMap = await queryTokens(ds, depConfig.blockchainType, depConfig.exchangeId);
    console.log(`  ${tokenMap.size} tokens loaded`);

    console.log('Loading created events...');
    const createdEvents = await queryCreatedEvents(ds, depConfig.blockchainType, depConfig.exchangeId);
    console.log(`  ${createdEvents.size} strategies`);

    console.log('Loading fee PPM history...');
    const globalFeeHistory = await queryGlobalFeeHistory(ds, depConfig.blockchainType, depConfig.exchangeId);
    const pairFeeHistory = await queryPairFeeHistory(ds, depConfig.blockchainType, depConfig.exchangeId);
    console.log(`  ${globalFeeHistory.length} global fee updates, ${pairFeeHistory.size} pairs with custom fees`);

    console.log('Loading voucher transfers...');
    const transferMap = await queryVoucherTransfers(ds, depConfig.blockchainType, depConfig.exchangeId);
    console.log(`  ${transferMap.size} strategies with transfers`);

    // Open CSV stream
    const stream = createWriteStream(options.outputPath);
    stream.write(CSV_HEADERS.join(',') + '\n');

    // Stream updated events in batches
    console.log('Processing updated events in batches...');
    let offset = 0;
    let totalRows = 0;
    let totalStrategies = 0;
    let currentStrategyId: string | null = null;
    let currentStrategyEvents: RawEvent[] = [];
    let tradeDirectionMap = new Map<string, TradeDirectionEntry[]>();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await queryUpdatedEventsBatch(
        ds,
        depConfig.blockchainType,
        depConfig.exchangeId,
        offset,
        BATCH_SIZE,
      );

      if (batch.length === 0) break;

      // Collect distinct tx hashes for trade events in this batch (plus carry-over)
      const tradeTxHashes = new Set<string>();
      for (const row of batch) {
        if (row.reason === 1) tradeTxHashes.add(row.transactionHash);
      }
      for (const ev of currentStrategyEvents) {
        if (ev.reason === 1) tradeTxHashes.add(ev.transactionHash);
      }

      // Load trade directions only for the tx hashes we need
      tradeDirectionMap = await queryTradeDirectionsForTxHashes(
        ds,
        depConfig.blockchainType,
        depConfig.exchangeId,
        Array.from(tradeTxHashes),
      );

      for (const row of batch) {
        const event = rowToRawEvent(row);

        if (currentStrategyId !== null && event.strategyId !== currentStrategyId) {
          const written = flushStrategy(
            currentStrategyId,
            currentStrategyEvents,
            createdEvents,
            tokenMap,
            pairFeeHistory,
            globalFeeHistory,
            transferMap,
            tradeDirectionMap,
            stream,
          );
          totalRows += written;
          totalStrategies++;
          currentStrategyEvents = [];
        }

        currentStrategyId = event.strategyId;
        currentStrategyEvents.push(event);
      }

      offset += batch.length;
      console.log(
        `  Processed ${offset} updated events so far (${totalStrategies} strategies flushed, ${totalRows} CSV rows)`,
      );
    }

    // Flush the last strategy
    if (currentStrategyId !== null) {
      // Load directions for any remaining carry-over trade events
      const remainingTxHashes = new Set<string>();
      for (const ev of currentStrategyEvents) {
        if (ev.reason === 1) remainingTxHashes.add(ev.transactionHash);
      }
      if (remainingTxHashes.size > 0) {
        const lastDirMap = await queryTradeDirectionsForTxHashes(
          ds,
          depConfig.blockchainType,
          depConfig.exchangeId,
          Array.from(remainingTxHashes),
        );
        lastDirMap.forEach((v, k) => tradeDirectionMap.set(k, v));
      }

      const written = flushStrategy(
        currentStrategyId,
        currentStrategyEvents,
        createdEvents,
        tokenMap,
        pairFeeHistory,
        globalFeeHistory,
        transferMap,
        tradeDirectionMap,
        stream,
      );
      totalRows += written;
      totalStrategies++;
    }

    // Handle strategies that were created but never updated
    for (const [strategyId, created] of createdEvents) {
      if (totalStrategies > 0 && currentStrategyId === strategyId) continue;

      const hasUpdates = await ds.query(
        `SELECT 1 FROM "strategy-updated-events" WHERE "strategyId" = $1 AND "blockchainType" = $2 AND "exchangeId" = $3 LIMIT 1`,
        [strategyId, depConfig.blockchainType, depConfig.exchangeId],
      );

      if (hasUpdates.length === 0) {
        const written = flushStrategy(
          strategyId,
          [],
          createdEvents,
          tokenMap,
          pairFeeHistory,
          globalFeeHistory,
          transferMap,
          tradeDirectionMap,
          stream,
        );
        totalRows += written;
        totalStrategies++;
      }
    }

    stream.end();
    await new Promise<void>((resolve) => stream.on('finish', resolve));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `Done! ${totalRows} CSV rows for ${totalStrategies} strategies written to ${options.outputPath} (${elapsed}s)`,
    );
  } finally {
    await ds.destroy();
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
