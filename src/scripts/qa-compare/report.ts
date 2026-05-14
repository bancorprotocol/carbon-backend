import * as fs from 'fs';
import * as path from 'path';
import { ChainResult, ProbeResult, RunOutput, Verdict } from './types';

const VERDICT_EMOJI: Record<Verdict, string> = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', SKIP: 'SKIP' };

const escMd = (s: string) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function fmtMetrics(m?: ProbeResult['metrics']): string {
  if (!m) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v === null || v === undefined) continue;
    parts.push(`${k}=${v}`);
  }
  return parts.length ? `\`${parts.join(' ')}\`` : '';
}

export function writeReport(run: RunOutput, outDir: string): { summaryPath: string; jsonPath: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const summaryPath = path.join(outDir, 'summary.md');
  const jsonPath = path.join(outDir, 'details.json');

  const lines: string[] = [];
  lines.push('# Carbon API: staging vs production QA report');
  lines.push('');
  lines.push(`- **Started:** ${run.startedAt}`);
  lines.push(`- **Finished:** ${run.finishedAt}`);
  lines.push(`- **Staging:** ${run.args.staging}`);
  lines.push(`- **Production:** ${run.args.prod}`);
  lines.push(
    `- **Chains:** ${run.args.chains.join(', ')} (chain concurrency=${
      run.args.chainConcurrency
    }, endpoint concurrency=${run.args.concurrency})`,
  );
  lines.push(
    `- **Tolerances:** block override=${run.args.blockToleranceOverride ?? 'auto'}, price=${
      run.args.priceTolerancePct
    }%, volume=${run.args.volumeTolerancePct}%`,
  );
  lines.push(`- **Heavy endpoints (history/simulator):** ${run.args.includeHistorical ? 'on' : 'off'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `Totals — PASS: **${run.totals.PASS}**, WARN: **${run.totals.WARN}**, FAIL: **${run.totals.FAIL}**, SKIP: **${run.totals.SKIP}**`,
  );
  lines.push('');
  lines.push('| Chain | Block diff | Tolerance | PASS | WARN | FAIL | SKIP | ms |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of run.chains) {
    const counts = countVerdicts(c);
    lines.push(
      `| \`${c.chain}\` | ${c.blockDiff ?? 'n/a'} | ${c.blockTolerance} | ${counts.PASS} | ${counts.WARN} | ${
        counts.FAIL
      } | ${counts.SKIP} | ${c.ms} |`,
    );
  }
  lines.push('');

  // Per-chain
  for (const c of run.chains) {
    lines.push(`## \`${c.chain}\``);
    lines.push('');
    if (c.derivationNotes.length > 0) {
      lines.push('**Derivation notes:**');
      for (const n of c.derivationNotes) lines.push(`- ${escMd(n)}`);
      lines.push('');
    }
    lines.push('| Endpoint | Verdict | Classifier | Staging | Prod | Reason | Metrics |');
    lines.push('|---|---|---|---:|---:|---|---|');
    const sortedProbes = [...c.probes].sort(
      (a, b) => verdictRank(b.verdict) - verdictRank(a.verdict) || a.endpointId.localeCompare(b.endpointId),
    );
    for (const p of sortedProbes) {
      const stagingCol = `${p.staging.status}/${p.staging.ms}ms/${formatBytes(p.staging.sizeBytes)}`;
      const prodCol = `${p.prod.status}/${p.prod.ms}ms/${formatBytes(p.prod.sizeBytes)}`;
      lines.push(
        `| \`${p.endpointId}\` | ${VERDICT_EMOJI[p.verdict]} | ${p.classifier} | ${stagingCol} | ${prodCol} | ${escMd(
          p.reason,
        )} | ${fmtMetrics(p.metrics)} |`,
      );
    }
    lines.push('');

    // Detailed sections for failures and warnings.
    const failed = c.probes.filter((p) => p.verdict === 'FAIL');
    const warned = c.probes.filter((p) => p.verdict === 'WARN');
    if (failed.length > 0) {
      lines.push(`### \`${c.chain}\` — FAIL details`);
      for (const p of failed) appendProbeDetail(lines, p);
    }
    if (warned.length > 0) {
      lines.push(`### \`${c.chain}\` — WARN details`);
      for (const p of warned) appendProbeDetail(lines, p);
    }
  }

  fs.writeFileSync(summaryPath, lines.join('\n') + '\n', 'utf8');

  // Trim raw bodies in JSON to keep file size reasonable; preserve a head + tail snippet.
  const trimmed = JSON.parse(JSON.stringify(run));
  for (const c of trimmed.chains) {
    for (const p of c.probes) {
      p.staging.bodyRaw = trimRaw(p.staging.bodyRaw);
      p.prod.bodyRaw = trimRaw(p.prod.bodyRaw);
      p.staging.body = undefined;
      p.prod.body = undefined;
    }
  }
  fs.writeFileSync(jsonPath, JSON.stringify(trimmed, null, 2), 'utf8');
  return { summaryPath, jsonPath };
}

function trimRaw(s: string): string {
  if (!s) return '';
  if (s.length <= 4096) return s;
  return `${s.slice(0, 2048)}\n...[TRIMMED ${s.length - 4096} bytes]...\n${s.slice(-2048)}`;
}

function appendProbeDetail(lines: string[], p: ProbeResult) {
  lines.push('');
  lines.push(
    `<details><summary><code>${p.endpointId}</code> — ${p.verdict}: ${escMd(truncate(p.reason, 200))}</summary>`,
  );
  lines.push('');
  lines.push(
    `- staging: \`${p.pathStaging}\` → ${p.staging.status} in ${p.staging.ms}ms (${formatBytes(p.staging.sizeBytes)})${
      p.staging.error ? ` err=${p.staging.error}` : ''
    }`,
  );
  lines.push(
    `- prod: \`${p.pathProd}\` → ${p.prod.status} in ${p.prod.ms}ms (${formatBytes(p.prod.sizeBytes)})${
      p.prod.error ? ` err=${p.prod.error}` : ''
    }`,
  );
  if (p.metrics) {
    lines.push(`- metrics: ${fmtMetrics(p.metrics)}`);
  }
  if (p.staging.bodyRaw && p.staging.status >= 400) {
    lines.push('');
    lines.push('staging body excerpt:');
    lines.push('```');
    lines.push(truncate(p.staging.bodyRaw, 500));
    lines.push('```');
  }
  if (p.prod.bodyRaw && p.prod.status >= 400) {
    lines.push('');
    lines.push('prod body excerpt:');
    lines.push('```');
    lines.push(truncate(p.prod.bodyRaw, 500));
    lines.push('```');
  }
  lines.push('');
  lines.push('</details>');
}

function countVerdicts(c: ChainResult): Record<Verdict, number> {
  const v: Record<Verdict, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const p of c.probes) v[p.verdict]++;
  return v;
}

function verdictRank(v: Verdict): number {
  return { FAIL: 3, WARN: 2, SKIP: 1, PASS: 0 }[v];
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(2)}MB`;
}
