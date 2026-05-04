import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAbortController } from '@/hooks/network/useAbortController';

describe('useAbortController', () => {
  it('starts without a controller or signal', () => {
    const { result } = renderHook(() => useAbortController());

    expect(result.current.ref.current).toBeNull();
    expect(result.current.signal).toBeUndefined();
  });

  it('creates a controller, stores it in the ref, and returns it', () => {
    const { result } = renderHook(() => useAbortController());
    let controller: AbortController | undefined;

    act(() => {
      controller = result.current.create();
    });

    expect(controller).toBeInstanceOf(AbortController);
    expect(result.current.ref.current).toBe(controller);
    expect(controller?.signal.aborted).toBe(false);
  });

  it('aborts and replaces the previous controller when creating a second one', () => {
    const { result } = renderHook(() => useAbortController());
    let firstController: AbortController | undefined;
    let secondController: AbortController | undefined;

    act(() => {
      firstController = result.current.create();
      secondController = result.current.create();
    });

    expect(firstController?.signal.aborted).toBe(true);
    expect(secondController?.signal.aborted).toBe(false);
    expect(result.current.ref.current).toBe(secondController);
  });

  it('aborts the current controller and clears the ref', () => {
    const { result } = renderHook(() => useAbortController());
    let controller: AbortController | undefined;

    act(() => {
      controller = result.current.create();
      result.current.abort();
    });

    expect(controller?.signal.aborted).toBe(true);
    expect(result.current.ref.current).toBeNull();
  });

  it('is safe to abort when no controller exists', () => {
    const { result } = renderHook(() => useAbortController());

    expect(() => {
      act(() => {
        result.current.abort();
      });
    }).not.toThrow();
    expect(result.current.ref.current).toBeNull();
  });

  it('aborts the current controller on unmount', () => {
    const { result, unmount } = renderHook(() => useAbortController());
    let controller: AbortController | undefined;

    act(() => {
      controller = result.current.create();
    });

    unmount();

    expect(controller?.signal.aborted).toBe(true);
  });

  it('is safe to unmount without a controller', () => {
    const { unmount } = renderHook(() => useAbortController());

    expect(() => unmount()).not.toThrow();
  });

  it('exposes signal from render-time state only after a rerender', () => {
    const { result, rerender } = renderHook(() => useAbortController());
    let controller: AbortController | undefined;

    act(() => {
      controller = result.current.create();
    });

    expect(result.current.signal).toBeUndefined();

    rerender();

    expect(result.current.signal).toBe(controller?.signal);
  });
});
