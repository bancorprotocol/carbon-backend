import { isRetryableRpcError, retryRpc } from './rpc-retry';

const immediate = () => Promise.resolve();

describe('retryRpc', () => {
  it('returns the result when the call succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(retryRpc(fn, { sleepFn: immediate })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries Alchemy throughput errors and then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Your app has exceeded its compute units per second capacity'))
      .mockResolvedValue('ok');

    await expect(retryRpc(fn, { sleepFn: immediate })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('execution reverted'));
    await expect(retryRpc(fn, { sleepFn: immediate })).rejects.toThrow('execution reverted');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after the last rate-limit attempt', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('429 too many requests'));
    await expect(retryRpc(fn, { attempts: 3, sleepFn: immediate })).rejects.toThrow('429');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('recognises provider rate-limit messages', () => {
    expect(isRetryableRpcError(new Error('compute units per second capacity'))).toBe(true);
    expect(isRetryableRpcError(new Error('pair not found'))).toBe(false);
  });
});
