import { DurableObject } from 'cloudflare:workers';
import { computeRateLimitState, type StoredRateLimitState } from './rateLimitState';

export interface Env {
  RATE_LIMITER: DurableObjectNamespace;
}

const DEFAULT_LIMIT = 6;
const DEFAULT_WINDOW_SECONDS = 60;
const STORAGE_KEY = 'rate-limit-state';

const parsePositiveInteger = (value: string | null, fallback: number): number => {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export class RateLimiter extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parsePositiveInteger(url.searchParams.get('limit'), DEFAULT_LIMIT);
    const windowSeconds = parsePositiveInteger(url.searchParams.get('window'), DEFAULT_WINDOW_SECONDS);
    const now = Date.now();

    const storedState = await this.ctx.storage.get<StoredRateLimitState>(STORAGE_KEY);
    const result = computeRateLimitState({
      storedState: storedState ?? null,
      currentTimestampMs: now,
      limit,
      windowSeconds,
    });

    if (result.allowed) {
      await this.ctx.storage.put(STORAGE_KEY, result.nextState);
    }

    return Response.json(
      {
        allowed: result.allowed,
        remaining: result.remaining,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      {
        status: result.allowed ? 200 : 429,
      }
    );
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response('rate-limiter worker ok');
  },
} satisfies ExportedHandler<Env>;
