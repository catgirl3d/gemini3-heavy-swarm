// Note: Using relative paths instead of aliases (@shared)
// because aliases are not natively supported by Cloudflare Pages Functions/Wrangler.
import { GenericRequest } from '../api/types';
import { Logger } from '../utils/logger';

const logger = new Logger('SecurityUtils');

export const RATE_LIMIT_PER_MINUTE = 2; // Values Rate Limit system
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

// Combined list based on environment
// In Cloudflare Functions, set ALLOWED_ORIGINS env var for production to override
export const DEFAULT_ALLOWED_ORIGINS =
  typeof process !== "undefined" && (process as any).env?.NODE_ENV === "production"
    ? PRODUCTION_ORIGINS
    : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];

/**
 * Auto-detect if we're in production environment
 * Works in both Node.js (Express) and Cloudflare Workers
 * @param request - Optional request object (for Cloudflare)
 * @returns boolean
 */
export function isProductionEnvironment(request?: GenericRequest): boolean {
  // 1. Node.js environment (e.g. Local Express Server, Google Cloud Run)
  if (typeof process !== "undefined" && (process as any).env?.NODE_ENV === "production") {
    return true;
  }
  
  // Cloudflare Workers - check request origin/host
  if (request) {
    // We use any for request to handle different implementations of Request object
    const headers = request.headers;
    const originValue = typeof headers.get === 'function' ? headers.get('Origin') : headers['origin'];
    const hostValue = typeof headers.get === 'function' ? headers.get('Host') : headers['host'];
    
    // Normalize to string (handle string or string[])
    const originStr = Array.isArray(originValue) ? originValue[0] : (typeof originValue === 'string' ? originValue : '');
    const hostStr = Array.isArray(hostValue) ? hostValue[0] : (typeof hostValue === 'string' ? hostValue : '');
    
    const finalOrigin = originStr || hostStr || '';
    const url = request.url || '';
    
    // Check if origin or URL matches production domains
    try {
      const parsedUrl = url ? new URL(url) : null;
      return PRODUCTION_ORIGINS.some(prod => {
        const domain = prod.replace('https://', '');
        return finalOrigin === prod ||
               finalOrigin === domain ||
               (parsedUrl && parsedUrl.origin === prod);
      });
    } catch (e) {
      // Fallback to string checks if URL parsing fails
      return PRODUCTION_ORIGINS.some(prodOrigin => {
        const domain = prodOrigin.replace('https://', '');
        return finalOrigin === prodOrigin ||
               finalOrigin === domain ||
               url === prodOrigin ||
               url.startsWith(prodOrigin + '/');
      });
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
  { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)" },
];

export const ALLOWED_MODELS = AVAILABLE_MODELS.map((m) => m.value);
