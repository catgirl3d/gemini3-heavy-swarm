/**
 * Shared validation and utility functions for Gemini API proxy
 * Used by both server.js (Express) and functions/api/gemini.ts (Cloudflare)
 */

/**
 * Validates the contents array structure
 * @param {any} contents - The contents to validate
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateContents(contents) {
  if (!contents || !Array.isArray(contents) || contents.length === 0) {
    return { valid: false, error: 'Missing or invalid "contents" in request body' };
  }
  
  const isValid = contents.every(item =>
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
 * @param {any} contents - The contents to validate
 * @param {number} maxChars - Maximum allowed characters
 * @returns {{ valid: boolean; error?: string; statusCode?: number }}
 */
export function validateContentSize(contents, maxChars) {
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
 * @param {string} requestedModel - Model requested by client
 * @param {boolean} isPrivateMode - Whether proxy is in private mode
 * @returns {string} The model to use
 */
export function getTargetModel(requestedModel, isPrivateMode) {
  const defaultModel = 'gemini-2.5-flash-lite';
  return isPrivateMode ? (requestedModel || defaultModel) : defaultModel;
}

/**
 * Builds Gemini API URL for streaming
 * @param {string} model - Model name
 * @returns {string} Full API URL
 */
export function buildGeminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
}
