// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { MAX_CONTENT_CHARS } from '../security/security';
import { type OpenRouterRequest } from './types';
import { Logger } from '../utils/logger';

const logger = new Logger('OpenRouterProxyCore');

export type OpenRouterProxyPreparation =
  | {
      ok: true;
      targetUrl: string;
      requestBody: string;
    }
  | {
      ok: false;
      error: string;
      statusCode: number;
    };

/**
 * Validates and prepares a proxy request for OpenRouter API
 * @param requestBody - Incoming request body
 * @returns Preparation result
 */
export function validateAndPrepareOpenRouterProxy(requestBody: OpenRouterRequest, isPrivateMode: boolean = false): OpenRouterProxyPreparation {
  const { model, messages } = requestBody || {};
  
  // 1. Validate messages structure
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    logger.warn('Validation failed: messages must be a non-empty array');
    return { ok: false, error: 'Invalid messages structure', statusCode: 400 };
  }

  // 2. Validate model
  if (!model || typeof model !== 'string') {
    logger.warn('Validation failed: model is required');
    return { ok: false, error: 'Model is required', statusCode: 400 };
  }

  // Only free models are allowed through the proxy in demo mode
  const isFreeModel = model.endsWith(':free');
  if (!isFreeModel && !isPrivateMode) {
    logger.warn(`Unauthorized model requested through proxy: ${model}`);
    return {
      ok: false,
      error: 'Only free models are allowed in demo mode. Please provide your own OpenRouter API key to use paid models.',
      statusCode: 403
    };
  }

  // 3. Serialize and validate size to prevent DoS
  const serialized = JSON.stringify(requestBody);
  if (serialized.length > MAX_CONTENT_CHARS * 2) { // OpenRouter might have slightly different overhead, but using similar limit
    logger.warn(`Size validation failed: ${serialized.length} chars`);
    return { ok: false, error: 'Request too large', statusCode: 413 };
  }

  // Log the final payload for debugging
  logger.info(`[Backend Proxy] Preparing OpenRouter request for ${model}`);

  // 4. Build URL and return prepared request
  return {
    ok: true,
    targetUrl: 'https://openrouter.ai/api/v1/chat/completions',
    requestBody: serialized,
  };
}

// Default timeout for OpenRouter API requests (60 seconds)
const REQUEST_TIMEOUT_MS = 60000;

/**
 * Executes a prepared OpenRouter API request with timeout protection
 * @param url - OpenRouter API URL
 * @param body - Serialized request body
 * @param apiKey - OpenRouter API Key
 * @param referer - Optional referer for OpenRouter
 * @param title - Optional title for OpenRouter
 * @param timeoutMs - Request timeout in milliseconds (default: 60s)
 * @returns Promise resolving to Response
 */
export async function executeOpenRouterRequest(
  url: string, 
  body: string, 
  apiKey: string,
  referer?: string,
  title?: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (referer) headers['HTTP-Referer'] = referer;
  if (title) headers['X-Title'] = title;

  try {
    return await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
