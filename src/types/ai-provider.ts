import { Content, Tool, GroundingChunk } from '@google/genai';
import { AppSettings, TokenUsage } from '@/types';

/**
 * Provider capabilities - what features a provider supports.
 * Used for conditional tool enabling and UI visibility.
 */
export interface ProviderCapabilities {
  /** Supports Google Search grounding */
  search: boolean;
  /** Supports image/vision inputs */
  vision: boolean;
  /** Supports thinking/reasoning tokens */
  reasoning: boolean;
  /** Supports code execution */
  codeExecution: boolean;
}

/**
 * Unified request format for all providers.
 */
export interface GenerateRequest {
  model: string;
  contents: Content[];
  config?: {
    systemInstruction?: string;
    tools?: Tool[];
    generationConfig?: {
      temperature?: number;
      maxOutputTokens?: number;
      [key: string]: unknown;
    };
  };
}

/**
 * Unified chunk format yielded during streaming.
 */
export interface StreamChunk {
  text: string;
  thought?: string;
  usage?: TokenUsage | null;
  groundingChunks?: GroundingChunk[];
  /** Raw provider-specific chunk for edge cases */
  raw?: unknown;
}

/**
 * Stream result returned from generateContentStream.
 */
export interface ProviderStreamResult {
  stream: AsyncIterable<StreamChunk>;
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;
}

/**
 * Unified AI Provider interface.
 * All providers must implement this interface to ensure interoperability.
 */
export interface AiProvider {
  /** Unique provider identifier */
  readonly name: string;

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /**
   * Returns settings adjusted for this provider's capabilities.
   * E.g., OpenRouter disables search flags.
   */
  getEffectiveSettings(settings: AppSettings): AppSettings;

  /**
   * Returns models facade for compatibility with existing code.
   * Contains the generateContentStream method.
   */
  readonly models: {
    generateContentStream(request: GenerateRequest): Promise<ProviderStreamResult>;
  };

  /**
   * Returns the default/fallback model for this provider.
   */
  getDefaultModel(settings: AppSettings): string;
}
