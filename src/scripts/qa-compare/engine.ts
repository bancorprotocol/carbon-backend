import { performance } from 'perf_hooks';
import { fetchPair, pMap, Semaphore } from './fetcher';
import { deriveContext } from './derivers';
import { ENDPOINT_SPECS } from './probes';
import {
  ChainResult,
  CliArgs,
  DerivedContext,
  EndpointSpec,
  HttpResult,
  ProbeResult,
  RunOutput,
  Verdict,
} from './types';

const join = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;

function buildUrl(base: string, chain: string, spec: EndpointSpec, query: Record<string, string> | null): string {
  const path = `/v1/${chain}${spec.pathSuffix}`;
  if (!query || Object.keys(query).length === 0) return join(base, path);
  const qs = new URLSearchParams(query).toString();
  return join(base, `${path}?${qs}`);
}

const skipResult = (reason: string): { staging: HttpResult; prod: HttpResult } => {
  const empty: HttpResult = {
    url: '',
    status: 0,
    ms: 0,
    sizeBytes: 0,
    bodyRaw: '',
    body: null,
    jsonOk: false,
    attempts: 0,
    error: reason,
  };
  return { staging: empty, prod: empty };
};

export async function runChain(
  chain: string,
  args: CliArgs,
  globalSem: Semaphore,
  onProbe?: (chain: string, spec: EndpointSpec, result: ProbeResult) => void,
): Promise<ChainResult> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  // Derive context (per-chain phase). Internal HTTP uses the global semaphore via fetchPair / fetchOnce indirectly.
  // We pass the semaphore to fetchPair via deriveContext. fetchOnce calls inside derivers are not gated, but their
  // total concurrency is naturally bounded by the chain pool.
  const ctx: DerivedContext = await deriveContext({
    staging: args.staging,
    prod: args.prod,
    chain,
    semaphore: globalSem,
    blockToleranceOverride: args.blockToleranceOverride,
  });

  const filteredSpecs = ENDPOINT_SPECS.filter((s) => {
    if (s.optional && !args.includeHistorical) return false;
    if (args.endpoints && !args.endpoints.includes(s.id)) return false;
    return true;
  });

  // Run all endpoint probes in parallel up to args.concurrency.
  const probes: ProbeResult[] = await pMap(filteredSpecs, args.concurrency, async (spec) => {
    const probeStart = performance.now();
    let query: Record<string, string> | null = null;
    if (spec.buildQuery) {
      try {
        query = spec.buildQuery(ctx);
      } catch (e: any) {
        query = null;
      }
      if (query === null) {
        const reason = `derivation unavailable for needed inputs (${(spec.needs || []).join(',') || '?'})`;
        const { staging, prod } = skipResult(reason);
        const res: ProbeResult = {
          chain,
          endpointId: spec.id,
          pathStaging: '',
          pathProd: '',
          staging,
          prod,
          verdict: 'SKIP',
          reason,
          classifier: spec.classifier,
          durationMs: Math.round(performance.now() - probeStart),
        };
        onProbe?.(chain, spec, res);
        return res;
      }
    }
    const stagingUrl = buildUrl(args.staging, chain, spec, query);
    const prodUrl = buildUrl(args.prod, chain, spec, query);
    const { staging, prod } = await fetchPair(stagingUrl, prodUrl, { timeoutMs: spec.timeoutMs ?? 20000 }, globalSem);

    let verdict: Verdict;
    let reason: string;
    let metrics;
    try {
      const out = spec.comparator(staging, prod, ctx, args);
      verdict = out.verdict;
      reason = out.reason;
      metrics = out.metrics;
    } catch (e: any) {
      verdict = 'FAIL';
      reason = `comparator threw: ${e?.message ?? e}`;
    }

    const res: ProbeResult = {
      chain,
      endpointId: spec.id,
      pathStaging: stagingUrl,
      pathProd: prodUrl,
      staging,
      prod,
      verdict,
      reason,
      metrics,
      classifier: spec.classifier,
      durationMs: Math.round(performance.now() - probeStart),
    };
    onProbe?.(chain, spec, res);
    return res;
  });

  // Always include a synthetic /state probe at the top if not already present (for the report).
  const finishedAt = new Date().toISOString();
  return {
    chain,
    blockTolerance: ctx.blockTolerance,
    blockDiff: ctx.blockDiff,
    derivationNotes: ctx.derivationNotes,
    probes,
    startedAt,
    finishedAt,
    ms: Math.round(performance.now() - t0),
  };
}

export async function runAll(
  args: CliArgs,
  onChainStart?: (chain: string) => void,
  onChainEnd?: (chain: string, r: ChainResult) => void,
  onProbe?: (chain: string, spec: EndpointSpec, r: ProbeResult) => void,
): Promise<RunOutput> {
  const startedAt = new Date().toISOString();
  // Cap total in-flight HTTP at chain × concurrency × 2 (staging+prod) — but no higher than 24.
  const globalCap = Math.min(24, Math.max(2, args.chainConcurrency * args.concurrency * 2));
  const globalSem = new Semaphore(globalCap);

  const results: ChainResult[] = await pMap(args.chains, args.chainConcurrency, async (chain) => {
    onChainStart?.(chain);
    const r = await runChain(chain, args, globalSem, onProbe);
    onChainEnd?.(chain, r);
    return r;
  });

  const finishedAt = new Date().toISOString();
  const totals: Record<Verdict, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const c of results) {
    for (const p of c.probes) totals[p.verdict]++;
  }

  return { startedAt, finishedAt, args, chains: results, totals };
}
