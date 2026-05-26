import { describe, expect, it } from 'vitest';
import { computeRateLimitState, getWindowIndex, type StoredRateLimitState } from '../../../workers/rate-limiter/src/rateLimitState';

describe('rateLimitState', () => {
  it('increments within the active window', () => {
    const storedState: StoredRateLimitState = {
      windowIndex: getWindowIndex(15_000, 60),
      count: 2,
    };

    const result = computeRateLimitState({
      storedState,
      currentTimestampMs: 20_000,
      limit: 6,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
    expect(result.nextState).toEqual({
      windowIndex: storedState.windowIndex,
      count: 3,
    });
  });

  it('resets the count when a new window starts', () => {
    const result = computeRateLimitState({
      storedState: {
        windowIndex: getWindowIndex(20_000, 60),
        count: 6,
      },
      currentTimestampMs: 61_000,
      limit: 6,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.nextState).toEqual({
      windowIndex: getWindowIndex(61_000, 60),
      count: 1,
    });
  });

  it('blocks requests after reaching the limit', () => {
    const result = computeRateLimitState({
      storedState: {
        windowIndex: getWindowIndex(45_000, 60),
        count: 6,
      },
      currentTimestampMs: 50_000,
      limit: 6,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(10);
    expect(result.nextState.count).toBe(6);
  });
});
