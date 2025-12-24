/**
 * CORS Helper for Cloudflare Functions
 * Validates origin against whitelist and generates appropriate headers
 */

import { DEFAULT_ALLOWED_ORIGINS } from '../constants/security.js';


/**
 * Parse allowed origins from environment or use defaults
 */
export function getAllowedOrigins(env: { ALLOWED_ORIGINS?: string }): string[] {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Check if origin is allowed and return appropriate CORS headers
 */
export function getCorsHeaders(request: any, env: { ALLOWED_ORIGINS?: string }): Headers {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);
  
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  // Check if origin is in whitelist
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
    headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  }

  return headers;
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflight(request: any, env: { ALLOWED_ORIGINS?: string }): Response | null {
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin');
    const allowedOrigins = getAllowedOrigins(env);
    
    if (origin && allowedOrigins.includes(origin)) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Secret',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    // Origin not allowed - return 403
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}

