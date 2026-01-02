import { IS_FORCED_PROXY } from '@/constants';

/**
 * Determines if requests should be routed through the proxy.
 * True when: forced proxy mode OR no direct API key available.
 * 
 * @param userApiKey - Optional API key from user settings
 * @returns boolean indicating if proxy should be used
 */
export function isUsingProxy(userApiKey?: string): boolean {
    // Note: process.env.GEMINI_API_KEY is injected by Vite ONLY in development mode.
    // In production builds, this will be an empty string to prevent key leakage.
    // User-provided API key always takes precedence over forced proxy
    const hasUserKey = !!userApiKey;
    const hasEnvKey = !!process.env.GEMINI_API_KEY;

    if (hasUserKey) return false;

    return IS_FORCED_PROXY || !hasEnvKey;
}

/**
 * Gets the actual API key to use for direct calls, or null if proxy should be used.
 * Honors IS_FORCED_PROXY setting.
 * 
 * @param userApiKey - Optional API key from user settings
 * @returns string | null
 */
export function getDirectApiKey(userApiKey?: string): string | null {
    // User-provided API key always takes precedence
    if (userApiKey) return userApiKey;

    // Forced proxy only affects the default/env API key
    if (IS_FORCED_PROXY) return null;

    return process.env.GEMINI_API_KEY || null;
}
