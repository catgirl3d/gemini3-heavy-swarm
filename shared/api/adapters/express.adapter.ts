// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { RATE_LIMIT_PER_MINUTE } from '../../security/security';
import { RateLimitResult } from '../types';
import { Logger } from '../../utils/logger';

const logger = new Logger('ExpressAdapter');

/**
 * Simple in-memory rate limiter for Express
 */
const rateLimits = new Map<string, number>();

/**
 * Internal map for testing cleanup
 * @internal
 */
export const _rateLimits = rateLimits;

/**
 * Check rate limit for a given IP
 * @param ip - Client IP address
 * @returns Rate limit status
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Math.floor(Date.now() / 60000);
  const key = `${ip}|${now}`;
  const count = rateLimits.get(key) || 0;

  if (count >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  rateLimits.set(key, count + 1);
  
  return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - count - 1 };
}

/**
 * Periodic cleanup of expired rate limit entries
 */
export function cleanupRateLimits() {
  const now = Math.floor(Date.now() / 60000);
  const minuteAgo = now - 1;
  
  for (const [k] of rateLimits) {
    const minuteStr = k.split('|')[1];
    const minute = parseInt(minuteStr);
    if (minute < minuteAgo) {
      rateLimits.delete(k);
    }
  }
}

setInterval(cleanupRateLimits, 60000).unref?.();

/**
 * Streams a Web Response body to an Express Response
 * 
 * Handles automatic cleanup, error propagation via stream pipeline, 
 * and ensures error signaling even if headers were already sent.
 * 
 * @param webResponse - The source Web Response (from fetch)
 * @param expressRes - The destination Express Response object
 */
export async function streamToExpress(webResponse: Response, expressRes: any): Promise<void> {
  // Use upstream Content-Type from Google API if available
  const contentType = webResponse.headers.get('content-type') || 'application/json';
  expressRes.setHeader('Content-Type', contentType);
  
  if (!webResponse.body) return;

  // Convert Web Stream to Node Stream
  const { Readable } = await import('stream');
  const { ReadableStream: WebReadableStream } = await import('stream/web');
  const { pipeline } = await import('stream/promises');

  const nodeStream = Readable.fromWeb(webResponse.body as InstanceType<typeof WebReadableStream>);

  try {
    // pipeline handles automatic cleanup and error propagation for both sides
    await pipeline(nodeStream, expressRes);
  } catch (err: any) {
    logger.error(`Stream/Pipeline Error: ${err.message}`);
    
    // If the error occurred after headers were sent, we must signal it via a JSON chunk.
    // We don't use SSE 'event: error' because ProxyGenAI.ts parses raw JSON chunks.
    if (!expressRes.headersSent) {
      expressRes.status(500).json({ error: 'Stream interrupted', details: err.message });
    } else {
      try {
        // Only write if the response is still open
        if (!expressRes.writableEnded) {
          // Send as a valid JSON object that the client's parser can recognize
          expressRes.write(JSON.stringify({ 
            error: "Stream interrupted", 
            details: err.message,
            candidates: [] // Match expected structure if needed by client
          }) + '\n');
          expressRes.end();
        }
      } catch (writeErr) {
        logger.error(`Failed to write error chunk: ${writeErr.message}`);
      }
    }
  }
}
