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
 * Result of processing a stream chunk.
 */
export interface StreamChunkResult {
  text: string;
  thought: string;
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
