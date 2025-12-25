import type { Content, GenerationConfig, Tool } from '@google/genai';

export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_PROXY_MODE?: string;
  ALLOWED_ORIGINS?: string; // Comma-separated list of allowed origins
  API_SECRET?: string;         // Secret key for X-API-Secret
  RATE_LIMIT_KV?: unknown;         // KVNamespace for rate limiting
}

export interface GeminiRequest {
  model?: string;
  contents: Content[];
  generationConfig?: GenerationConfig;
  systemInstruction?: Content;
  tools?: Tool[];
}
