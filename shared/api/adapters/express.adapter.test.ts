import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Use fake timers to control Date.now() during tests
vi.useFakeTimers();

import { checkRateLimit, _rateLimits, cleanupRateLimits } from './express.adapter';

describe('Express Rate Limiter Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _rateLimits.clear();
  });

  afterEach(() => {
    _rateLimits.clear();
    vi.useRealTimers();
  });

  it('should clean up old entries (older than 1 minute) via cleanupRateLimits', () => {
    // 1. Add an entry at T=0
    // At T=0, minute = 0. Key will be IP|0
    checkRateLimit('1.1.1.1');
    expect(_rateLimits.size).toBe(1);
    
    // 2. Advance time by 60s (T=60s, now = 1, minuteAgo = 0)
    // The condition is: if (minute < minuteAgo)
    // 0 < 0 is false, so it should stay. This is correct because the entry
    // from the PREVIOUS minute should only be deleted when we are in the minute AFTER it.
    vi.advanceTimersByTime(60000);
    cleanupRateLimits();
    expect(_rateLimits.size).toBe(1);

    // 3. Advance time by another 60s (T=120s, now = 2, minuteAgo = 1)
    // 0 < 1 is true, so it should be deleted.
    vi.advanceTimersByTime(60000);
    cleanupRateLimits();
    expect(_rateLimits.size).toBe(0);
  });

  it('should not clean up recent entries', () => {
    // 1. Add an old entry (T=0, minute 0)
    checkRateLimit('1.1.1.1');
    
    // 2. Advance by 90s (T=90s, now = 1)
    vi.advanceTimersByTime(90000);
    
    // 3. Add a new entry (T=90s, minute 1)
    checkRateLimit('2.2.2.2');
    expect(_rateLimits.size).toBe(2);
    
    // 4. Advance to T=120s (now = 2, minuteAgo = 1)
    vi.advanceTimersByTime(30000);
    cleanupRateLimits();
    
    // Old one (minute 0) should be gone (0 < 1 is true)
    // New one (minute 1) should stay (1 < 1 is false)
    expect(_rateLimits.size).toBe(1);
    const keys = Array.from(_rateLimits.keys());
    expect(keys[0]).toContain('2.2.2.2');
  });

  it('should correctly calculate the minute key', () => {
    // This verifies that checkRateLimit uses the expected key format that cleanupRateLimits expects
    const ip = '1.2.3.4';
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0)); // T=0
    checkRateLimit(ip);
    
    const nowMinute = Math.floor(Date.now() / 60000);
    const expectedKey = `${ip}|${nowMinute}`;
    
    expect(_rateLimits.has(expectedKey)).toBe(true);
  });
});
