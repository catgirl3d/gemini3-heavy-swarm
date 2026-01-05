/**
 * Minimum output tokens for thinking models to ensure enough space for actual text after reasoning.
 * Without sufficient output tokens, thinking models may consume all tokens in reasoning
 * and return no actual text (only thoughts), causing empty responses.
 */
export const MIN_OUTPUT_TOKENS_FOR_THINKING = 4000;
