// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { RATE_LIMIT_PER_MINUTE, isProductionEnvironment } from '../../security/security';
import { buildAllHeaders, checkPreflightAllowed } from '../cors.core';
import { type RateLimitResult, type KVNamespaceSubset, type GenericRequest } from '../types';
import { Logger } from '../../utils/logger';

const logger = new Logger('CloudflareAdapter');

/**
 * Check rate limit using Cloudflare KV
 * @param ip - Client IP
 * @param kv - The KVNamespace instance
 * @returns Rate limit status
 */
export async function checkRateLimit(ip: string, kv: KVNamespaceSubset | undefined): Promise<RateLimitResult> {
  if (!kv) {
    logger.error('RATE_LIMIT_KV is not configured!');
    return { allowed: false, remaining: 0 };
  }

  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${minute}`;

  const current = await kv.get(key);
  const count = current ? parseInt(current) : 0;

  if (count >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  // Increment count
  await kv.put(key, (count + 1).toString(), { expirationTtl: 60 });

  return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - count - 1 };
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
export function handleCorsPreflightIfNeeded(request: any, origin: string | null | undefined, allowedOrigins: string[], headers: Headers): Response | null {
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
