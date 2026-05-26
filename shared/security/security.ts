// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { type GenericRequest } from '../api/types';

/**
 * Safe environment utilities for cross-runtime compatibility
 * Works in Node.js, Cloudflare Workers, and browser contexts
 */

/**
 * Safely get NODE_ENV value
 * @returns NODE_ENV value or undefined if not available
 */
export function getNodeEnv(): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV;
  }
  return undefined;
}

/**
 * Check if running in production based on NODE_ENV
 * @returns true if NODE_ENV === 'production'
 */
export function isProductionByNodeEnv(): boolean {
  return getNodeEnv() === 'production';
}

export const RATE_LIMIT_PER_MINUTE = 6; // Values Rate Limit system
export const MAX_REQUEST_SIZE = 100 * 1024; // 100KB limit for the entire request
export const MAX_CONTENT_CHARS = 100000; // Character limit for the 'contents' field

// Production origins - these are always allowed
export const PRODUCTION_ORIGINS = [
  "https://gemini3-heavy-swarm.pages.dev",
  "https://ai-swarm.lisova-minds.pro",
];

// Development origins - only used in development (auto-detected)
export const DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

// Default allowed origins - includes both production and development
// Use getAllowedOrigins() from cors.core.ts to get the correct list based on environment
export const DEFAULT_ALLOWED_ORIGINS = [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];

/**
 * Auto-detect if we're in production environment
 * Works in both Node.js (Express) and Cloudflare Workers
 * @param request - Optional request object (for Cloudflare Workers)
 * @returns boolean
 */
export function isProductionEnvironment(request?: GenericRequest): boolean {
  // Node.js: check NODE_ENV
  if (isProductionByNodeEnv()) {
    return true;
  }
  
  // Cloudflare Workers: check if request URL matches production domain
  // request.url contains the full URL of the Worker (e.g., https://your-worker.pages.dev/api/...)
  // This is reliable because it's the actual URL being accessed, not a client-provided header
  if (request?.url) {
    try {
      const url = new URL(request.url);
      return PRODUCTION_ORIGINS.some(origin => {
        const hostname = origin.replace(/^https?:\/\//, '');
        return url.origin === origin || url.hostname === hostname;
      });
    } catch {
      return false;
    }
  }
  
  // Default to false (development) if we can't determine
  return false;
}

export interface ModelOption {
  value: string;
  label: string;
}

// Whitelist of allowed models to prevent Path Injection and SSRF
export const AVAILABLE_MODELS: ModelOption[] = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
];

export const ALLOWED_MODELS = AVAILABLE_MODELS.map((m) => m.value);

// Default model used in demo mode and as fallback in private mode
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
