// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { ALLOWED_MODELS, MAX_CONTENT_CHARS } from '../security/security';
import { validateContents, validateContentSize, getTargetModel, buildGeminiUrl } from '../validation/geminiValidation';
import { GeminiRequest } from './types';
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
  if (!validation.valid) {
    logger.warn(`Validation failed: ${validation.error}`);
    return { ok: false, error: validation.error, statusCode: 400 };
  }

  // 2. Validate content size to prevent DoS
  const sizeValidation = validateContentSize(contents, MAX_CONTENT_CHARS);
  if (!sizeValidation.valid) {
    logger.warn(`Size validation failed: ${sizeValidation.error}`);
    return { ok: false, error: sizeValidation.error, statusCode: sizeValidation.statusCode || 413 };
  }

  // 3. Determine target model based on proxy mode
  const targetModel = getTargetModel(model, isPrivateMode);

  // 4. Validate model against whitelist
  if (!ALLOWED_MODELS.includes(targetModel)) {
    logger.warn(`Unauthorized model requested: ${targetModel}`);
    return { ok: false, error: 'Invalid or unauthorized model', statusCode: 400 };
  }

  // 5. Build URL and Body
  return {
    ok: true,
    targetUrl: buildGeminiUrl(targetModel),
    targetModel,
    requestBody: JSON.stringify({ 
      contents, 
      generationConfig, 
      systemInstruction, 
      tools 
    }),
  };
}

/**
 * Executes a prepared Gemini API request
 * @param url - Gemini API URL
 * @param body - Serialized request body
 * @param apiKey - Gemini API Key
 * @returns Promise resolving to Response
 */
export async function executeGeminiRequest(url: string, body: string, apiKey: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body,
  });
}
