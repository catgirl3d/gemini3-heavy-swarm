/**
 * Determines a user-friendly error message for the full UI error display.
 */
export const getFriendlyErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return 'An unexpected error occurred.';
  
  const errStr = (error.message + (error.stack || '')).toUpperCase();
  
  if (errStr.includes('429') || errStr.includes('RATE LIMIT') || errStr.includes('RESOURCE_EXHAUSTED')) {
    return 'Too many requests (429). Please wait a moment and try again.';
  }
  if (errStr.includes('503') || errStr.includes('OVERLOADED') || errStr.includes('TRANSIENT')) {
    return 'Service temporarily unavailable (503). Please try again later.';
  }
  if (errStr.includes('SAFETY')) {
    return 'Response blocked due to safety settings.';
  }
  
  return `Error: ${error.message}`;
};

/**
 * Determines a user-friendly error label (short) based on the error type.
 */
export const getErrorLabel = (error: unknown, defaultLabel: string): string => {
  if (!(error instanceof Error)) return defaultLabel;
  
  const errStr = (error.message + (error.stack || '')).toLowerCase();
  
  if (errStr.includes('429') || errStr.includes('rate limit') || errStr.includes('too many requests') || errStr.includes('resource_exhausted')) {
    return 'Rate Limited - Try Later';
  }
  if (errStr.includes('503') || errStr.includes('overloaded') || errStr.includes('transient')) {
    return 'Service Overloaded';
  }
  if (errStr.includes('safety') || errStr.includes('block') || errStr.includes('finish_reason_safety')) {
    return 'Blocked by Safety';
  }
  if (errStr.includes('quota')) {
    return 'Quota Exceeded';
  }
  
  return defaultLabel;
};

/**
 * Checks if the error is a rate limit error.
 */
export const isRateLimitError = (error: unknown): boolean => {
  const msg = (error instanceof Error 
    ? (error.message + (error.stack || '')) 
    : String(error)
  ).toLowerCase();
  
  return msg.includes('429') || 
         msg.includes('rate limit') || 
         msg.includes('too many requests') ||
         msg.includes('resource_exhausted');
};

/**
 * Checks if all agents failed due to a rate limit.
 * Returns true only if ALL agents failed and ALL errors are rate limits.
 */
export const checkGlobalRateLimitFailure = (
  failures: unknown[], 
  totalAgents: number
): boolean => {
  if (failures.length !== totalAgents || totalAgents === 0) return false;
  // All errors must be rate limit for a global stop
  return failures.every(isRateLimitError);
};
