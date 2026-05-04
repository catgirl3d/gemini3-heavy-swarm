import type { PagesFunction } from "@cloudflare/workers-types";
// Note: Using relative paths instead of aliases (@shared, @functions)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import type { Env, GeminiRequest } from "../_types";
import { getAllowedOrigins, isOriginAllowed } from "../../shared/api/cors.core";
import { validateApiSecret, getProxyMode } from "../../shared/api/security.core";
import { validateAndPrepareProxy, executeGeminiRequest } from "../../shared/api/geminiProxy.core";
import {
  checkRateLimit,
  isCloudflareProduction,
  buildUnifiedHeaders,
  handleCorsPreflightIfNeeded,
  wrapStreamWithLogging
} from "../../shared/api/adapters/cloudflare.adapter";
import { MAX_REQUEST_SIZE } from "../../shared/security/security";
import { getSafeGeminiError } from "../../shared/api/errors";
import { Logger } from "../../shared/utils/logger";

const logger = new Logger('CloudflareFunction');

export const onRequestPost = (async (context) => {
  const { request, env } = context;

  const isProduction = isCloudflareProduction(request);
  const origin = request.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins(env.ALLOWED_ORIGINS);

  // Build all headers
  const headers = buildUnifiedHeaders(origin, allowedOrigins, isProduction);

  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightIfNeeded(request, origin, allowedOrigins, headers);
  if (preflightResponse) return preflightResponse;

  // Block requests from non-whitelisted origins
  if (origin && !isOriginAllowed(origin, allowedOrigins)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });
  }

  // Validate API Secret
  const secret = request.headers.get("X-API-Secret");
  const secretValidation = validateApiSecret(secret, env.API_SECRET);
  if (!secretValidation.valid) {
    return new Response(JSON.stringify({ error: secretValidation.error }), {
      status: secretValidation.error === "Server configuration error" ? 500 : 403,
      headers,
    });
  }

  // Check Rate Limit
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimit = await checkRateLimit(ip, env.RATE_LIMIT_KV);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers });
  }

  // Check Request Size (Content-Length) to prevent memory DoS
  const contentLength = parseInt(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_REQUEST_SIZE) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server configuration error: API key missing" }), { status: 500, headers });
    }

    let body: GeminiRequest;
    try {
      body = (await request.json()) as GeminiRequest;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }

    // Validation and preparation
    const isPrivateMode = getProxyMode(env.PROXY_MODE) === 'private';
    const preparation = validateAndPrepareProxy(body, isPrivateMode);
    
    if (preparation.ok === false) {
      return new Response(JSON.stringify({ error: preparation.error }), {
        status: preparation.statusCode,
        headers,
      });
    }

    logger.info(`Request received. Requested: ${body.model || 'default'}, Target: ${preparation.targetModel}`);

    // Execute request
    const response = await executeGeminiRequest(preparation.targetUrl, preparation.requestBody, apiKey);

    if (!response.ok) {
      const errorText = await response.text();
      const safeError = getSafeGeminiError(response.status, errorText);
      return new Response(
        JSON.stringify({ error: safeError.error }),
        { status: safeError.statusCode, headers }
      );
    }

    // Proxy the stream directly
    const upstreamContentType = response.headers.get('Content-Type');
    if (upstreamContentType) {
      headers.set('Content-Type', upstreamContentType);
    }
    
    // Wrap stream for error logging
    const wrappedBody = response.body ? wrapStreamWithLogging(response.body) : null;
    return new Response(wrappedBody, { headers });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers });
  }
}) as unknown as PagesFunction<Env>;
