/**
 * Resets all gradient harvested data so it gets re-harvested with fixed code.
 *
 * Deletes:
 * - All gradient event rows (created, updated, deleted, liquidity_updated)
 * - All gradient activity rows from activities-v2
 * - All gradient dex-screener rows
 * - Last-processed-block entries for gradient harvesters
 *
 * Usage: npx ts-node src/scripts/reset-gradient-data.ts
 *
 * Requires DATABASE_URL env var or the standard PG env vars.
 */

import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || undefined;

async function main() {
  const client = new Client(connectionString ? { connectionString } : undefined);
  await client.connect();

  console.log('Resetting gradient data...\n');

  const gradientEventTables = [
    'gradient_strategy_created_events',
    'gradient_strategy_updated_events',
    'gradient_strategy_deleted_events',
    'gradient_strategy_liquidity_updated_events',
  ];

  for (const table of gradientEventTables) {
    const res = await client.query(`DELETE FROM ${table}`);
    console.log(`  Deleted ${res.rowCount} rows from ${table}`);
  }

  const actRes = await client.query(`
    DELETE FROM "activities-v2"
    WHERE "strategyId" IN (
      SELECT DISTINCT "strategyId" FROM gradient_strategy_created_events
    )
  `);
  console.log(`  Deleted ${actRes.rowCount} gradient rows from activities-v2 (via join — may be 0 since events already deleted)`);

  const actRes2 = await client.query(`
    DELETE FROM "activities-v2"
    WHERE "baseSellToken" = 'UNKNOWN' OR "quoteBuyToken" = 'UNKNOWN'
  `);
  console.log(`  Deleted ${actRes2.rowCount} UNKNOWN-token rows from activities-v2`);

  const actRes3 = await client.query(`
    DELETE FROM "activities-v2"
    WHERE action IN ('strategy_created', 'strategy_deleted', 'strategy_edited', 'token_sell_executed')
  `);
  console.log(`  Deleted ${actRes3.rowCount} old-action-type rows from activities-v2`);

  const lastBlockKeys = [
    '%gradient-strategy-created-events',
    '%gradient-strategy-updated-events',
    '%gradient-strategy-deleted-events',
    '%gradient-strategy-liquidity-updated-events',
    '%gradient-activities',
    '%gradient-strategies',
    '%gradient-dex-screener-v2',
    '%gradient-pair-trading-fee-ppm-events',
    '%gradient-trading-fee-ppm-events',
  ];

  for (const pattern of lastBlockKeys) {
    const res = await client.query(
      `DELETE FROM last_processed_block WHERE param LIKE $1`,
      [pattern],
    );
    console.log(`  Deleted ${res.rowCount} last-processed-block entries matching "${pattern}"`);
  }

  console.log('\nDone. Restart the backend to trigger re-harvest of all gradient data.');

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
