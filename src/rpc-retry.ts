import { sleep } from './utilities';

const RETRYABLE = /compute units|rate limit|too many requests|429|timeout|econnreset|etimedout|socket hang up/i;

export function isRetryableRpcError(error: unknown): boolean {
  const err = error as { message?: string; cause?: { message?: string } };
  const message = `${err?.message || ''} ${err?.cause?.message || ''}`;
  return RETRYABLE.test(message);
}

/**
 * Retry an RPC call that failed because the provider is rate limiting or briefly unreachable.
 * Other errors propagate immediately.
 *
 * Accepts a Promise or any thenable (web3's getPastEvents returns a Web3PromiEvent, not a Promise).
 * Typing the callback as Promise<T> made that call infer T as unknown and fail the build.
 */
export async function retryRpc<T>(
  fn: () => T | PromiseLike<T>,
  options?: { attempts?: number; baseDelayMs?: number; sleepFn?: (ms: number) => Promise<void> },
): Promise<Awaited<T>> {
  const attempts = options?.attempts ?? 6;
  const sleepFn = options?.sleepFn ?? sleep;
  let delay = options?.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === attempts) {
        throw error;
      }
      await sleepFn(delay);
      delay = Math.min(delay * 2, 8000);
    }
  }

  throw lastError;
}
