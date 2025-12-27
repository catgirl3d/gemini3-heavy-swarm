import { AppError, ErrorCode } from '@/utils/errors/AppError';

/**
 * Determines a user-friendly error message for the full UI error display.
 */
export const getFriendlyErrorMessage = (error: unknown): string => {
  const appError = AppError.from(error);
  return appError.toFriendlyMessage();
};

/**
 * Determines a user-friendly error label (short) based on the error type.
 */
export const getErrorLabel = (error: unknown, defaultLabel: string): string => {
  const appErr = AppError.from(error);
  
  switch (appErr.code) {
    case ErrorCode.RATE_LIMIT:
      return 'Rate Limited - Try Later';
    case ErrorCode.SERVICE_OVERLOADED:
      return 'Service Overloaded';
    case ErrorCode.SAFETY_BLOCK:
      return 'Blocked by Safety';
    case ErrorCode.INVALID_SETTINGS:
      return 'Check Settings';
    case ErrorCode.NETWORK_ERROR:
      return 'Network Error';
    default:
      return defaultLabel;
  }
};

/**
 * Checks if the error is a rate limit error.
 */
export const isRateLimitError = (error: unknown): boolean => {
  const appErr = AppError.from(error);
  return appErr.code === ErrorCode.RATE_LIMIT;
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
