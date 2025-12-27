// This value is injected at build time from the .env or environment variables.
// In development, Vite takes this from .env.local
export const API_SECRET = (import.meta.env.VITE_API_SECRET as string) || '';

// FORCE PROXY FOR LOCAL TESTING (dev mode only):
// This allows testing server.js logic (rate limits, security headers) locally
// even if a GEMINI_API_KEY is defined in .env.local.
// Can be disabled in dev by setting VITE_FORCE_PROXY_OFF=true
export const IS_FORCED_PROXY = import.meta.env.DEV && import.meta.env.VITE_FORCE_PROXY_OFF !== 'true';
