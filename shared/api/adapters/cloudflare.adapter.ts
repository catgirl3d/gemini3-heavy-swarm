// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { RATE_LIMIT_PER_MINUTE, isProductionEnvironment } from '../../security/security';
import { buildAllHeaders, checkPreflightAllowed } from '../cors.core';
import { type DurableObjectNamespaceSubset, type GenericRequest, type RateLimitResult } from '../types';
import { Logger } from '../../utils/logger';

const logger = new Logger('CloudflareAdapter');
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMITER_URL = 'https://rate-limiter.internal/check';

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const parseRateLimitResult = (value: unknown): RateLimitResult | null => {
  if (!isObjectRecord(value)) return null;
  if (typeof value.allowed !== 'boolean') return null;
  if (typeof value.remaining !== 'number') return null;

  return {
    allowed: value.allowed,
    remaining: value.remaining,
  };
};

/**
 * Check rate limit using a Durable Object counter
 * @param ip - Client IP
 * @param rateLimiter - The Durable Object namespace binding
 * @returns Rate limit status
 */
export async function checkRateLimit(ip: string, rateLimiter: DurableObjectNamespaceSubset | undefined): Promise<RateLimitResult> {
  if (!rateLimiter) {
    logger.error('RATE_LIMITER_DO is not configured!');
    return { allowed: false, remaining: 0 };
  }

  try {
    const stub = rateLimiter.getByName(ip);
    const url = new URL(RATE_LIMITER_URL);
    url.searchParams.set('limit', RATE_LIMIT_PER_MINUTE.toString());
    url.searchParams.set('window', RATE_LIMIT_WINDOW_SECONDS.toString());

    const response = await stub.fetch(new Request(url.toString()));
    const payload: unknown = await response.json();
    const result = parseRateLimitResult(payload);

    if (result === null) {
      logger.error('Rate limiter returned an invalid payload');
      return { allowed: false, remaining: 0 };
    }

    return result;
  } catch (error: unknown) {
    logger.error(`Rate limiter request failed: ${getErrorMessage(error)}`);
    return { allowed: false, remaining: 0 };
  }
}

/**
 * Detect if running in production on Cloudflare
 * @param request - Cloudflare Request object
 * @returns boolean
 */
export function isCloudflareProduction(request: GenericRequest): boolean {
  return isProductionEnvironment(request);
}

/**
 * Build unified headers for Cloudflare Functions
 * @param origin - Request origin
 * @param allowedOrigins - List of allowed origins
 * @param isProduction - Whether in production
 * @returns Headers object
 */
export function buildUnifiedHeaders(origin: string | null | undefined, allowedOrigins: string[], isProduction: boolean): Headers {
  return new Headers(buildAllHeaders(origin, allowedOrigins, isProduction));
}

/**
 * Handle CORS preflight if needed
 * @param request - Request object
 * @param origin - Request origin
 * @param allowedOrigins - List of allowed origins
 * @param headers - Prepared headers
 * @returns Response or null
 */
export function handleCorsPreflightIfNeeded(request: { method: string }, origin: string | null | undefined, allowedOrigins: string[], headers: Headers): Response | null {
  const preflight = checkPreflightAllowed(request.method, origin, allowedOrigins);
  if (preflight.isPreflight) {
    if (preflight.allowed) {
      return new Response(null, { status: 204, headers });
    } else {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });
    }
  }
  return null;
}

/**
 * Wraps a ReadableStream to log errors (Cloudflare Workers limitation).
 * Note: Web Streams API doesn't allow SSE error injection mid-stream easily.
 * Stream errors will result in connection drops.
 * @param stream - The ReadableStream to wrap
 * @returns A new ReadableStream with error logging
 */
export function wrapStreamWithLogging(stream: ReadableStream): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        logger.error(`Cloudflare Stream Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    }
  });
}
