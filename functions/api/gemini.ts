import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env, GeminiRequest } from "../_types";
import { handleCorsPreflight, getCorsHeaders } from "../_cors";
import { validateSecretHeader, checkRateLimit } from "../_security";
import { ALLOWED_MODELS, MAX_REQUEST_SIZE, MAX_CONTENT_CHARS } from "../../constants/security.js";

export const onRequestPost = (async (context) => {
  const { request, env } = context;

  // Handle CORS preflight
  const preflightResponse = handleCorsPreflight(request, env);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Check origin for actual request
  const origin = request.headers.get("Origin");
  const corsHeaders = getCorsHeaders(request, env);

  // If there's an origin but it's not in corsHeaders, block the request
  if (origin && !corsHeaders.has("Access-Control-Allow-Origin")) {
    corsHeaders.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: corsHeaders,
    });
  }
  // Validate API Secret
  if (!validateSecretHeader(request, env)) {
    corsHeaders.set('Content-Type', 'application/json');
    return new Response(
      JSON.stringify({ error: "Invalid or missing API secret" }),
      {
        status: 403,
        headers: corsHeaders,
      }
    );
  }

  // Check Rate Limit
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimit = await checkRateLimit(ip, env.RATE_LIMIT_KV);
  if (!rateLimit.allowed) {
    corsHeaders.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: corsHeaders,
    });
  }

  // Check Request Size (Content-Length)
  const contentLength = parseInt(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_REQUEST_SIZE) {
    corsHeaders.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: "Request too large" }), {
      status: 413,
      headers: corsHeaders,
    });
  }

  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          error: "Server configuration error: API key missing",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    let body: GeminiRequest;
    try {
      body = (await request.json()) as GeminiRequest;
    } catch (e) {
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { model, contents, generationConfig, systemInstruction, tools } =
      body;

    // Validation: GeminiRequest requires contents
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid "contents" in request body',
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Deep validation of contents to prevent malformed data
    const isValidContents = contents.every(
      (item) =>
        item &&
        typeof item === "object" &&
        Array.isArray(item.parts) &&
        item.parts.length > 0
    );

    if (!isValidContents) {
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          error: 'Invalid "contents" structure: each item must have "parts" array',
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Validate content length to prevent DoS
    const contentString = JSON.stringify(contents);
    if (contentString.length > MAX_CONTENT_CHARS) {
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(JSON.stringify({ error: "Content too large" }), {
        status: 413,
        headers: corsHeaders,
      });
    }

    // Determine model based on proxy mode
    // If GEMINI_PROXY_MODE is 'demo' OR not set, enforce flash-lite to prevent abuse
    // Only if GEMINI_PROXY_MODE is 'private', allow the requested model
    const isPrivateMode = env.GEMINI_PROXY_MODE === "private";
    const targetModel = isPrivateMode
      ? model || "gemini-2.5-flash-lite"
      : "gemini-2.5-flash-lite";

    // Validate model against whitelist
    if (!ALLOWED_MODELS.includes(targetModel)) {
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({ error: "Invalid or unauthorized model" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Construct the Google API URL (no key in URL)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        systemInstruction,
        tools,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      corsHeaders.set('Content-Type', 'application/json');
      return new Response(
        JSON.stringify({
          error: `Gemini API error: ${response.status}`,
          details: errorText,
        }),
        {
          status: response.status,
          headers: corsHeaders,
        }
      );
    }

    // Proxy the stream directly with CORS headers
    // Use upstream Content-Type from Google API
    const upstreamContentType = response.headers.get('Content-Type');
    if (upstreamContentType) {
      corsHeaders.set('Content-Type', upstreamContentType);
    }
    
    return new Response(response.body, {
      headers: corsHeaders,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    corsHeaders.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}) as unknown as PagesFunction<Env>;
