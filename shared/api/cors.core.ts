// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { DEFAULT_ALLOWED_ORIGINS, PRODUCTION_ORIGINS, isProductionByNodeEnv } from '../security/security';
import { CORS_CONFIG, SECURITY_CONFIG } from './types';

/**
 * Parse allowed origins from environment or use defaults.
 * In production, only production origins are allowed (unless overridden by envOrigins).
 * @param envOrigins - Optional comma-separated list of allowed origins (overrides all defaults)
 * @param isProduction - Whether running in production (filters out dev origins)
 * @returns Array of allowed origins
 */
export function getAllowedOrigins(envOrigins?: string, isProduction?: boolean): string[] {
  // If explicit origins are provided via environment, use those
  if (envOrigins) {
    return envOrigins.split(',').map(o => o.trim());
  }
  
  // Check NODE_ENV for Node.js environments
  const isProd = isProduction ?? isProductionByNodeEnv();
  
  // In production, only allow production origins
  return isProd ? PRODUCTION_ORIGINS : DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Check if origin is in the allowed list
 * @param origin - Origin to check
 * @param allowedOrigins - List of allowed origins
 * @returns boolean
 */
export function isOriginAllowed(origin: string | null | undefined, allowedOrigins: string[]): boolean {
  return !!(origin && allowedOrigins.includes(origin));
}

/**
 * Build CORS headers for a specific origin
 * @param origin - Origin to allow
 * @returns Record of headers
 */
export function buildCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_CONFIG.methods,
    'Access-Control-Allow-Headers': CORS_CONFIG.headers,
    'Access-Control-Max-Age': CORS_CONFIG.maxAge,
    'Vary': 'Origin',
  };
}

/**
 * Build security headers (HSTS, CSP, etc.)
 * @param isProduction - Whether in production
 * @param isApiEndpoint - Whether this is an API endpoint (affects CSP)
 * @returns Record of headers
 */
export function buildSecurityHeaders(isProduction: boolean, isApiEndpoint = true): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': SECURITY_CONFIG.xContentTypeOptions,
    'X-Frame-Options': SECURITY_CONFIG.xFrameOptions,
  };
  
  if (isApiEndpoint) {
    headers['Content-Security-Policy'] = SECURITY_CONFIG.csp;
  }
  
  if (isProduction) {
    headers['Strict-Transport-Security'] = SECURITY_CONFIG.hsts;
  }
  
  return headers;
}

/**
 * Build all standard API headers (CORS + Security + Content-Type)
 * @param origin - Current request origin
 * @param allowedOrigins - List of allowed origins
 * @param isProduction - Whether in production
 * @param contentType - Content-Type header value (default: application/json)
 * @returns Record of all headers
 */
export function buildAllHeaders(
  origin: string | null | undefined, 
  allowedOrigins: string[], 
  isProduction: boolean,
  contentType: string = 'application/json'
): Record<string, string> {
  const corsHeaders = (origin && isOriginAllowed(origin, allowedOrigins))
    ? buildCorsHeaders(origin)
    : {};

  const securityHeaders = buildSecurityHeaders(isProduction, true);

  return {
    ...corsHeaders,
    ...securityHeaders,
    'Content-Type': contentType,
  };
}

/**
 * Validates if an OPTIONS preflight request should be allowed.
 * @param method - Request method
 * @param origin - Request origin
 * @param allowedOrigins - List of allowed origins
 * @returns { isPreflight: boolean; allowed: boolean }
 */
export function checkPreflightAllowed(method: string, origin: string | null | undefined, allowedOrigins: string[]): { isPreflight: boolean; allowed: boolean } {
  if (method !== 'OPTIONS') {
    return { isPreflight: false, allowed: true };
  }
  return { isPreflight: true, allowed: isOriginAllowed(origin, allowedOrigins) };
}
