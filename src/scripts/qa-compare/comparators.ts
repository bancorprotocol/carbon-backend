import { Comparator, HttpResult, Verdict, ProbeMetrics } from './types';

const trim = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…(${s.length}b)` : s);

function pctDiff(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b)) return Infinity;
  if (a === 0 && b === 0) return 0;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return (Math.abs(a - b) / denom) * 100;
}

function bothOk(staging: HttpResult, prod: HttpResult) {
  const okS = staging.status >= 200 && staging.status < 300 && staging.jsonOk;
  const okP = prod.status >= 200 && prod.status < 300 && prod.jsonOk;
  return { okS, okP };
}

function statusGate(
  staging: HttpResult,
  prod: HttpResult,
): { gated: boolean; verdict: Verdict; reason: string } | null {
  const { okS, okP } = bothOk(staging, prod);
  if (okS && okP) return null;

  // When neither side is OK, judge by whether they at least *agree*.
  if (!okS && !okP) {
    // Same status + same body excerpt → both sides consistently broken / consistently 4xx
    if (staging.status > 0 && staging.status === prod.status) {
      const sBody = trim(staging.bodyRaw, 200);
      const pBody = trim(prod.bodyRaw, 200);
      if (sBody === pBody) {
        const verdict: Verdict = staging.status >= 500 ? 'WARN' : 'PASS';
        return {
          gated: true,
          verdict,
          reason: `both sides returned ${staging.status} with identical body (${trim(sBody, 80)}) — consistent`,
        };
      }
      return {
        gated: true,
        verdict: 'WARN',
        reason: `both ${staging.status} but bodies differ: staging=${trim(sBody, 80)} prod=${trim(pBody, 80)}`,
      };
    }
    // Genuine outage / both timed out
    return {
      gated: true,
      verdict: 'FAIL',
      reason: `both environments returned non-OK: staging=${staging.status} prod=${prod.status} sErr=${
        staging.error ?? ''
      } pErr=${prod.error ?? ''}`,
    };
  }
  if (!okS) {
    return {
      gated: true,
      verdict: 'FAIL',
      reason: `staging non-OK ${staging.status} (${trim(staging.bodyRaw, 120)}) while prod=${prod.status}`,
    };
  }
  return {
    gated: true,
    verdict: 'FAIL',
    reason: `prod non-OK ${prod.status} (${trim(prod.bodyRaw, 120)}) while staging=${staging.status}`,
  };
}

const VERDICT_ORDER: Record<Verdict, number> = { PASS: 0, WARN: 1, FAIL: 2, SKIP: -1 };
const worse = (a: Verdict, b: Verdict): Verdict => (VERDICT_ORDER[b] > VERDICT_ORDER[a] ? b : a);

/** Always require both to be 200 + JSON; specific comparator does the actual work. */
function withGate(c: Comparator): Comparator {
  return (staging, prod, ctx, args) => {
    const gate = statusGate(staging, prod);
    if (gate) return { verdict: gate.verdict, reason: gate.reason };
    return c(staging, prod, ctx, args);
  };
}

/** Block-sensitive: latest-block / state. */
export const blockSensitive: Comparator = withGate((staging, prod, ctx) => {
  const sLast = pickNumber(staging.body, ['lastBlock', 'block.blockNumber']);
  const pLast = pickNumber(prod.body, ['lastBlock', 'block.blockNumber']);
  const metrics: ProbeMetrics = { stagingBlock: sLast ?? null, prodBlock: pLast ?? null };
  if (sLast === null || pLast === null) {
    return {
      verdict: 'WARN',
      reason: `could not find lastBlock/block.blockNumber in body (staging=${trim(staging.bodyRaw, 120)})`,
      metrics,
    };
  }
  const diff = sLast - pLast;
  metrics.blockDiff = diff;
  if (Math.abs(diff) <= ctx.blockTolerance) {
    return { verdict: 'PASS', reason: `block diff ${diff} within ±${ctx.blockTolerance}`, metrics };
  }
  if (Math.abs(diff) <= ctx.blockTolerance * 5) {
    return {
      verdict: 'WARN',
      reason: `block diff ${diff} exceeds tolerance ±${ctx.blockTolerance} (5x window)`,
      metrics,
    };
  }
  return {
    verdict: 'FAIL',
    reason: `block diff ${diff} far exceeds tolerance ±${ctx.blockTolerance} — indexer stalled?`,
    metrics,
  };
});

/** Numeric metric tolerance: useful for analytics/generic, trades_count, volume, tvl. */
export function cumulativeMetric(numericFields: string[], allowAbsoluteTinyDiff = 5): Comparator {
  return withGate((staging, prod, _ctx, args) => {
    const tol = args.volumeTolerancePct;
    const sBody = pickFirstObject(staging.body);
    const pBody = pickFirstObject(prod.body);
    if (!sBody || !pBody) {
      return { verdict: 'WARN', reason: 'expected object/array-of-objects payload but got something else' };
    }
    const metrics: ProbeMetrics = {};
    let worst: Verdict = 'PASS';
    const reasons: string[] = [];
    for (const f of numericFields) {
      const a = toNumber(sBody[f]);
      const b = toNumber(pBody[f]);
      if (a === null || b === null) {
        reasons.push(`${f}: missing (s=${sBody[f]}, p=${pBody[f]})`);
        worst = worse(worst, 'WARN');
        continue;
      }
      metrics[`${f}_staging`] = a;
      metrics[`${f}_prod`] = b;
      const d = pctDiff(a, b);
      metrics[`${f}_pctDiff`] = Number.isFinite(d) ? Number(d.toFixed(3)) : null;
      const absDiff = Math.abs(a - b);
      if (d <= tol || absDiff <= allowAbsoluteTinyDiff) continue;
      if (d <= tol * 10) {
        reasons.push(`${f}: ${a} vs ${b} (${d.toFixed(2)}% > ${tol}%)`);
        worst = worse(worst, 'WARN');
      } else {
        reasons.push(`${f}: ${a} vs ${b} (${d.toFixed(2)}% >> ${tol}%)`);
        worst = worse(worst, 'FAIL');
      }
    }
    if (worst === 'PASS') {
      return { verdict: 'PASS', reason: `all ${numericFields.length} fields within ±${tol}%`, metrics };
    }
    return { verdict: worst, reason: reasons.join('; '), metrics };
  });
}

/** Compare a Record<address, number> price map with --price-tolerance. */
export const livePriceMap: Comparator = withGate((staging, prod, _ctx, args) => {
  const sMap = isPlainObject(staging.body) ? (staging.body as Record<string, any>) : null;
  const pMap = isPlainObject(prod.body) ? (prod.body as Record<string, any>) : null;
  if (!sMap || !pMap) {
    return { verdict: 'WARN', reason: 'expected object price map' };
  }
  const sKeys = Object.keys(sMap);
  const pKeys = Object.keys(pMap);
  const sSet = new Set(sKeys.map((k) => k.toLowerCase()));
  const pSet = new Set(pKeys.map((k) => k.toLowerCase()));
  const missingInProd = [...sSet].filter((k) => !pSet.has(k));
  const missingInStaging = [...pSet].filter((k) => !sSet.has(k));
  const tol = args.priceTolerancePct;
  let priceMismatches = 0;
  let worst: Verdict = 'PASS';
  const reasons: string[] = [];

  for (const key of [...sSet].filter((k) => pSet.has(k)).slice(0, 1000)) {
    const ks = sKeys.find((x) => x.toLowerCase() === key)!;
    const kp = pKeys.find((x) => x.toLowerCase() === key)!;
    const a = toNumber(sMap[ks]);
    const b = toNumber(pMap[kp]);
    if (a === null || b === null) continue;
    const d = pctDiff(a, b);
    if (d > tol && !(a === 0 && b === 0)) {
      priceMismatches++;
      if (d > tol * 25) worst = worse(worst, 'FAIL');
      else worst = worse(worst, 'WARN');
      if (reasons.length < 3) reasons.push(`${key.slice(0, 10)}…: ${a} vs ${b} (${d.toFixed(2)}%)`);
    }
  }

  const metrics: ProbeMetrics = {
    stagingKeys: sKeys.length,
    prodKeys: pKeys.length,
    missingInProd: missingInProd.length,
    missingInStaging: missingInStaging.length,
    priceMismatches,
  };

  if (missingInProd.length || missingInStaging.length) {
    worst = worse(worst, 'WARN');
    reasons.push(
      `set diff: +${missingInProd.length} on staging not in prod; +${missingInStaging.length} on prod not in staging`,
    );
  }
  if (worst === 'PASS') {
    return {
      verdict: 'PASS',
      reason: `all ${Math.min(sKeys.length, pKeys.length)} prices within ±${tol}%`,
      metrics,
    };
  }
  return { verdict: worst, reason: reasons.join('; '), metrics };
});

/** /market-rate: { data: { USD: number }, provider: string } */
export const marketRateComparator: Comparator = withGate((staging, prod, _ctx, args) => {
  const a = toNumber(staging.body?.data?.USD);
  const b = toNumber(prod.body?.data?.USD);
  if (a === null || b === null) {
    return { verdict: 'WARN', reason: `missing USD field: staging=${staging.body?.data} prod=${prod.body?.data}` };
  }
  const d = pctDiff(a, b);
  const metrics: ProbeMetrics = {
    stagingUsd: a,
    prodUsd: b,
    pctDiff: Number(d.toFixed(3)),
    stagingProvider: String(staging.body?.provider ?? ''),
    prodProvider: String(prod.body?.provider ?? ''),
  };
  if (d <= args.priceTolerancePct) {
    return { verdict: 'PASS', reason: `USD price within ±${args.priceTolerancePct}% (${a} vs ${b})`, metrics };
  }
  if (d <= args.priceTolerancePct * 10) {
    return { verdict: 'WARN', reason: `USD price drift ${d.toFixed(2)}% (${a} vs ${b})`, metrics };
  }
  return { verdict: 'FAIL', reason: `USD price drift ${d.toFixed(2)}% (${a} vs ${b}) — large divergence`, metrics };
});

/** ROI: array of objects with USD/ROI fields. Compare as array of records, key by some id. */
export const roiComparator: Comparator = withGate((staging, prod, _ctx, args) => {
  const sArr = arrayOrEmpty(staging.body);
  const pArr = arrayOrEmpty(prod.body);
  const metrics: ProbeMetrics = { stagingItems: sArr.length, prodItems: pArr.length };
  if (sArr.length === 0 && pArr.length === 0) {
    return { verdict: 'PASS', reason: 'both empty', metrics };
  }
  const itemsDiff = pctDiff(sArr.length, pArr.length);
  if (itemsDiff > 5) {
    return {
      verdict: 'WARN',
      reason: `roi item count differs ${sArr.length} vs ${pArr.length}`,
      metrics,
    };
  }
  return {
    verdict: 'PASS',
    reason: `${Math.min(sArr.length, pArr.length)} ROI rows present on both`,
    metrics,
  };
});

/** Volatile lists (events, activity): compare overlap by stable key. */
export function volatileList(opts: { keyFn: (e: any) => string | null; itemPath?: string }): Comparator {
  return withGate((staging, prod) => {
    const sList = arrayOrPath(staging.body, opts.itemPath);
    const pList = arrayOrPath(prod.body, opts.itemPath);
    const sKeys = new Set<string>();
    const pKeys = new Set<string>();
    for (const e of sList) {
      const k = opts.keyFn(e);
      if (k) sKeys.add(k);
    }
    for (const e of pList) {
      const k = opts.keyFn(e);
      if (k) pKeys.add(k);
    }
    if (sKeys.size === 0 && pKeys.size === 0) {
      return { verdict: 'PASS', reason: 'both lists empty within window' };
    }
    const inter = [...sKeys].filter((k) => pKeys.has(k)).length;
    const union = new Set<string>([...sKeys, ...pKeys]).size;
    const jaccard = union > 0 ? inter / union : 1;
    const metrics: ProbeMetrics = {
      stagingItems: sList.length,
      prodItems: pList.length,
      uniqueOverlap: inter,
      jaccard: Number(jaccard.toFixed(4)),
    };
    if (jaccard >= 0.95) {
      return { verdict: 'PASS', reason: `Jaccard ${jaccard.toFixed(3)} (${inter}/${union})`, metrics };
    }
    if (jaccard >= 0.75) {
      return {
        verdict: 'WARN',
        reason: `Jaccard ${jaccard.toFixed(3)} below 0.95 (${inter}/${union})`,
        metrics,
      };
    }
    return {
      verdict: 'FAIL',
      reason: `Jaccard ${jaccard.toFixed(3)} (${inter}/${union}) — major mismatch`,
      metrics,
    };
  });
}

/** Snapshot list keyed by id (e.g. /strategies, /seed-data strategies, /wallet-pair-balance). */
export function snapshotById(opts: {
  keyFn: (e: any) => string | null;
  itemPath?: string;
  /** fields whose drift is allowed (e.g. budgets) */
  driftFields?: string[];
}): Comparator {
  return withGate((staging, prod) => {
    const sList = arrayOrPath(staging.body, opts.itemPath);
    const pList = arrayOrPath(prod.body, opts.itemPath);
    const sMap = new Map<string, any>();
    const pMap = new Map<string, any>();
    for (const e of sList) {
      const k = opts.keyFn(e);
      if (k) sMap.set(k, e);
    }
    for (const e of pList) {
      const k = opts.keyFn(e);
      if (k) pMap.set(k, e);
    }
    const inStagingNotProd = [...sMap.keys()].filter((k) => !pMap.has(k));
    const inProdNotStaging = [...pMap.keys()].filter((k) => !sMap.has(k));
    const metrics: ProbeMetrics = {
      stagingItems: sList.length,
      prodItems: pList.length,
      onlyStaging: inStagingNotProd.length,
      onlyProd: inProdNotStaging.length,
    };
    let worst: Verdict = 'PASS';
    const reasons: string[] = [];
    if (inStagingNotProd.length > 0) {
      reasons.push(
        `${inStagingNotProd.length} ids only on staging (e.g. ${inStagingNotProd.slice(0, 3).join(',')})`,
      );
      worst = worse(worst, inStagingNotProd.length > 5 ? 'FAIL' : 'WARN');
    }
    if (inProdNotStaging.length > 0) {
      reasons.push(`${inProdNotStaging.length} ids only on prod (e.g. ${inProdNotStaging.slice(0, 3).join(',')})`);
      worst = worse(worst, inProdNotStaging.length > 5 ? 'FAIL' : 'WARN');
    }
    if (worst === 'PASS') {
      return { verdict: 'PASS', reason: `${sMap.size} ids match`, metrics };
    }
    return { verdict: worst, reason: reasons.join('; '), metrics };
  });
}

/** Aggregated snapshot (e.g. /analytics/trending) — Spearman on top-K. */
export function topKRank(opts: {
  itemPath?: string;
  rankKey: (e: any) => string | null;
  k?: number;
  countOnly?: boolean;
}): Comparator {
  const k = opts.k ?? 50;
  return withGate((staging, prod) => {
    const sArr = arrayOrPath(staging.body, opts.itemPath);
    const pArr = arrayOrPath(prod.body, opts.itemPath);
    const sKeys = sArr.map(opts.rankKey).filter((x): x is string => !!x).slice(0, k);
    const pKeys = pArr.map(opts.rankKey).filter((x): x is string => !!x).slice(0, k);
    const inter = sKeys.filter((x) => pKeys.includes(x));
    const overlap = inter.length / Math.max(1, Math.min(sKeys.length, pKeys.length));
    const metrics: ProbeMetrics = {
      stagingItems: sArr.length,
      prodItems: pArr.length,
      topKOverlap: Number(overlap.toFixed(4)),
    };
    if (overlap >= 0.85 || opts.countOnly) {
      // Also accept large items count match
      const countDiff = pctDiff(sArr.length, pArr.length);
      if (countDiff > 5) {
        return { verdict: 'WARN', reason: `count diff ${countDiff.toFixed(1)}% in items`, metrics };
      }
      return { verdict: 'PASS', reason: `top-${k} overlap ${overlap.toFixed(3)}`, metrics };
    }
    if (overlap >= 0.6) {
      return { verdict: 'WARN', reason: `top-${k} overlap ${overlap.toFixed(3)} below 0.85`, metrics };
    }
    return { verdict: 'FAIL', reason: `top-${k} overlap ${overlap.toFixed(3)} — major divergence`, metrics };
  });
}

/** Compare two arrays of objects strictly by a stable key, fields exact. */
export function shapeStrictById(opts: { keyFn: (e: any) => string | null; itemPath?: string }): Comparator {
  return withGate((staging, prod) => {
    const sArr = arrayOrPath(staging.body, opts.itemPath);
    const pArr = arrayOrPath(prod.body, opts.itemPath);
    const sMap = new Map<string, any>();
    const pMap = new Map<string, any>();
    for (const e of sArr) {
      const k = opts.keyFn(e);
      if (k) sMap.set(k, e);
    }
    for (const e of pArr) {
      const k = opts.keyFn(e);
      if (k) pMap.set(k, e);
    }
    const onlyS = [...sMap.keys()].filter((k) => !pMap.has(k));
    const onlyP = [...pMap.keys()].filter((k) => !sMap.has(k));
    const fieldMismatches: string[] = [];
    let mismatchedKeys = 0;
    for (const key of sMap.keys()) {
      if (!pMap.has(key)) continue;
      const a = sMap.get(key);
      const b = pMap.get(key);
      const aJson = stableStringify(a);
      const bJson = stableStringify(b);
      if (aJson !== bJson) {
        mismatchedKeys++;
        if (fieldMismatches.length < 2) fieldMismatches.push(`${key}: ${trim(aJson, 80)} vs ${trim(bJson, 80)}`);
      }
    }
    const metrics: ProbeMetrics = {
      stagingItems: sArr.length,
      prodItems: pArr.length,
      onlyStaging: onlyS.length,
      onlyProd: onlyP.length,
      mismatchedKeys,
    };
    let worst: Verdict = 'PASS';
    const reasons: string[] = [];
    if (onlyS.length || onlyP.length) {
      const sampleS = onlyS.slice(0, 3);
      const sampleP = onlyP.slice(0, 3);
      const tail: string[] = [];
      if (sampleS.length) tail.push(`+staging: ${sampleS.join(', ')}${onlyS.length > 3 ? ` (+${onlyS.length - 3})` : ''}`);
      if (sampleP.length) tail.push(`+prod: ${sampleP.join(', ')}${onlyP.length > 3 ? ` (+${onlyP.length - 3})` : ''}`);
      reasons.push(`set diff: +${onlyS.length}staging / +${onlyP.length}prod [${tail.join('; ')}]`);
      worst = worse(worst, onlyS.length + onlyP.length > 3 ? 'FAIL' : 'WARN');
    }
    if (mismatchedKeys > 0) {
      reasons.push(`${mismatchedKeys} entries differ (${fieldMismatches.join(' | ')})`);
      worst = worse(worst, mismatchedKeys > 5 ? 'FAIL' : 'WARN');
    }
    if (worst === 'PASS') {
      return { verdict: 'PASS', reason: `${sMap.size} entries match exactly`, metrics };
    }
    return { verdict: worst, reason: reasons.join('; '), metrics };
  });
}

/** wallet-pair-balance: { blockNumber, blockTimestamp, data: { "t0_t1": { wallets: { addr: {...} } } } } */
export const walletPairBalanceComparator: Comparator = withGate((staging, prod, ctx) => {
  const sBlk = toNumber(staging.body?.blockNumber);
  const pBlk = toNumber(prod.body?.blockNumber);
  const sData = isPlainObject(staging.body?.data) ? (staging.body.data as Record<string, any>) : {};
  const pData = isPlainObject(prod.body?.data) ? (prod.body.data as Record<string, any>) : {};
  const sKeys = new Set(Object.keys(sData));
  const pKeys = new Set(Object.keys(pData));
  const onlyS = [...sKeys].filter((k) => !pKeys.has(k));
  const onlyP = [...pKeys].filter((k) => !sKeys.has(k));
  // Total wallet entries across all pairs (richer than just pair count)
  const countWallets = (m: Record<string, any>) =>
    Object.values(m).reduce((acc, v: any) => acc + (isPlainObject(v?.wallets) ? Object.keys(v.wallets).length : 0), 0);
  const sWallets = countWallets(sData);
  const pWallets = countWallets(pData);
  const metrics: ProbeMetrics = {
    stagingBlock: sBlk ?? null,
    prodBlock: pBlk ?? null,
    stagingPairs: sKeys.size,
    prodPairs: pKeys.size,
    stagingWallets: sWallets,
    prodWallets: pWallets,
    onlyStagingPairs: onlyS.length,
    onlyProdPairs: onlyP.length,
  };
  let worst: Verdict = 'PASS';
  const reasons: string[] = [];
  if (sBlk !== null && pBlk !== null) {
    const d = sBlk - pBlk;
    metrics.blockDiff = d;
    if (Math.abs(d) > ctx.blockTolerance * 5) {
      worst = worse(worst, 'WARN');
      reasons.push(`block diff ${d} > 5x tolerance`);
    }
  }
  if (onlyS.length || onlyP.length) {
    const total = onlyS.length + onlyP.length;
    worst = worse(worst, total > 5 ? 'WARN' : 'WARN');
    reasons.push(`pair set diff: +${onlyS.length}staging / +${onlyP.length}prod`);
  }
  const walletDiff = pctDiff(sWallets, pWallets);
  if (walletDiff > 5) {
    worst = worse(worst, walletDiff > 25 ? 'FAIL' : 'WARN');
    reasons.push(`wallet count diff ${sWallets} vs ${pWallets} (${walletDiff.toFixed(1)}%)`);
  }
  if (worst === 'PASS') {
    return {
      verdict: 'PASS',
      reason: `${sKeys.size} pairs / ${sWallets} wallet entries match within tolerance`,
      metrics,
    };
  }
  return { verdict: worst, reason: reasons.join('; '), metrics };
});

/** seed-data: object with strategiesByPair / tradingFeePPMByPair / latestBlockNumber maps. */
export const seedDataComparator: Comparator = withGate((staging, prod, ctx) => {
  const sStrats = isPlainObject(staging.body?.strategiesByPair) ? staging.body.strategiesByPair : {};
  const pStrats = isPlainObject(prod.body?.strategiesByPair) ? prod.body.strategiesByPair : {};
  const sFees = isPlainObject(staging.body?.tradingFeePPMByPair) ? staging.body.tradingFeePPMByPair : {};
  const pFees = isPlainObject(prod.body?.tradingFeePPMByPair) ? prod.body.tradingFeePPMByPair : {};
  const sBlk = toNumber(staging.body?.latestBlockNumber);
  const pBlk = toNumber(prod.body?.latestBlockNumber);

  // Strategy ids across all pairs
  const collectIds = (m: Record<string, any>) => {
    const ids: string[] = [];
    for (const v of Object.values(m)) {
      if (Array.isArray(v)) for (const s of v) if (s?.id) ids.push(String(s.id));
      else if (isPlainObject(v))
        for (const s of Object.values(v as Record<string, any>)) if ((s as any)?.id) ids.push(String((s as any).id));
    }
    return ids;
  };
  const sIds = new Set(collectIds(sStrats));
  const pIds = new Set(collectIds(pStrats));
  const onlyS = [...sIds].filter((x) => !pIds.has(x));
  const onlyP = [...pIds].filter((x) => !sIds.has(x));

  const sFeeKeys = new Set(Object.keys(sFees));
  const pFeeKeys = new Set(Object.keys(pFees));
  const onlySFee = [...sFeeKeys].filter((x) => !pFeeKeys.has(x));
  const onlyPFee = [...pFeeKeys].filter((x) => !sFeeKeys.has(x));

  const metrics: ProbeMetrics = {
    stagingPairs: Object.keys(sStrats).length,
    prodPairs: Object.keys(pStrats).length,
    stagingStrategies: sIds.size,
    prodStrategies: pIds.size,
    onlyStaging: onlyS.length,
    onlyProd: onlyP.length,
    stagingBlock: sBlk ?? null,
    prodBlock: pBlk ?? null,
    onlyStagingFeePairs: onlySFee.length,
    onlyProdFeePairs: onlyPFee.length,
  };
  let worst: Verdict = 'PASS';
  const reasons: string[] = [];
  if (sBlk !== null && pBlk !== null) {
    const bd = sBlk - pBlk;
    metrics.blockDiff = bd;
    if (Math.abs(bd) > ctx.blockTolerance * 5) {
      worst = worse(worst, 'WARN');
      reasons.push(`block diff ${bd} > 5x tolerance`);
    }
  }
  if (onlyS.length || onlyP.length) {
    worst = worse(worst, onlyS.length + onlyP.length > 5 ? 'FAIL' : 'WARN');
    reasons.push(
      `strategy id diff: +${onlyS.length}staging${onlyS.length ? ` (${onlyS.slice(0, 2).join(',')})` : ''} / +${onlyP.length}prod${onlyP.length ? ` (${onlyP.slice(0, 2).join(',')})` : ''}`,
    );
  }
  if (onlySFee.length || onlyPFee.length) {
    worst = worse(worst, 'WARN');
    reasons.push(`fee pair diff: +${onlySFee.length}staging / +${onlyPFee.length}prod`);
  }
  if (worst === 'PASS') {
    return {
      verdict: 'PASS',
      reason: `${sIds.size} strategies across ${Object.keys(sStrats).length} pairs match`,
      metrics,
    };
  }
  return { verdict: worst, reason: reasons.join('; '), metrics };
});

/** /merkle/all-data, /merkle/data, /merkle/rewards. */
export const merklAllDataComparator: Comparator = withGate((staging, prod, _ctx, args) => {
  const sArr = arrayOrEmpty(staging.body);
  const pArr = arrayOrEmpty(prod.body);
  const metrics: ProbeMetrics = { stagingItems: sArr.length, prodItems: pArr.length };
  if (sArr.length === 0 && pArr.length === 0) {
    return { verdict: 'PASS', reason: 'no campaigns on either', metrics };
  }
  if (sArr.length !== pArr.length) {
    return {
      verdict: 'WARN',
      reason: `campaign count differs ${sArr.length} vs ${pArr.length}`,
      metrics,
    };
  }
  const sKeyed = new Map<string, any>(sArr.map((c: any) => [c.pair, c]));
  const pKeyed = new Map<string, any>(pArr.map((c: any) => [c.pair, c]));
  let worst: Verdict = 'PASS';
  const reasons: string[] = [];
  for (const key of sKeyed.keys()) {
    if (!pKeyed.has(key)) {
      worst = worse(worst, 'WARN');
      reasons.push(`pair ${key} only on staging`);
      continue;
    }
    const a = sKeyed.get(key);
    const b = pKeyed.get(key);
    const aprDiff = pctDiff(toNumber(a?.apr) ?? 0, toNumber(b?.apr) ?? 0);
    const tvlDiff = pctDiff(toNumber(a?.tvl) ?? 0, toNumber(b?.tvl) ?? 0);
    if (aprDiff > args.priceTolerancePct * 5) {
      worst = worse(worst, aprDiff > args.priceTolerancePct * 50 ? 'FAIL' : 'WARN');
      reasons.push(`${key} apr diff ${aprDiff.toFixed(2)}%`);
    }
    if (tvlDiff > args.volumeTolerancePct * 5) {
      worst = worse(worst, tvlDiff > args.volumeTolerancePct * 50 ? 'FAIL' : 'WARN');
      reasons.push(`${key} tvl diff ${tvlDiff.toFixed(2)}%`);
    }
  }
  if (worst === 'PASS') {
    return { verdict: 'PASS', reason: `${sArr.length} campaigns match within tolerance`, metrics };
  }
  return { verdict: worst, reason: reasons.slice(0, 3).join('; '), metrics };
});

/**
 * Exact JSON deep equality of the entire response body (or a sub-path).
 * Best for "single object" endpoints like /dex-screener/asset, /dex-screener/pair, etc.
 */
export function exactJson(opts: { path?: string } = {}): Comparator {
  return withGate((staging, prod) => {
    const sub = (b: any) => {
      if (!opts.path) return b;
      const parts = opts.path.split('.');
      let cur: any = b;
      for (const p of parts) {
        if (cur && typeof cur === 'object') cur = cur[p];
        else return undefined;
      }
      return cur;
    };
    const a = sub(staging.body);
    const b = sub(prod.body);
    const aS = stableStringify(a);
    const bS = stableStringify(b);
    if (aS === bS) {
      return { verdict: 'PASS', reason: `JSON deep-equal at ${opts.path ?? '<root>'}` };
    }
    // Find a top-level key that differs to keep the reason informative.
    let firstDiffField: string | null = null;
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        if (stableStringify(a[k]) !== stableStringify(b[k])) {
          firstDiffField = k;
          break;
        }
      }
    }
    return {
      verdict: 'WARN',
      reason: firstDiffField
        ? `bodies differ at field "${firstDiffField}" (${trim(stableStringify(a?.[firstDiffField]), 80)} vs ${trim(stableStringify(b?.[firstDiffField]), 80)})`
        : `bodies differ (${trim(aS, 80)} vs ${trim(bS, 80)})`,
    };
  });
}

/**
 * Coingecko tickers comparator: live data (last_price, base_volume) drifts; we only
 * require the ticker_id set to match exactly and per-ticker numeric fields to be
 * within --price-tolerance%. Anything else is informational.
 */
export const coingeckoTickersComparator: Comparator = withGate((staging, prod, _ctx, args) => {
  const sArr = arrayOrEmpty(staging.body);
  const pArr = arrayOrEmpty(prod.body);
  const sMap = new Map<string, any>();
  const pMap = new Map<string, any>();
  for (const t of sArr) if (t?.ticker_id) sMap.set(t.ticker_id, t);
  for (const t of pArr) if (t?.ticker_id) pMap.set(t.ticker_id, t);
  const onlyS = [...sMap.keys()].filter((k) => !pMap.has(k));
  const onlyP = [...pMap.keys()].filter((k) => !sMap.has(k));
  const compareFields = ['last_price', 'base_volume', 'target_volume', 'liquidity_in_usd'];
  let worst: Verdict = 'PASS';
  let mismatchedTickers = 0;
  let missingFields = 0;
  const reasons: string[] = [];
  for (const k of sMap.keys()) {
    if (!pMap.has(k)) continue;
    const a = sMap.get(k);
    const b = pMap.get(k);
    let tickerHasMismatch = false;
    for (const f of compareFields) {
      const va = toNumber(a[f]);
      const vb = toNumber(b[f]);
      if (va === null && vb === null) continue;
      if (va === null || vb === null) {
        missingFields++;
        continue;
      }
      const d = pctDiff(va, vb);
      if (d > args.priceTolerancePct * 5) tickerHasMismatch = true;
    }
    if (tickerHasMismatch) {
      mismatchedTickers++;
      if (reasons.length < 2) reasons.push(`${k}: ${trim(stableStringify(a), 80)} vs ${trim(stableStringify(b), 80)}`);
    }
  }
  const metrics: ProbeMetrics = {
    stagingTickers: sMap.size,
    prodTickers: pMap.size,
    onlyStaging: onlyS.length,
    onlyProd: onlyP.length,
    mismatchedTickers,
    missingFields,
  };
  if (onlyS.length || onlyP.length) {
    worst = worse(worst, onlyS.length + onlyP.length > 3 ? 'FAIL' : 'WARN');
    reasons.unshift(`ticker set diff: +${onlyS.length}staging / +${onlyP.length}prod`);
  }
  if (mismatchedTickers > 0) {
    const ratio = mismatchedTickers / Math.max(1, sMap.size);
    if (ratio > 0.25) worst = worse(worst, 'WARN');
    if (ratio > 0.6) worst = worse(worst, 'FAIL');
    if (worst === 'PASS' || ratio > 0.05) {
      // Informational only when small
      if (worst === 'PASS') {
        // small live-data drift; not a problem
      } else {
        reasons.push(`${mismatchedTickers}/${sMap.size} tickers have numeric drift > ${args.priceTolerancePct * 5}%`);
      }
    }
  }
  if (worst === 'PASS') {
    return {
      verdict: 'PASS',
      reason: `${sMap.size} tickers match by id; live numeric drift within tolerance`,
      metrics,
    };
  }
  return { verdict: worst, reason: reasons.join('; '), metrics };
});

/** Generic baseline: both 200, JSON parses, sizes within 25%. */
export const baselineSize: Comparator = withGate((staging, prod) => {
  const d = pctDiff(staging.sizeBytes, prod.sizeBytes);
  const metrics: ProbeMetrics = {
    stagingBytes: staging.sizeBytes,
    prodBytes: prod.sizeBytes,
    sizePctDiff: Number(d.toFixed(3)),
  };
  if (d <= 5) return { verdict: 'PASS', reason: `size within ${d.toFixed(1)}%`, metrics };
  if (d <= 25) return { verdict: 'WARN', reason: `size differs ${d.toFixed(1)}% (${staging.sizeBytes} vs ${prod.sizeBytes})`, metrics };
  return { verdict: 'WARN', reason: `size differs ${d.toFixed(1)}% (${staging.sizeBytes} vs ${prod.sizeBytes})`, metrics };
});

// ===== helpers =====

function pickFirstObject(b: any): any | null {
  if (!b) return null;
  if (Array.isArray(b)) return b[0] ?? null;
  if (typeof b === 'object') return b;
  return null;
}

function arrayOrEmpty(b: any): any[] {
  return Array.isArray(b) ? b : [];
}

function arrayOrPath(body: any, path?: string): any[] {
  if (!path) return arrayOrEmpty(body);
  const parts = path.split('.');
  let cur: any = body;
  for (const p of parts) {
    if (cur && typeof cur === 'object') cur = cur[p];
    else return [];
  }
  return arrayOrEmpty(cur);
}

function pickNumber(body: any, paths: string[]): number | null {
  for (const path of paths) {
    const parts = path.split('.');
    let cur: any = body;
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = cur[p];
      else {
        cur = undefined;
        break;
      }
    }
    const n = toNumber(cur);
    if (n !== null) return n;
  }
  return null;
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPlainObject(b: any): b is Record<string, any> {
  return !!b && typeof b === 'object' && !Array.isArray(b);
}

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
