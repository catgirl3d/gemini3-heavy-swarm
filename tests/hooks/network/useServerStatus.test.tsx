import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useServerStatus } from '@/hooks/network/useServerStatus';

const loggerDebug = vi.hoisted(() => vi.fn());
const LoggerMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = loggerDebug;
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();

    constructor(...args: unknown[]) {
      LoggerMock(...args);
    }
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const createStatusResponse = (
  data: unknown,
  overrides: { ok?: boolean; contentType?: string | null } = {}
): Response => ({
  ok: overrides.ok ?? true,
  headers: {
    get: vi.fn((name: string) => {
      if (name.toLowerCase() !== 'content-type') return null;
      return overrides.contentType === undefined ? 'application/json' : overrides.contentType;
    }),
  },
  json: vi.fn().mockResolvedValue(data),
} as unknown as Response);

const waitForLoaded = async (result: { current: ReturnType<typeof useServerStatus> }) => {
  await vi.waitFor(() => {
    expect(result.current.serverStatus.isLoaded).toBe(true);
  });
};

const fetchMock = () => vi.mocked(fetch);

describe('useServerStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts with unloaded defaults and derived missing-key state', () => {
    fetchMock().mockReturnValue(new Promise<Response>(() => {}));

    const { result } = renderHook(() => useServerStatus());

    expect(result.current.serverStatus).toEqual({
      hasServerKey: false,
      hasOpenRouterKey: false,
      proxyMode: 'private',
      isLoaded: false,
    });
    expect(result.current.shouldShowLoadingBanner).toBe(false);
    expect(result.current.isBannerDismissed).toBe(false);
    expect(result.current.isMissingKey).toBe(true);
    expect(result.current.isProxyDemo).toBe(false);
    expect(result.current.isProxyPrivate).toBe(false);
  });

  it('loads valid JSON status and hides the loading banner', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({
      hasServerKey: true,
      hasOpenRouterKey: 1,
    }));

    const { result } = renderHook(() => useServerStatus());

    expect(fetchMock()).toHaveBeenCalledExactlyOnceWith('/api/status');

    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: true,
      hasOpenRouterKey: true,
      proxyMode: 'private',
      isLoaded: true,
    });
    expect(result.current.shouldShowLoadingBanner).toBe(false);
  });

  it('accepts JSON content-type case variants', async () => {
    fetchMock().mockResolvedValue(createStatusResponse(
      { hasServerKey: true, hasOpenRouterKey: false, proxyMode: 'demo' },
      { contentType: 'Application/JSON; charset=utf-8' }
    ));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: true,
      hasOpenRouterKey: false,
      proxyMode: 'demo',
      isLoaded: true,
    });
  });

  it('marks loaded and preserves defaults for non-ok responses', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({ hasServerKey: true }, { ok: false }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: false,
      hasOpenRouterKey: false,
      proxyMode: 'private',
      isLoaded: true,
    });
  });

  it('marks loaded and preserves defaults for non-json responses', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({ hasServerKey: true }, { contentType: 'text/plain' }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: false,
      hasOpenRouterKey: false,
      proxyMode: 'private',
      isLoaded: true,
    });
  });

  it('marks loaded and preserves defaults for malformed JSON data', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({ hasServerKey: 'yes', proxyMode: 'demo' }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: false,
      hasOpenRouterKey: false,
      proxyMode: 'private',
      isLoaded: true,
    });
  });

  it('normalizes invalid proxyMode values to private when the payload is otherwise valid', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({ hasServerKey: true, proxyMode: 'public' }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: true,
      hasOpenRouterKey: false,
      proxyMode: 'private',
      isLoaded: true,
    });
    expect(result.current.isProxyPrivate).toBe(true);
    expect(result.current.isProxyDemo).toBe(false);
  });

  it('handles fetch failure, hides the banner, marks loaded, and logs debug', async () => {
    const error = new Error('offline');
    fetchMock().mockRejectedValue(error);

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.serverStatus).toEqual({
      hasServerKey: false,
      hasOpenRouterKey: false,
      proxyMode: 'private',
      isLoaded: true,
    });
    expect(result.current.shouldShowLoadingBanner).toBe(false);
    expect(LoggerMock).toHaveBeenCalledWith('ServerStatus');
    expect(loggerDebug).toHaveBeenCalledWith('Server status check failed (running client-only?):', error);
  });

  it('shows the loading banner after 300ms only while fetch is pending and hides it after success', async () => {
    const deferred = createDeferred<Response>();
    fetchMock().mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useServerStatus());

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.shouldShowLoadingBanner).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.shouldShowLoadingBanner).toBe(true);

    await act(async () => {
      deferred.resolve(createStatusResponse({ hasServerKey: true, hasOpenRouterKey: false, proxyMode: 'private' }));
      await deferred.promise;
    });
    await waitForLoaded(result);

    expect(result.current.shouldShowLoadingBanner).toBe(false);
    expect(result.current.serverStatus.isLoaded).toBe(true);
  });

  it('does not show the loading banner after fast success', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({ hasServerKey: true, proxyMode: 'private' }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.shouldShowLoadingBanner).toBe(false);
    expect(result.current.serverStatus.isLoaded).toBe(true);
  });

  it('dismisses the banner', () => {
    fetchMock().mockReturnValue(new Promise<Response>(() => {}));
    const { result } = renderHook(() => useServerStatus());

    act(() => {
      result.current.dismissBanner();
    });

    expect(result.current.isBannerDismissed).toBe(true);
  });

  it('derives proxy demo state when a server key exists outside private mode', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({
      hasServerKey: true,
      hasOpenRouterKey: false,
      proxyMode: 'demo',
    }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.isMissingKey).toBe(false);
    expect(result.current.isProxyDemo).toBe(true);
    expect(result.current.isProxyPrivate).toBe(false);
  });

  it('derives private proxy state when a server key exists in private mode', async () => {
    fetchMock().mockResolvedValue(createStatusResponse({
      hasServerKey: true,
      hasOpenRouterKey: false,
      proxyMode: 'private',
    }));

    const { result } = renderHook(() => useServerStatus());
    await waitForLoaded(result);

    expect(result.current.isMissingKey).toBe(false);
    expect(result.current.isProxyDemo).toBe(false);
    expect(result.current.isProxyPrivate).toBe(true);
  });

  it('clears the delayed loading timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    fetchMock().mockReturnValue(new Promise<Response>(() => {}));

    const { unmount } = renderHook(() => useServerStatus());

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
  });

  it('does not process a pending response after unmount', async () => {
    const deferred = createDeferred<Response>();
    const response = createStatusResponse({ hasServerKey: true, proxyMode: 'demo' });
    fetchMock().mockReturnValue(deferred.promise);

    const { unmount } = renderHook(() => useServerStatus());
    unmount();

    await act(async () => {
      deferred.resolve(response);
      await deferred.promise;
    });

    expect(response.json).not.toHaveBeenCalled();
  });

  it('does not log or update after a pending rejection settles after unmount', async () => {
    const deferred = createDeferred<Response>();
    fetchMock().mockReturnValue(deferred.promise);

    const { unmount } = renderHook(() => useServerStatus());
    unmount();

    await act(async () => {
      deferred.reject(new Error('offline'));
      await vi.runAllTimersAsync();
    });

    expect(LoggerMock).not.toHaveBeenCalledWith('ServerStatus');
    expect(loggerDebug).not.toHaveBeenCalled();
  });
});
