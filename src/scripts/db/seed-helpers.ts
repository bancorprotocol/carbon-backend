/**
 * Shared helpers for copying rows from the prod readonly DB into the local DB.
 *
 * Used by:
 *   - src/preview/seed-preview.ts  — fork-block-aware seeder for the preview backend
 *   - src/scripts/db/seed.ts       — local-dev seeder (no fork-block filter)
 */
import { Client } from 'pg';

export function createExternalClient(): Client {
  return new Client({
    host: process.env.EXTERNAL_DATABASE_HOST,
    user: process.env.EXTERNAL_DATABASE_USERNAME,
    password: process.env.EXTERNAL_DATABASE_PASSWORD,
    database: process.env.EXTERNAL_DATABASE_NAME,
    port: parseInt(process.env.EXTERNAL_DATABASE_PORT || '27140', 10),
    ssl: { rejectUnauthorized: false },
  });
}

export function createLocalClient(): Client {
  return new Client({ connectionString: process.env.DATABASE_URL });
}

/**
 * Run `query` against `ext` and INSERT every returned row into `targetTable`
 * on `local`. Single statement, ON CONFLICT DO NOTHING. Use when the result
 * set is known to fit comfortably in memory and Postgres's parameter limit.
 */
export async function copyRows(
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

/**
 * Like `copyRows` but chunks the inserts to stay under Postgres's parameter
 * limit. Use for tables with many rows or many columns.
 */
export async function copyRowsBatched(
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

/**
 * Return the comma-separated, double-quoted column list for a public.<table>.
 * Used when we want to SELECT exactly the columns that the local schema has,
 * even if prod has extra columns the local schema doesn't know about.
 * Returns an empty string when the table doesn't exist locally.
 */
export async function getTableColumns(client: Client, table: string): Promise<string> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((r) => `"${r.column_name}"`).join(', ');
}

/**
 * Reset SERIAL `id` sequences across all public tables (except `migrations`)
 * so that subsequent inserts don't collide with seeded IDs.
 */
export async function resetSequences(local: Client): Promise<void> {
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
}

export const DEPLOYMENT_TO_BLOCKCHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  sei: 'sei-network',
  celo: 'celo',
  coti: 'coti',
};
