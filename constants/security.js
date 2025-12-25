export const RATE_LIMIT_PER_MINUTE = 5; // Values Rate Limit system
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
  typeof process !== "undefined" && process.env?.NODE_ENV === "production"
    ? PRODUCTION_ORIGINS
    : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];

/**
 * Auto-detect if we're in production environment
 * Works in both Node.js (Express) and Cloudflare Workers
 * @param {Request} [request] - Optional request object (for Cloudflare)
 * @returns {boolean}
 */
export function isProductionEnvironment(request) {
  // 1. Node.js environment (e.g. Local Express Server, Google Cloud Run)
  // 'process' exists here, but usually NOT in Cloudflare Workers
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return true;
  }
  
  // Cloudflare Workers - check request origin/host
  if (request) {
    const origin = request.headers.get?.('Origin') || request.headers.get?.('Host') || '';
    const url = request.url || '';
    
    // Check if origin or URL matches production domains
    return PRODUCTION_ORIGINS.some(prodOrigin => 
      origin.includes(prodOrigin.replace('https://', '')) || 
      url.includes(prodOrigin.replace('https://', ''))
    );
  }
  
  // Default to false (development) if we can't determine
  return false;
}

// Whitelist of allowed models to prevent Path Injection and SSRF
export const AVAILABLE_MODELS = [
  { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)" },
];

export const ALLOWED_MODELS = AVAILABLE_MODELS.map((m) => m.value);
