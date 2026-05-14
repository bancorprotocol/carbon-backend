#!/usr/bin/env ts-node
/* eslint-disable no-console */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { runAll } from './qa-compare/engine';
import { writeReport } from './qa-compare/report';
import { closeExternalDb } from './qa-compare/db';
import { CliArgs, ProbeResult, Verdict } from './qa-compare/types';

dotenv.config();

const ALL_CHAINS = [
  'ethereum',
  'sei',
  'celo',
  'base-graphene',
  'mantle-graphene',
  'mantle-supernova',
  'linea-xfai',
  'base-alienbase',
  'berachain-graphene',
  'coti',
  'tac',
];

const DEFAULT_STAGING = 'https://carbon-multi-endpoint-staging-152368584642.europe-west2.run.app';
const DEFAULT_PROD = 'https://api.carbondefi.xyz';

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    chains: ALL_CHAINS.slice(),
    endpoints: null,
    outDir: path.join(process.cwd(), 'qa-reports', new Date().toISOString().replace(/[:.]/g, '-')),
    staging: DEFAULT_STAGING,
    prod: DEFAULT_PROD,
    concurrency: 3,
    chainConcurrency: 2,
    blockToleranceOverride: null,
    priceTolerancePct: 2,
    volumeTolerancePct: 1,
    includeHistorical: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const consume = () => argv[++i];
    switch (a) {
      case '--chains':
        args.chains = consume()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--endpoints':
        args.endpoints = consume()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--out-dir':
        args.outDir = path.resolve(consume());
        break;
      case '--staging':
        args.staging = consume();
        break;
      case '--prod':
        args.prod = consume();
        break;
      case '--concurrency':
        args.concurrency = Number(consume());
        break;
      case '--chain-concurrency':
        args.chainConcurrency = Number(consume());
        break;
      case '--block-tolerance':
        args.blockToleranceOverride = Number(consume());
        break;
      case '--price-tolerance':
        args.priceTolerancePct = Number(consume());
        break;
      case '--volume-tolerance':
        args.volumeTolerancePct = Number(consume());
        break;
      case '--include-historical':
        args.includeHistorical = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown arg: ${a}`);
        printHelp();
        process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Carbon API: staging vs production QA tool

Usage: ts-node src/scripts/qa-compare-staging-vs-prod.ts [options]

Options:
  --chains <csv>             Chains to test (default: all 11)
  --endpoints <csv>          Endpoint ids to test (default: all)
  --out-dir <dir>            Where to write summary.md and details.json
  --staging <url>            Staging base URL
  --prod <url>               Production base URL
  --concurrency <n>          Endpoint probes in flight per chain (default 3)
  --chain-concurrency <n>    Chains processed in parallel (default 2)
  --block-tolerance <n>      Override auto block tolerance
  --price-tolerance <pct>    USD price drift tolerance (default 2)
  --volume-tolerance <pct>   Volume/metric drift tolerance (default 1)
  --include-historical       Also probe heavy /history/prices and /simulator/create
  -h, --help                 Show this help

Available chains: ${ALL_CHAINS.join(', ')}
`);
}

function color(s: string, c: 'gray' | 'green' | 'yellow' | 'red' | 'cyan'): string {
  if (!process.stdout.isTTY) return s;
  const map: Record<string, string> = {
    gray: '\u001b[90m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    red: '\u001b[31m',
    cyan: '\u001b[36m',
  };
  return `${map[c]}${s}\u001b[0m`;
}

const VERDICT_COLOR: Record<Verdict, 'gray' | 'green' | 'yellow' | 'red' | 'cyan'> = {
  PASS: 'green',
  WARN: 'yellow',
  FAIL: 'red',
  SKIP: 'gray',
};

async function main() {
  const args = parseArgs(process.argv);
  console.log(color('==> Carbon API QA: staging vs production', 'cyan'));
  console.log(`    chains=${args.chains.length} endpoints=${args.endpoints?.length ?? 'all'}`);
  console.log(`    chainConcurrency=${args.chainConcurrency} concurrency=${args.concurrency}`);
  console.log(`    out=${args.outDir}`);

  const probesPrinted = new Map<string, number>();
  for (const c of args.chains) probesPrinted.set(c, 0);

  const start = Date.now();

  const run = await runAll(
    args,
    (chain) => console.log(color(`>> ${chain}: starting`, 'cyan')),
    (chain, r) => {
      const v = r.probes.reduce(
        (acc, p) => {
          acc[p.verdict]++;
          return acc;
        },
        { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 } as Record<Verdict, number>,
      );
      const blockInfo = r.blockDiff !== null ? `block diff=${r.blockDiff}` : 'state UNAVAILABLE';
      console.log(
        color(
          `<< ${chain}: ${blockInfo}, P=${v.PASS} W=${v.WARN} F=${v.FAIL} S=${v.SKIP} in ${r.ms}ms`,
          v.FAIL > 0 ? 'red' : v.WARN > 0 ? 'yellow' : 'green',
        ),
      );
    },
    (chain, _spec, p: ProbeResult) => {
      probesPrinted.set(chain, (probesPrinted.get(chain) ?? 0) + 1);
      const tag = `[${p.verdict}]`;
      const reason = p.reason.length > 100 ? `${p.reason.slice(0, 100)}…` : p.reason;
      console.log(`   ${color(tag, VERDICT_COLOR[p.verdict])} ${chain}/${p.endpointId} — ${reason}`);
    },
  );

  const { summaryPath, jsonPath } = writeReport(run, args.outDir);
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log('');
  console.log(color('=== Run complete ===', 'cyan'));
  console.log(
    `PASS=${run.totals.PASS}  WARN=${run.totals.WARN}  FAIL=${run.totals.FAIL}  SKIP=${run.totals.SKIP}  in ${elapsed}s`,
  );
  console.log(`Summary: ${summaryPath}`);
  console.log(`Details: ${jsonPath}`);

  await closeExternalDb();
  // Non-zero exit only if there are real FAILs
  process.exit(run.totals.FAIL > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeExternalDb();
  process.exit(2);
});
