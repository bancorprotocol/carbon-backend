#!/usr/bin/env ts-node
/* eslint-disable no-console */

/**
 * Generates an UPDATE SQL statement that syncs all `*-notifications` rows in
 * the `last_processed_block` table on a target DB to match the values of the
 * source DB.
 *
 * The source DB connection string is read from the `READ_REPLICA_URL` env var
 * (loaded from `.env`). Never commit the URL itself.
 *
 * Usage:
 *   npm run generate:notifications-sync-sql
 *   npm run generate:notifications-sync-sql > sync.sql
 */

import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

interface Row {
  param: string;
  block: number;
}

function resolveSourceUrl(): string {
  const url = process.env.READ_REPLICA_URL;
  if (!url || url.trim() === '') {
    console.error(
      [
        '[error] READ_REPLICA_URL is not set.',
        '        Add it to your .env (or export it in your shell) before running this script.',
        '        Example: READ_REPLICA_URL="postgresql://user:pass@host:port/db"',
      ].join('\n'),
    );
    process.exit(1);
  }
  return url;
}

async function fetchRows(sourceUrl: string): Promise<Row[]> {
  const client = new Client({
    connectionString: sourceUrl,
    // Managed Postgres providers (Timescale Cloud, RDS, etc.) require TLS.
    // rejectUnauthorized=false avoids needing a CA bundle for a read-only sync.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const res = await client.query<Row>(
      `SELECT param, block
       FROM last_processed_block
       WHERE param LIKE '%-notifications'
       ORDER BY param`,
    );
    return res.rows;
  } finally {
    await client.end();
  }
}

function escapeSqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function buildSql(rows: Row[]): string {
  if (rows.length === 0) {
    return '-- No notification rows found in source DB.\n';
  }

  const paramWidth = Math.max(...rows.map((r) => escapeSqlString(r.param).length));
  const blockWidth = Math.max(...rows.map((r) => String(r.block).length));

  const valuesLines = rows.map((r, i) => {
    const paramLit = escapeSqlString(r.param).padEnd(paramWidth);
    const blockLit = String(r.block).padStart(blockWidth);
    const sep = i === rows.length - 1 ? '' : ',';
    return `    (${paramLit}, ${blockLit})${sep}`;
  });

  const generatedAt = new Date().toISOString();

  return [
    `-- Generated at ${generatedAt}`,
    `-- Source rows: ${rows.length}`,
    '-- Run this on the TARGET database to sync notification block pointers.',
    '-- Safe to re-run: only updates rows whose param already exists on target.',
    '',
    'BEGIN;',
    '',
    'UPDATE last_processed_block AS lpb',
    'SET block = v.block,',
    '    "updatedAt" = now()',
    'FROM (VALUES',
    ...valuesLines,
    ') AS v(param, block)',
    'WHERE lpb.param = v.param;',
    '',
    '-- Sanity check (rows must all show the new block values):',
    `-- SELECT param, block, "updatedAt" FROM last_processed_block WHERE param LIKE '%-notifications' ORDER BY param;`,
    '',
    'COMMIT;',
    '',
  ].join('\n');
}

async function main() {
  const sourceUrl = resolveSourceUrl();
  console.error(`[info] connecting to source DB: ${redact(sourceUrl)}`);

  const rows = await fetchRows(sourceUrl);
  console.error(`[info] fetched ${rows.length} notification rows`);

  const sql = buildSql(rows);
  process.stdout.write(sql);
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url;
  }
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
