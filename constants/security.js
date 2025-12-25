export const RATE_LIMIT_PER_MINUTE = 5; // Low values for testing Rate Limit system
export const MAX_REQUEST_SIZE = 100 * 1024; // 100KB limit for the entire request
export const MAX_CONTENT_CHARS = 100000; // Character limit for the 'contents' field

// Production origins - these are always allowed
export const PRODUCTION_ORIGINS = [
  "https://gemini3-heavy-swarm.pages.dev",
  "https://ai-swarm.lisova-minds.pro",
];

// Development origins - only used when NODE_ENV !== 'production'
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
