import { TokenUsage } from '@/types';

/**
 * Structure of a Gemini API response part.
 */
export interface GeminiPart {
  text?: string;
  thought?: boolean;
}

/**
 * Structure of Gemini API token usage metadata.
 */
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  /** Number of tokens used for "thoughts" in thinking models */
  thoughtsTokenCount?: number;
  /** Number of tokens from cached content */
  cachedContentTokenCount?: number;
  /** Number of tokens in tool-use prompts */
  toolUsePromptTokenCount?: number;
}

/**
 * Structure of Gemini grounding metadata.
 * Compatible with @google/genai GroundingChunk.
 */
export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  groundingMetadata?: {
    groundingChunks?: GroundingChunk[];
  };
}

/**
 * Gemini stream chunk structure (from Proxy or SDK).
 */
export interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  text?: () => string; // Proxy adds this helper
}

/**
 * OpenRouter stream chunk structure (normalized to match Gemini format).
 * OpenRouter chunks are already normalized in OpenRouterGenAI.ts to match Gemini format.
 */
export interface OpenRouterStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  text?: () => string;
}

/**
 * Union type for all supported stream chunk formats.
 */
export type StreamChunk = GeminiStreamChunk | OpenRouterStreamChunk;

/**
 * Result of processing a stream chunk.
 */
export interface StreamChunkResult {
  text: string;
  thought: string;
}

/**
 * Type guard to check if an object is a valid stream chunk.
 */
export function isValidStreamChunk(chunk: unknown): chunk is StreamChunk {
  return (
    typeof chunk === 'object' &&
    chunk !== null &&
    ('candidates' in chunk || 'usageMetadata' in chunk)
  );
}

/**
 * Safely extracts parts from a stream chunk with type checking.
 */
export function extractPartsFromChunk(chunk: unknown): GeminiPart[] | undefined {
  if (!isValidStreamChunk(chunk)) return undefined;
  return chunk.candidates?.[0]?.content?.parts;
}

/**
 * Safely extracts usage metadata from a stream chunk with type checking.
 */
export function extractUsageMetadataFromChunk(chunk: unknown): GeminiUsageMetadata | undefined {
  if (!isValidStreamChunk(chunk)) return undefined;
  return chunk.usageMetadata;
}

/**
 * Safely extracts grounding chunks from a stream chunk with type checking.
 */
export function extractGroundingChunksFromChunk(chunk: unknown): GroundingChunk[] | undefined {
  if (!isValidStreamChunk(chunk)) return undefined;
  return chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
}

/**
 * Extracts text and "thoughts" from chunk parts, separating them.
 * Gemini API returns parts with a `thought: true` flag for model reasoning.
 */
export const extractTextFromParts = (
  parts: GeminiPart[] | undefined
): StreamChunkResult => {
  let text = '';
  let thought = '';
  
  if (!parts || !Array.isArray(parts)) return { text, thought };
  
  for (const part of parts) {
    // Gemini marks "thoughts" with the thought: true flag
    // If it's a thought part with text, add to thought
    // Otherwise, if there's text - add to regular text
    if (part.thought === true) {
      if (part.text) {
        thought += part.text;
      }
    } else if (part.text) {
      text += part.text;
    }
  }
  
  return { text, thought };
};

/**
 * Extracts token usage information from chunk usage metadata.
 * Includes all available fields: prompt, candidates, thoughts, cached content, and tool use.
 */
export const extractTokenUsage = (usageMetadata: GeminiUsageMetadata | undefined): TokenUsage | null => {
  if (!usageMetadata) return null;
  
  return {
    promptTokens: usageMetadata.promptTokenCount || 0,
    candidatesTokens: usageMetadata.candidatesTokenCount || 0,
    totalTokens: usageMetadata.totalTokenCount || 0,
    thoughtsTokenCount: usageMetadata.thoughtsTokenCount,
    cachedContentTokenCount: usageMetadata.cachedContentTokenCount,
    toolUsePromptTokenCount: usageMetadata.toolUsePromptTokenCount
  };
};
