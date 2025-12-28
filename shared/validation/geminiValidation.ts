/**
 * Shared validation and utility functions for Gemini API proxy
 * Used by both server.ts (Express) and functions/api/gemini.ts (Cloudflare)
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
}

export interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiContent {
  role?: string;
  parts: GeminiContentPart[];
}

/**
 * Validates the contents array structure
 * @param contents - The contents to validate
 * @returns Validation result
 */
export function validateContents(contents: any): ValidationResult {
  if (!contents || !Array.isArray(contents) || contents.length === 0) {
    return { valid: false, error: 'Missing or invalid "contents" in request body' };
  }
  
  const isValid = contents.every((item: any) =>
    item && 
    typeof item === 'object' && 
    Array.isArray(item.parts) && 
    item.parts.length > 0
  );
  
  if (!isValid) {
    return { 
      valid: false, 
      error: 'Invalid "contents" structure: each item must have a non-empty "parts" array (further validation by Gemini API)' 
    };
  }
  
  return { valid: true };
}

/**
 * Validates content size to prevent DoS
 * @param contents - The contents to validate
 * @param maxChars - Maximum allowed characters
 * @returns Validation result
 */
export function validateContentSize(contents: any, maxChars: number): ValidationResult {
  try {
    const contentString = JSON.stringify(contents);
    if (contentString.length > maxChars) {
      return { valid: false, error: 'Content too large', statusCode: 413 };
    }
    return { valid: true };
  } catch (e) {
    // Serialization failure is a malformed request (400), not size issue (413)
    return { valid: false, error: 'Content is not serializable', statusCode: 400 };
  }
}

/**
 * Determines target model based on proxy mode
 * @param requestedModel - Model requested by client
 * @param isPrivateMode - Whether proxy is in private mode
 * @returns The model to use
 */
export function getTargetModel(requestedModel: string | undefined | null, isPrivateMode: boolean): string {
  const defaultModel = 'gemini-2.5-flash-lite';
  return isPrivateMode ? (requestedModel || defaultModel) : defaultModel;
}

/**
 * Builds Gemini API URL for streaming
 * @param model - Model name
 * @returns Full API URL
 */
export function buildGeminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
}
