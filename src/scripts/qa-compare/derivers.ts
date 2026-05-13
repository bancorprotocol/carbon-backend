import { fetchOnce, fetchPair, Semaphore } from './fetcher';
import { DerivedContext } from './types';
import { dbPickAnyPair, dbPickMerklPair } from './db';
import { getChainConfig } from './chain-config';

interface DeriveOpts {
  staging: string;
  prod: string;
  chain: string;
  semaphore?: Semaphore;
  blockToleranceOverride: number | null;
}

const join = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;

/**
 * Build the per-chain DerivedContext used by every parameterized endpoint.
 *
 * Strategy: prod is the source of truth for params. We fetch parallel where possible.
 * If prod fails, fall back to staging. The same params are then used on both sides
 * for fairness so any difference is real, not a function of input drift.
 */
export async function deriveContext(opts: DeriveOpts): Promise<DerivedContext> {
  const { staging, prod, chain, semaphore } = opts;
  const notes: string[] = [];

  const stateUrl = (base: string) => join(base, `/v1/${chain}/state`);
  const { staging: stateStaging, prod: stateProd } = await fetchPair(
    stateUrl(staging),
    stateUrl(prod),
    { timeoutMs: 15000 },
    semaphore,
  );

  const stagingState =
    stateStaging.jsonOk && typeof stateStaging.body?.lastBlock === 'number'
      ? { lastBlock: stateStaging.body.lastBlock as number, timestamp: String(stateStaging.body.timestamp) }
      : null;
  const prodState =
    stateProd.jsonOk && typeof stateProd.body?.lastBlock === 'number'
      ? { lastBlock: stateProd.body.lastBlock as number, timestamp: String(stateProd.body.timestamp) }
      : null;

  if (!stagingState) notes.push(`state staging: ${stateStaging.status} ${stateStaging.error ?? ''}`.trim());
  if (!prodState) notes.push(`state prod: ${stateProd.status} ${stateProd.error ?? ''}`.trim());

  let blockDiff: number | null = null;
  let blockTolerance = opts.blockToleranceOverride ?? 50;
  if (stagingState && prodState) {
    blockDiff = stagingState.lastBlock - prodState.lastBlock;
    if (opts.blockToleranceOverride === null) {
      blockTolerance = Math.max(50, Math.abs(blockDiff) + 50);
    }
  }

  // Fan out: tokens, coingecko/pairs, all-data, strategies-sample. Use prod as source.
  const sourceBase = prodState ? prod : staging;
  const sourceLabel = prodState ? 'prod' : 'staging';

  const [tokensRes, pairsRes, strategiesRes, merklRes] = await Promise.all([
    fetchOnce(join(sourceBase, `/v1/${chain}/tokens`), { timeoutMs: 25000 }),
    fetchOnce(join(sourceBase, `/v1/${chain}/coingecko/pairs`), { timeoutMs: 25000 }),
    fetchOnce(join(sourceBase, `/v1/${chain}/strategies?pageSize=10&page=0`), { timeoutMs: 30000 }),
    fetchOnce(join(sourceBase, `/v1/${chain}/merkle/all-data`), { timeoutMs: 20000 }),
  ]);

  const tokens: string[] = [];
  if (tokensRes.jsonOk && Array.isArray(tokensRes.body)) {
    for (const t of tokensRes.body) {
      if (t && typeof t.address === 'string') tokens.push(t.address);
    }
  } else {
    notes.push(`tokens (${sourceLabel}): ${tokensRes.status} ${tokensRes.error ?? ''}`.trim());
  }

  const tickerIds: string[] = [];
  if (pairsRes.jsonOk && Array.isArray(pairsRes.body)) {
    for (const p of pairsRes.body) {
      if (p && typeof p.ticker_id === 'string') tickerIds.push(p.ticker_id);
    }
  } else {
    notes.push(`coingecko/pairs (${sourceLabel}): ${pairsRes.status} ${pairsRes.error ?? ''}`.trim());
  }

  let strategySample: DerivedContext['strategySample'] = null;
  const stratList = strategiesRes.jsonOk
    ? Array.isArray(strategiesRes.body)
      ? strategiesRes.body
      : Array.isArray(strategiesRes.body?.strategies)
      ? strategiesRes.body.strategies
      : null
    : null;
  if (stratList && stratList.length > 0) {
    const s = stratList[0];
    if (s && typeof s.id === 'string' && typeof s.base === 'string' && typeof s.quote === 'string') {
      strategySample = { id: s.id, base: s.base, quote: s.quote };
    }
  } else if (!strategiesRes.jsonOk) {
    notes.push(`strategies (${sourceLabel}): ${strategiesRes.status} ${strategiesRes.error ?? ''}`.trim());
  }

  let merklPair: DerivedContext['merklPair'] = null;
  if (merklRes.jsonOk && Array.isArray(merklRes.body) && merklRes.body.length > 0) {
    const first = merklRes.body[0];
    if (first && typeof first.pair === 'string' && first.pair.includes('_')) {
      const [t0, t1] = first.pair.split('_');
      merklPair = { token0: t0, token1: t1 };
    }
  }
  if (!merklPair) {
    try {
      const dbPair = await dbPickMerklPair(chain);
      if (dbPair) {
        merklPair = dbPair;
        notes.push(`merkl pair derived from external DB`);
      }
    } catch (e: any) {
      notes.push(`merkl DB lookup failed: ${e?.message ?? e}`);
    }
  }

  // Derive event block range.
  let eventRange: DerivedContext['eventRange'] = null;
  if (stagingState && prodState) {
    const safeTop = Math.min(stagingState.lastBlock, prodState.lastBlock) - 5;
    if (safeTop > 0) {
      eventRange = { fromBlock: Math.max(0, safeTop - 1000), toBlock: safeTop };
    }
  }

  // Derive a real pairId from a dex-screener events sample (so /dex-screener/pair has a valid id).
  let dexScreenerPairId: string | null = null;
  let geckoTerminalPairId: string | null = null;
  if (eventRange) {
    const evUrl = join(
      sourceBase,
      `/v1/${chain}/dex-screener/events?fromBlock=${eventRange.fromBlock}&toBlock=${eventRange.toBlock}`,
    );
    const evRes = await fetchOnce(evUrl, { timeoutMs: 30000 });
    if (evRes.jsonOk && Array.isArray(evRes.body?.events)) {
      for (const e of evRes.body.events) {
        if (e && typeof e.pairId !== 'undefined') {
          const idStr = String(e.pairId);
          if (idStr.length > 0) {
            dexScreenerPairId = idStr;
            break;
          }
        }
      }
    }
  }

  // For gecko-terminal, the pairId is "{controllerAddress}-{N}". Derive from events sample first.
  if (eventRange) {
    const evUrl = join(
      sourceBase,
      `/v1/${chain}/gecko-terminal/events?fromBlock=${eventRange.fromBlock}&toBlock=${eventRange.toBlock}`,
    );
    const evRes = await fetchOnce(evUrl, { timeoutMs: 30000 });
    if (evRes.jsonOk && Array.isArray(evRes.body?.events)) {
      for (const e of evRes.body.events) {
        if (e && typeof e.pairId === 'string' && e.pairId.includes('-')) {
          geckoTerminalPairId = e.pairId;
          break;
        }
      }
    }
  }

  // DB fallback for low-volume chains where the events window has no rows.
  if (!dexScreenerPairId || !geckoTerminalPairId) {
    try {
      const dbPair = await dbPickAnyPair(chain);
      if (dbPair) {
        if (!dexScreenerPairId) {
          dexScreenerPairId = String(dbPair.pairId);
          notes.push(`dex-screener pairId derived from external DB (pair #${dbPair.pairId})`);
        }
        if (!geckoTerminalPairId) {
          const cfg = getChainConfig(chain);
          if (cfg) {
            geckoTerminalPairId = `${cfg.carbonController}-${dbPair.pairId}`;
            notes.push(`gecko-terminal pairId derived from external DB (${geckoTerminalPairId})`);
          }
        }
      } else {
        notes.push(`no pairs in external DB for ${chain}`);
      }
    } catch (e: any) {
      notes.push(`pair DB lookup failed: ${e?.message ?? e}`);
    }
  }

  return {
    staging: stagingState,
    prod: prodState,
    stateOk: !!(stagingState && prodState),
    blockDiff,
    blockTolerance,
    tokens,
    tickerIds,
    strategySample,
    eventRange,
    dexScreenerPairId,
    geckoTerminalPairId,
    merklPair,
    derivationNotes: notes,
  };
}
