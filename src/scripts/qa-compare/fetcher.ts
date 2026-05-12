import { performance } from 'perf_hooks';
import { HttpResult } from './types';

export interface FetchOpts {
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;
const RETRY_BACKOFF_MS = 750;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRetryableStatus = (s: number) => s >= 500 && s < 600;

function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  if (e.name === 'AbortError') return true;
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('econn') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('terminated')
  );
}

export async function fetchOnce(url: string, opts: FetchOpts = {}): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;

  let lastErr: string | undefined;
  let attempts = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent': 'carbon-qa-compare/1.0',
          accept: 'application/json',
        },
        signal: ac.signal,
      });
      const bodyRaw = await res.text();
      clearTimeout(timer);
      const ms = Math.round(performance.now() - t0);
      let body: any = null;
      let jsonOk = false;
      try {
        body = bodyRaw.length === 0 ? null : JSON.parse(bodyRaw);
        jsonOk = true;
      } catch {
        jsonOk = false;
      }
      const sizeBytes = Buffer.byteLength(bodyRaw, 'utf8');

      if (isRetryableStatus(res.status) && attempt < retries) {
        lastErr = `http ${res.status}`;
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }

      return {
        url,
        status: res.status,
        ms,
        sizeBytes,
        bodyRaw,
        body,
        jsonOk,
        attempts,
        error: lastErr,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const ms = Math.round(performance.now() - t0);
      lastErr = err?.message || String(err);
      if (isRetryableError(err) && attempt < retries) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return {
        url,
        status: 0,
        ms,
        sizeBytes: 0,
        bodyRaw: '',
        body: null,
        jsonOk: false,
        attempts,
        error: lastErr,
      };
    }
  }

  // Defensive — should not be reached.
  return {
    url,
    status: 0,
    ms: 0,
    sizeBytes: 0,
    bodyRaw: '',
    body: null,
    jsonOk: false,
    attempts,
    error: lastErr || 'unknown error',
  };
}

/**
 * Fetch staging and prod URLs in parallel with a shared semaphore for global throttling.
 */
export async function fetchPair(
  stagingUrl: string,
  prodUrl: string,
  opts: FetchOpts = {},
  semaphore?: Semaphore,
): Promise<{ staging: HttpResult; prod: HttpResult }> {
  const run = async (u: string) => {
    if (semaphore) {
      const release = await semaphore.acquire();
      try {
        return await fetchOnce(u, opts);
      } finally {
        release();
      }
    }
    return fetchOnce(u, opts);
  };
  const [staging, prod] = await Promise.all([run(stagingUrl), run(prodUrl)]);
  return { staging, prod };
}

/**
 * Lightweight semaphore for global in-flight throttling across all chains/endpoints.
 */
export class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = Math.max(1, permits);
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        this.permits--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.permits++;
    const next = this.waiters.shift();
    if (next) next();
  }
}

/**
 * Limit concurrency for an array of async tasks.
 */
export async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  const cap = Math.max(1, Math.min(limit, items.length || 1));
  for (let w = 0; w < cap; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) return;
          results[i] = await fn(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}
