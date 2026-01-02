import type { GeminiRequest, OpenRouterRequest, KVNamespaceSubset } from '../shared/api/types';

export interface Env {
  GEMINI_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_REFERER?: string;
  OPENROUTER_TITLE?: string;
  PROXY_MODE?: string;
  ALLOWED_ORIGINS?: string; // Comma-separated list of allowed origins
  API_SECRET?: string;         // Secret key for X-API-Secret
  RATE_LIMIT_KV?: KVNamespaceSubset;         // KVNamespace for rate limiting
}

export type { GeminiRequest, OpenRouterRequest };
