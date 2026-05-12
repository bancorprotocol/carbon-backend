import { Client } from 'pg';
import { getChainConfig } from './chain-config';

let cachedClient: Promise<Client | null> | null = null;
let connectAttempted = false;

/**
 * Connects to the production read-only DB using EXTERNAL_DATABASE_* env vars.
 * Returns a single shared Client (lazily connected). Returns null if env vars
 * are missing — callers should treat this as "DB unavailable" and fall back to
 * pure HTTP-based derivation.
 */
export function getExternalDb(): Promise<Client | null> {
  if (cachedClient) return cachedClient;
  cachedClient = (async () => {
    const host = process.env.EXTERNAL_DATABASE_HOST;
    const user = process.env.EXTERNAL_DATABASE_USERNAME;
    const password = process.env.EXTERNAL_DATABASE_PASSWORD;
    const database = process.env.EXTERNAL_DATABASE_NAME;
    if (!host || !user || !password || !database) return null;
    const port = parseInt(process.env.EXTERNAL_DATABASE_PORT || '27140', 10);
    const c = new Client({ host, user, password, database, port, ssl: { rejectUnauthorized: false } });
    try {
      connectAttempted = true;
      await c.connect();
      return c;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[qa-compare] external DB unavailable, falling back to API-only derivation:', (err as Error).message);
      return null;
    }
  })();
  return cachedClient;
}

export async function closeExternalDb(): Promise<void> {
  if (!connectAttempted || !cachedClient) return;
  const c = await cachedClient;
  if (c) {
    try {
      await c.end();
    } catch {
      // ignore
    }
  }
  cachedClient = null;
}

/**
 * Picks any pair (typically the first) for a chain and returns the
 * lower-cased token addresses + the numeric pair id. Used to satisfy
 * /dex-screener/pair, /gecko-terminal/pair, /merkle/data, /merkle/rewards
 * derivation when the events sampling window comes back empty.
 */
export async function dbPickAnyPair(
  exchangeId: string,
): Promise<{ pairId: number; token0: string; token1: string } | null> {
  const cfg = getChainConfig(exchangeId);
  if (!cfg) return null;
  const c = await getExternalDb();
  if (!c) return null;
  const res = await c.query<{ id: number; token0: string; token1: string }>(
    `SELECT p.id AS id,
            LOWER(t0.address) AS token0,
            LOWER(t1.address) AS token1
       FROM pairs p
       JOIN tokens t0 ON t0.id = p."token0Id"
       JOIN tokens t1 ON t1.id = p."token1Id"
      WHERE p."blockchainType" = $1
        AND p."exchangeId" = $2
      ORDER BY p.id ASC
      LIMIT 1`,
    [cfg.blockchainType, cfg.exchangeId],
  );
  if (res.rows.length === 0) return null;
  return { pairId: res.rows[0].id, token0: res.rows[0].token0, token1: res.rows[0].token1 };
}

/**
 * Looks up an *active* merkl campaign (isActive=true AND startDate <= now())
 * matching the chain and returns the pair token addresses.
 * Returns null when there is no active campaign so the merkle/data and
 * merkle/rewards probes can be skipped instead of producing 400 FAILs.
 */
export async function dbPickMerklPair(
  exchangeId: string,
): Promise<{ token0: string; token1: string } | null> {
  const cfg = getChainConfig(exchangeId);
  if (!cfg) return null;
  const c = await getExternalDb();
  if (!c) return null;
  const res = await c.query<{ token0: string; token1: string }>(
    `SELECT LOWER(t0.address) AS token0, LOWER(t1.address) AS token1
       FROM merkl_campaigns mc
       JOIN pairs p ON p.id = mc."pairId"
       JOIN tokens t0 ON t0.id = p."token0Id"
       JOIN tokens t1 ON t1.id = p."token1Id"
      WHERE mc."blockchainType" = $1
        AND mc."exchangeId" = $2
        AND mc."isActive" = true
        AND mc."startDate" <= now()
      ORDER BY mc."endDate" DESC
      LIMIT 1`,
    [cfg.blockchainType, cfg.exchangeId],
  );
  if (res.rows.length === 0) return null;
  return { token0: res.rows[0].token0, token1: res.rows[0].token1 };
}
