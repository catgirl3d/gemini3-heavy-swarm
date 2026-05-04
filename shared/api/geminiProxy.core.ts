// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { ALLOWED_MODELS, MAX_CONTENT_CHARS } from '../security/security';
import { validateContents, serializeRequestBody, getTargetModel, buildGeminiUrl } from '../validation/geminiValidation';
import { type GeminiRequest } from './types';
import { Logger } from '../utils/logger';

const logger = new Logger('GeminiProxyCore');

export type ProxyPreparation =
  | {
      ok: true;
      targetUrl: string;
      targetModel: string;
      requestBody: string;
    }
  | {
      ok: false;
      error: string;
      statusCode: number;
    };

/**
 * Validates and prepares a proxy request for Gemini API
 * @param requestBody - Incoming request body
 * @param isPrivateMode - Whether proxy is in private mode
 * @returns Preparation result
 */
export function validateAndPrepareProxy(requestBody: GeminiRequest, isPrivateMode: boolean): ProxyPreparation {
  const { model, contents, generationConfig, systemInstruction, tools } = requestBody || {};
  
  // 1. Validate contents structure
  const validation = validateContents(contents);
  if (validation.valid === false) {
    const errorMsg = validation.error || 'Invalid contents structure';
    logger.warn(`Validation failed: ${errorMsg}`);
    return { ok: false, error: errorMsg, statusCode: 400 };
  }

  // 2. Determine target model based on proxy mode
  const targetModel = getTargetModel(model, isPrivateMode);

  // 3. Validate model against whitelist
  if (!ALLOWED_MODELS.includes(targetModel)) {
    logger.warn(`Unauthorized model requested: ${targetModel}`);
    return { ok: false, error: 'Invalid or unauthorized model', statusCode: 400 };
  }

  // 4. Serialize and validate size to prevent DoS (single serialization)
  const serialization = serializeRequestBody(
    contents,
    generationConfig,
    systemInstruction,
    tools,
    MAX_CONTENT_CHARS
  );
  
  if (serialization.valid === false) {
    logger.warn(`Serialization/size validation failed: ${serialization.error}`);
    return { ok: false, error: serialization.error, statusCode: serialization.statusCode };
  }

  // Log the final payload for debugging
  logger.info(`[Backend Proxy] Preparing request for ${targetModel}`, {
    generationConfig: JSON.stringify(generationConfig, null, 2),
    systemInstructionVisible: !!systemInstruction
  });

  // 5. Build URL and return prepared request
  return {
    ok: true,
    targetUrl: buildGeminiUrl(targetModel),
    targetModel,
    requestBody: serialization.serialized,
  };
}

// Default timeout for Gemini API requests (60 seconds)
const REQUEST_TIMEOUT_MS = 60000;

/**
 * Executes a prepared Gemini API request with timeout protection
 * @param url - Gemini API URL
 * @param body - Serialized request body
 * @param apiKey - Gemini API Key
 * @param timeoutMs - Request timeout in milliseconds (default: 60s)
 * @returns Promise resolving to Response
 */
export async function executeGeminiRequest(
  url: string, 
  body: string, 
  apiKey: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
