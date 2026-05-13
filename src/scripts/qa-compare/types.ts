export type Verdict = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

export interface HttpResult {
  url: string;
  status: number;
  ms: number;
  sizeBytes: number;
  bodyRaw: string;
  body: any;
  jsonOk: boolean;
  error?: string;
  attempts: number;
}

export interface DerivedContext {
  staging: { lastBlock: number; timestamp: string } | null;
  prod: { lastBlock: number; timestamp: string } | null;
  stateOk: boolean;
  blockDiff: number | null;
  blockTolerance: number;
  tokens: string[]; // checksum addresses
  tickerIds: string[]; // token0_token1
  strategySample: { id: string; base: string; quote: string } | null;
  eventRange: { fromBlock: number; toBlock: number } | null;
  dexScreenerPairId: string | null;
  geckoTerminalPairId: string | null;
  merklPair: { token0: string; token1: string } | null;
  derivationNotes: string[];
}

export interface ProbeMetrics {
  // Free-form numeric metrics extracted from the bodies for the report
  [key: string]: number | string | null;
}

export interface ProbeResult {
  chain: string;
  endpointId: string;
  pathStaging: string;
  pathProd: string;
  staging: HttpResult;
  prod: HttpResult;
  verdict: Verdict;
  reason: string;
  metrics?: ProbeMetrics;
  classifier: string;
  durationMs: number;
}

export interface ChainResult {
  chain: string;
  blockTolerance: number;
  blockDiff: number | null;
  derivationNotes: string[];
  probes: ProbeResult[];
  startedAt: string;
  finishedAt: string;
  ms: number;
}

export interface RunOutput {
  startedAt: string;
  finishedAt: string;
  args: CliArgs;
  chains: ChainResult[];
  totals: Record<Verdict, number>;
}

export interface CliArgs {
  chains: string[];
  endpoints: string[] | null; // null = all
  outDir: string;
  staging: string;
  prod: string;
  concurrency: number;
  chainConcurrency: number;
  blockToleranceOverride: number | null;
  priceTolerancePct: number;
  volumeTolerancePct: number;
  includeHistorical: boolean;
}

export type Comparator = (
  staging: HttpResult,
  prod: HttpResult,
  ctx: DerivedContext,
  args: CliArgs,
) => { verdict: Verdict; reason: string; metrics?: ProbeMetrics };

export interface EndpointSpec {
  id: string;
  description: string;
  classifier: string;
  pathSuffix: string; // path under /v1/{chain}/...
  buildQuery?: (ctx: DerivedContext) => Record<string, string> | null; // returns null => SKIP
  needs?: Array<keyof DerivedContext>;
  comparator: Comparator;
  timeoutMs?: number;
  optional?: boolean; // only run when --include-historical
}
