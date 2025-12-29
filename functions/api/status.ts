import type { PagesFunction } from '@cloudflare/workers-types';
// Note: Using relative paths instead of aliases (@shared, @functions)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import type { Env } from '../_types';
import { getAllowedOrigins } from '../../shared/api/cors.core';

import {
  isCloudflareProduction,
  buildUnifiedHeaders,
  handleCorsPreflightIfNeeded
} from "../../shared/api/adapters/cloudflare.adapter";
import { getProxyMode } from '../../shared/api/security.core';

export const onRequestGet = (async (context) => {
  const { request, env } = context;
  
  const isProduction = isCloudflareProduction(request);
  const origin = request.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins(env.ALLOWED_ORIGINS);

  // Build headers
  const headers = buildUnifiedHeaders(origin, allowedOrigins, isProduction);

  // Handle preflight
  const preflightResponse = handleCorsPreflightIfNeeded(request, origin, allowedOrigins, headers);
  if (preflightResponse) return preflightResponse;

  return new Response(JSON.stringify({
    hasServerKey: !!env.GEMINI_API_KEY,
    hasKV: !!env.RATE_LIMIT_KV,
    proxyMode: getProxyMode(env.GEMINI_PROXY_MODE)
  }), {
    headers
  });
}) as unknown as PagesFunction<Env>;
