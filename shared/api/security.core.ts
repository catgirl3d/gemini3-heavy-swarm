// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { ValidationResult } from '../validation/geminiValidation';
import { Logger } from '../utils/logger';

const logger = new Logger('SecurityCore');

/**
 * Performs a timing-safe string comparison.
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validates the API Secret from the request header against the environment
 * @param headerSecret - Secret from request header
 * @param envSecret - Secret from environment
 * @returns Validation result
 */
export function validateApiSecret(headerSecret: string | null | undefined, envSecret: string | undefined): ValidationResult {
  if (!envSecret) {
    logger.error('API_SECRET not configured');
    return { valid: false, error: 'Server configuration error' };
  }

  if (!headerSecret || !timingSafeEqual(headerSecret, envSecret)) {
    return { valid: false, error: 'Invalid or missing API secret' };
  }
  
  return { valid: true };
}

/**
 * Normalizes the GEMINI_PROXY_MODE environment variable.
 * @param envValue - Value from environment (GEMINI_PROXY_MODE)
 * @returns 'demo' | 'private'
 */
export function getProxyMode(envValue: string | undefined): 'demo' | 'private' {
  return envValue === 'demo' ? 'demo' : 'private';
}
