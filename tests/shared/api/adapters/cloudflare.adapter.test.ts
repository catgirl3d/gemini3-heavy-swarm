import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_PER_MINUTE } from '@shared/security/security';
import type { DurableObjectNamespaceSubset } from '@shared/api/types';
import {
  buildUnifiedHeaders,
  checkRateLimit,
  handleCorsPreflightIfNeeded,
  isCloudflareProduction,
  wrapStreamWithLogging,
} from '@shared/api/adapters/cloudflare.adapter';

vi.mock('../../../../shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

const createRateLimiter = (responseFactory: (request: Request) => Promise<Response>) => {
  const fetch = vi.fn(responseFactory);
  const getByName = vi.fn(() => ({ fetch }));
  const rateLimiter: DurableObjectNamespaceSubset = {
    getByName,
  };

  return { rateLimiter, getByName, fetch };
};

describe('cloudflare.adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:34:56Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('rejects when the Durable Object binding is not configured', async () => {
      await expect(checkRateLimit('1.1.1.1', undefined)).resolves.toEqual({
        allowed: false,
        remaining: 0,
      });
    });

    it('calls the Durable Object with the configured limit and returns remaining quota', async () => {
      const { rateLimiter, getByName, fetch } = createRateLimiter(async () => {
        return Response.json({
          allowed: true,
          remaining: RATE_LIMIT_PER_MINUTE - 1,
          retryAfterSeconds: 60,
        });
      });

      await expect(checkRateLimit('1.1.1.1', rateLimiter)).resolves.toEqual({
        allowed: true,
        remaining: RATE_LIMIT_PER_MINUTE - 1,
      });

      expect(getByName).toHaveBeenCalledWith('1.1.1.1');
      expect(fetch).toHaveBeenCalledTimes(1);

      const request = fetch.mock.calls[0]?.[0];
      expect(request).toBeInstanceOf(Request);
      expect(request.url).toBe(`https://rate-limiter.internal/check?limit=${RATE_LIMIT_PER_MINUTE}&window=60`);
    });

    it('passes through blocked responses from the Durable Object', async () => {
      const { rateLimiter } = createRateLimiter(async () => {
        return new Response(
          JSON.stringify({
            allowed: false,
            remaining: 0,
            retryAfterSeconds: 10,
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      });

      await expect(checkRateLimit('2.2.2.2', rateLimiter)).resolves.toEqual({
        allowed: false,
        remaining: 0,
      });
    });

    it('fails closed when the Durable Object returns an invalid payload', async () => {
      const { rateLimiter } = createRateLimiter(async () => {
        return Response.json({ remaining: 1 });
      });

      await expect(checkRateLimit('3.3.3.3', rateLimiter)).resolves.toEqual({
        allowed: false,
        remaining: 0,
      });
    });
  });

  describe('Cloudflare CORS helpers', () => {
    it('detects production from the request URL', () => {
      expect(isCloudflareProduction({
        headers: {},
        url: 'https://gemini3-heavy-swarm.pages.dev/api/status',
      })).toBe(true);

      expect(isCloudflareProduction({
        headers: {},
        url: 'http://localhost:3000/api/status',
      })).toBe(false);
    });

    it('builds unified security and CORS headers for allowed origins', () => {
      const headers = buildUnifiedHeaders('https://app.example', ['https://app.example'], true);

      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
      expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-API-Secret');
      expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('omits CORS allow-origin for disallowed origins while keeping security headers', () => {
      const headers = buildUnifiedHeaders('https://evil.example', ['https://app.example'], false);

      expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(headers.get('X-Frame-Options')).toBe('DENY');
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('returns null for non-preflight requests', () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });

      expect(handleCorsPreflightIfNeeded(
        { method: 'POST' },
        'https://app.example',
        ['https://app.example'],
        headers
      )).toBeNull();
    });

    it('returns 204 for allowed OPTIONS preflight requests', async () => {
      const headers = new Headers({ 'X-Test': 'allowed' });
      const response = handleCorsPreflightIfNeeded(
        { method: 'OPTIONS' },
        'https://app.example',
        ['https://app.example'],
        headers
      );

      expect(response?.status).toBe(204);
      expect(response?.headers.get('X-Test')).toBe('allowed');
      expect(await response?.text()).toBe('');
    });

    it('returns 403 for denied OPTIONS preflight requests', async () => {
      const response = handleCorsPreflightIfNeeded(
        { method: 'OPTIONS' },
        'https://evil.example',
        ['https://app.example'],
        new Headers({ 'Content-Type': 'application/json' })
      );

      expect(response?.status).toBe(403);
      await expect(response?.json()).resolves.toEqual({ error: 'Origin not allowed' });
    });
  });

  describe('wrapStreamWithLogging', () => {
    it('passes through stream chunks and closes the wrapped stream', async () => {
      const source = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const reader = wrapStreamWithLogging(source).getReader();

      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: new Uint8Array([1, 2, 3]),
      });
      await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    });

    it('propagates source stream errors through the wrapped stream', async () => {
      const source = new ReadableStream({
        start(controller) {
          controller.error(new Error('source failed'));
        },
      });

      const reader = wrapStreamWithLogging(source).getReader();

      await expect(reader.read()).rejects.toThrow('source failed');
    });

    it('handles non-Error stream failures without masking the original failure', async () => {
      const source = new ReadableStream({
        start(controller) {
          controller.error('string failure');
        },
      });

      const reader = wrapStreamWithLogging(source).getReader();

      await expect(reader.read()).rejects.toBe('string failure');
    });
  });
});
