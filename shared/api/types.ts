import type { Content, GenerationConfig, Tool } from '@google/genai';

export interface GeminiRequest {
  model?: string;
  contents: Content[];
  generationConfig?: GenerationConfig;
  systemInstruction?: Content;
  tools?: Tool[];
}

export interface OpenRouterRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface KVNamespaceSubset {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Represents a generic HTTP request that can be handled across different environments 
 * (Express, Cloudflare Workers, etc.)
 */
export interface GenericRequest {
  /**
   * Request headers. 
   * Supports both a standard `get(name)` method and direct property access 
   * to accommodate various server frameworks and fetch-like APIs.
   * 
   * @example
   * ```ts
   * const secret = req.headers.get?.('X-API-Secret');
   * // OR
   * const contentType = req.headers['content-type'];
   * ```
   */
  headers: {
    get?(name: string): string | null;
    [key: string]: string | string[] | ((name: string) => string | null) | undefined;
  };
  /**
   * Optional full URL of the request
   */
  url?: string;
}

export interface CorsConfig {
  methods: string;
  headers: string;
  maxAge: string;
}

export const CORS_CONFIG: CorsConfig = {
  methods: 'GET, POST, OPTIONS',
  headers: 'Content-Type, X-API-Secret',
  maxAge: '86400',
};

export interface SecurityConfig {
  csp: string;
  hsts: string;
  xFrameOptions: string;
  xContentTypeOptions: string;
}

export const SECURITY_CONFIG: SecurityConfig = {
  csp: "default-src 'none'; frame-ancestors 'none';",
  hsts: "max-age=31536000; includeSubDomains",
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}
