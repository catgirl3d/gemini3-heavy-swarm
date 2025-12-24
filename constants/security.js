export const RATE_LIMIT_PER_MINUTE = 4; // Currently set to 4, for testing Rate Limit system

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
