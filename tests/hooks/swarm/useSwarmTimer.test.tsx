import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSwarmTimer } from '@/hooks/swarm/useSwarmTimer';

describe('useSwarmTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts inactive at zero', () => {
    const { result } = renderHook(() => useSwarmTimer(false));

    expect(result.current.timer).toBe(0);
    expect(result.current.startTimeRef.current).toBe(0);
  });

  it('does not tick while inactive', () => {
    const { result } = renderHook(() => useSwarmTimer(false));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.timer).toBe(0);
  });

  it('increments from Date.now while active', () => {
    const { result } = renderHook(() => useSwarmTimer(true));

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.timer).toBe(100);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.timer).toBe(300);
  });

  it('pauses and resumes from the preserved elapsed time', () => {
    const { result, rerender } = renderHook(
      ({ isActive }) => useSwarmTimer(isActive),
      { initialProps: { isActive: true } }
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.timer).toBe(300);

    rerender({ isActive: false });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.timer).toBe(300);

    rerender({ isActive: true });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.timer).toBe(400);
  });

  it('uses manually set timer values when activating later', () => {
    const { result, rerender } = renderHook(
      ({ isActive }) => useSwarmTimer(isActive),
      { initialProps: { isActive: false } }
    );

    act(() => {
      result.current.setTimer(500);
    });
    expect(result.current.timer).toBe(500);

    rerender({ isActive: true });
    expect(result.current.startTimeRef.current).toBe(-500);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.timer).toBe(600);
  });

  it('clears the interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { result, unmount } = renderHook(() => useSwarmTimer(true));

    act(() => {
      vi.advanceTimersByTime(200);
    });
    const timerBeforeUnmount = result.current.timer;

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(timerBeforeUnmount).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
