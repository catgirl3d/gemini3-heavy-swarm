/**
 * Shared validation and utility functions for Gemini API proxy
 * Used by both server.ts (Express) and functions/api/gemini.ts (Cloudflare)
 */

import { DEFAULT_MODEL } from '../security/security';

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
export function validateContents(contents: unknown): ValidationResult {
  if (!contents || !Array.isArray(contents) || contents.length === 0) {
    return { valid: false, error: 'Missing or invalid "contents" in request body' };
  }
  
  const isValid = contents.every((item: unknown) =>
    item && 
    typeof item === 'object' && 
    'parts' in item &&
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

export type SerializationResult =
  | {
      valid: true;
      serialized: string;
    }
  | {
      valid: false;
      error: string;
      statusCode: number;
    };

/**
 * Serializes and validates request body size to prevent DoS
 * @param contents - The contents array (unknown type for flexibility)
 * @param generationConfig - Optional generation config
 * @param systemInstruction - Optional system instruction
 * @param tools - Optional tools
 * @param maxChars - Maximum allowed characters
 * @returns Serialization result with body or error
 */
export function serializeRequestBody(
  contents: unknown,
  generationConfig: unknown,
  systemInstruction: unknown,
  tools: unknown,
  maxChars: number
): SerializationResult {
  try {
    const requestBody = { contents, generationConfig, systemInstruction, tools };
    const serialized = JSON.stringify(requestBody);
    
    if (serialized.length > maxChars) {
      return { valid: false, error: 'Content too large', statusCode: 413 };
    }
    
    return { valid: true, serialized };
  } catch {
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
  // In demo mode, always use DEFAULT_MODEL regardless of client request
  // In private mode, use client's requested model or fallback to DEFAULT_MODEL
  return isPrivateMode ? (requestedModel || DEFAULT_MODEL) : DEFAULT_MODEL;
}

/**
 * Builds Gemini API URL for streaming
 * @param model - Model name
 * @returns Full API URL
 */
export function buildGeminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
}
