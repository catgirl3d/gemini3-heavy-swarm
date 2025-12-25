import { IS_FORCED_PROXY } from '../constants';

/**
 * Determines if requests should be routed through the proxy.
 * True when: forced proxy mode OR no direct API key available.
 * 
 * @param userApiKey - Optional API key from user settings
 * @returns boolean indicating if proxy should be used
 */
export function isUsingProxy(userApiKey?: string): boolean {
    // Note: process.env.GEMINI_API_KEY is available in the client via Vite injection
    return IS_FORCED_PROXY || (!userApiKey && !process.env.GEMINI_API_KEY);
}

/**
 * Gets the actual API key to use for direct calls, or null if proxy should be used.
 * Honors IS_FORCED_PROXY setting.
 * 
 * @param userApiKey - Optional API key from user settings
 * @returns string | null
 */
export function getDirectApiKey(userApiKey?: string): string | null {
    if (IS_FORCED_PROXY) return null;
    return userApiKey || process.env.GEMINI_API_KEY || null;
}
