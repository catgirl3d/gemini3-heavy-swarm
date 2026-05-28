import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { pipelineMock } = vi.hoisted(() => ({
  pipelineMock: vi.fn(),
}));

vi.mock('stream/promises', () => ({
  pipeline: pipelineMock,
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

// Use fake timers to control Date.now() during tests
vi.useFakeTimers();

import { RATE_LIMIT_PER_MINUTE } from '@shared/security/security';
import { checkRateLimit, _rateLimits, cleanupRateLimits, streamToExpress } from '@shared/api/adapters/express.adapter';

const createExpressResponse = (overrides: Record<string, unknown> = {}) => {
  const response: any = {
    setHeader: vi.fn(),
    headersSent: false,
    writableEnded: false,
    json: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    ...overrides,
  };

  response.status = vi.fn(() => response);
  return response;
};

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

  it('should reject requests after the per-minute rate limit is reached', () => {
    const ip = '9.9.9.9';

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect(checkRateLimit(ip)).toEqual({
        allowed: true,
        remaining: RATE_LIMIT_PER_MINUTE - i - 1,
      });
    }

    expect(checkRateLimit(ip)).toEqual({ allowed: false, remaining: 0 });
  });
});

describe('streamToExpress', () => {
  beforeEach(() => {
    pipelineMock.mockReset();
  });

  afterEach(() => {
    pipelineMock.mockReset();
  });

  it('sets the upstream content type and returns when the web response has no body', async () => {
    const expressRes = createExpressResponse();

    await streamToExpress(new Response(null, {
      headers: { 'content-type': 'application/problem+json' },
    }), expressRes);

    expect(expressRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('uses application/json as the fallback content type and pipes response bodies', async () => {
    const expressRes = createExpressResponse();
    pipelineMock.mockResolvedValueOnce(undefined);

    await streamToExpress(new Response(new Uint8Array([1, 2, 3])), expressRes);

    expect(expressRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it('returns a 500 JSON response when streaming fails before headers are sent', async () => {
    const expressRes = createExpressResponse({ headersSent: false });
    pipelineMock.mockRejectedValueOnce(new Error('source failed'));

    await streamToExpress(new Response('chunk'), expressRes);

    expect(expressRes.status).toHaveBeenCalledWith(500);
    expect(expressRes.json).toHaveBeenCalledWith({
      error: 'Stream interrupted',
      details: 'source failed',
    });
    expect(expressRes.write).not.toHaveBeenCalled();
  });

  it('writes an error chunk when streaming fails after headers are sent', async () => {
    const expressRes = createExpressResponse({ headersSent: true, writableEnded: false });
    pipelineMock.mockRejectedValueOnce(new Error('late failure'));

    await streamToExpress(new Response('chunk'), expressRes);

    expect(expressRes.status).not.toHaveBeenCalled();
    expect(expressRes.write).toHaveBeenCalledWith(expect.stringContaining('"details":"late failure"'));
    expect(expressRes.end).toHaveBeenCalledTimes(1);
  });

  it('does not write an error chunk when the response already ended', async () => {
    const expressRes = createExpressResponse({ headersSent: true, writableEnded: true });
    pipelineMock.mockRejectedValueOnce(new Error('late failure'));

    await streamToExpress(new Response('chunk'), expressRes);

    expect(expressRes.write).not.toHaveBeenCalled();
    expect(expressRes.end).not.toHaveBeenCalled();
  });

  it('swallows secondary write errors after a streaming failure', async () => {
    const expressRes = createExpressResponse({ headersSent: true, writableEnded: false });
    expressRes.write.mockImplementation(() => {
      throw new Error('write failed');
    });
    pipelineMock.mockRejectedValueOnce(new Error('late failure'));

    await expect(streamToExpress(new Response('chunk'), expressRes)).resolves.toBeUndefined();
    expect(expressRes.write).toHaveBeenCalledTimes(1);
    expect(expressRes.end).not.toHaveBeenCalled();
  });
});
