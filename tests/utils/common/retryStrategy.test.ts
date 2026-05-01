import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from '@/utils/common/retryStrategy';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

describe('withRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately when the first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(withRetry(fn, { maxRetries: 3 })).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('retries transient errors with exponential backoff and calls onRetry', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new AppError('network', ErrorCode.NETWORK_ERROR))
      .mockRejectedValueOnce(new AppError('rate limit', ErrorCode.RATE_LIMIT))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 100,
      maxDelayMs: 500,
      factor: 2,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(AppError), 1, 100);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(AppError), 2, 200);
  });

  it('caps exponential backoff at maxDelayMs', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new AppError('network', ErrorCode.NETWORK_ERROR))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 1000,
      maxDelayMs: 250,
      factor: 4,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(expect.any(AppError), 1, 250);
  });

  it('does not retry non-transient errors by default', async () => {
    const fn = vi.fn().mockRejectedValue(new AppError('bad settings', ErrorCode.INVALID_SETTINGS));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toMatchObject({
      code: ErrorCode.INVALID_SETTINGS,
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries are exhausted', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new AppError('network', ErrorCode.NETWORK_ERROR));

    const promise = withRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 50,
      maxDelayMs: 50,
      factor: 2,
    });
    const rejection = expect(promise).rejects.toMatchObject({ code: ErrorCode.NETWORK_ERROR });

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses shouldRetry override instead of transient classification', async () => {
    vi.useFakeTimers();
    const shouldRetry = vi.fn().mockReturnValue(true);
    const fn = vi.fn()
      .mockRejectedValueOnce(new AppError('bad settings', ErrorCode.INVALID_SETTINGS))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 10,
      maxDelayMs: 10,
      factor: 2,
      shouldRetry,
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(promise).resolves.toBe('ok');
    expect(shouldRetry).toHaveBeenCalledWith(expect.any(AppError));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wraps unknown thrown values as AppError', async () => {
    const fn = vi.fn().mockRejectedValue('plain failure');

    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toMatchObject({
      name: 'AppError',
      message: 'plain failure',
      code: ErrorCode.UNKNOWN,
    });
  });

  it('aborts before the first attempt', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn();

    await expect(withRetry(fn, { signal: controller.signal })).rejects.toMatchObject({
      code: ErrorCode.ABORTED,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('aborts while waiting between retry attempts', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new AppError('network', ErrorCode.NETWORK_ERROR));

    const promise = withRetry(fn, {
      maxRetries: 1,
      initialDelayMs: 1000,
      maxDelayMs: 1000,
      factor: 2,
      signal: controller.signal,
    });
    const rejection = expect(promise).rejects.toMatchObject({ code: ErrorCode.ABORTED });

    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await rejection;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
