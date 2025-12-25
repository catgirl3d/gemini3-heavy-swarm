/**
 * Security Helper for Cloudflare Functions
 * Implements Rate Limiting and Secret Header validation
 */

import { RATE_LIMIT_PER_MINUTE } from "../constants/security.js";

/**
 * Validate X-API-Secret header
 */
export function validateSecretHeader(
  request: Request,
  env: { API_SECRET?: string }
): boolean {
  // If API_SECRET is not configured in the dashboard, access is denied for safety.
  if (!env.API_SECRET) {
    console.error(
      "SERVER SECURITY ERROR: API_SECRET environment variable is not set!"
    );
    return false;
  }

  const secret = request.headers.get("X-API-Secret");
  return secret === env.API_SECRET;
}

// Check rate limit for a given IP using KV
export async function checkRateLimit(
  ip: string,
  kv: unknown
): Promise<{ allowed: boolean; remaining: number }> {
  if (!kv) {
    console.error("SERVER SECURITY ERROR: RATE_LIMIT_KV is not configured!");
    return { allowed: false, remaining: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const minute = Math.floor(now / 60);
  const key = `rl:${ip}:${minute}`;

  const current = await (kv as any).get(key);
  const count = current ? parseInt(current) : 0;

  if (count >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  // Increment count
  await (kv as any).put(key, (count + 1).toString(), { expirationTtl: 60 });

  return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - count - 1 };
}
