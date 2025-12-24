import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_types';
import { handleCorsPreflight, getCorsHeaders } from '../_cors';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(request, env);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Get CORS headers
  const corsHeaders = getCorsHeaders(request, env);
  
  return new Response(JSON.stringify({
    hasServerKey: !!env.GEMINI_API_KEY,
    proxyMode: env.GEMINI_PROXY_MODE || 'demo'
  }), {
    headers: corsHeaders
  });
};
