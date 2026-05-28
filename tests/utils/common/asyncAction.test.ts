import { describe, expect, it, vi } from 'vitest';
import { runAsyncAction } from '@/utils/common/asyncAction';

describe('runAsyncAction', () => {
  it('passes synchronous failures to the error handler', () => {
    const error = new Error('sync failure');
    const onError = vi.fn();

    runAsyncAction(() => {
      throw error;
    }, onError);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('passes asynchronous failures to the error handler', async () => {
    const error = new Error('async failure');
    const onError = vi.fn();

    runAsyncAction(() => Promise.reject(error), onError);

    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('does not call the error handler for successful actions', async () => {
    const onError = vi.fn();

    runAsyncAction(() => Promise.resolve('done'), onError);

    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
  });
});
