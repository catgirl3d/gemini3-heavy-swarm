/**
 * @fileoverview Constants and configuration for AI models used in the application.
 */

/**
 * Minimum output tokens for thinking models to ensure enough space for actual text after reasoning.
 * Without sufficient output tokens, thinking models may consume all tokens in reasoning
 * and return no actual text (only thoughts), causing empty responses.
 */
export const MIN_OUTPUT_TOKENS_FOR_THINKING = 4000;

/**
 * Maximum output tokens limit enforced by the UI and proxy.
 * Prevents users from setting unreasonably high values that could cause performance issues
 * or exceed API limits.
 */
export const MAX_OUTPUT_TOKENS_LIMIT = 65536;

/**
 * Mapping of model IDs to human-readable display names.
 * Used in UI components like ModelSelector for better user experience.
 *
 * Models are added here to ensure they have
 * user-friendly labels in the settings and selection menus.
 */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-3-pro-preview': 'Gemini 3 Pro',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
};
