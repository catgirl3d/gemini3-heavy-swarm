import { describe, expect, it } from 'vitest';
import {
  checkGlobalRateLimitFailure,
  checkGlobalStepFailure,
  getErrorLabel,
  getFriendlyErrorMessage,
  isRateLimitError,
} from '@/services/swarm/steps/utils/errorUtils';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

describe('errorUtils', () => {
  it('returns friendly messages via AppError classification', () => {
    expect(getFriendlyErrorMessage(new AppError('overloaded', ErrorCode.SERVICE_OVERLOADED))).toBe(
      'Service temporarily unavailable (503). Please try again later.'
    );
    expect(getFriendlyErrorMessage('Permission_Denied from backend')).toBe(
      'Configuration error. Please check your API key or model settings.'
    );
  });

  it('maps error labels for known error codes and falls back otherwise', () => {
    expect(getErrorLabel(new AppError('rate', ErrorCode.RATE_LIMIT), 'Default')).toBe('Rate Limited - Try Later');
    expect(getErrorLabel(new AppError('overload', ErrorCode.SERVICE_OVERLOADED), 'Default')).toBe('Service Overloaded');
    expect(getErrorLabel(new AppError('blocked', ErrorCode.SAFETY_BLOCK), 'Default')).toBe('Blocked by Safety');
    expect(getErrorLabel(new AppError('settings', ErrorCode.INVALID_SETTINGS), 'Default')).toBe('Check Settings');
    expect(getErrorLabel(new AppError('network', ErrorCode.NETWORK_ERROR), 'Default')).toBe('Network Error');
    expect(getErrorLabel(new AppError('validation', ErrorCode.VALIDATION_ERROR), 'Default')).toBe('Default');
  });

  it('detects rate limit errors from AppError instances and raw strings', () => {
    expect(isRateLimitError(new AppError('rate', ErrorCode.RATE_LIMIT))).toBe(true);
    expect(isRateLimitError('429 Resource exhausted')).toBe(true);
    expect(isRateLimitError(new AppError('network', ErrorCode.NETWORK_ERROR))).toBe(false);
  });

  it('checks for global rate limit failure only when all agents failed with rate limits', () => {
    const failures = [
      new AppError('rate-1', ErrorCode.RATE_LIMIT),
      '429 Resource exhausted',
    ];

    expect(checkGlobalRateLimitFailure(failures, 2)).toBe(true);
    expect(checkGlobalRateLimitFailure(failures, 3)).toBe(false);
    expect(checkGlobalRateLimitFailure([], 0)).toBe(false);
    expect(checkGlobalRateLimitFailure([failures[0], new AppError('network', ErrorCode.NETWORK_ERROR)], 2)).toBe(false);
  });

  it('checks for global step failure only when every agent failed and count is non-zero', () => {
    expect(checkGlobalStepFailure([new Error('a'), new Error('b')], 2)).toBe(true);
    expect(checkGlobalStepFailure([new Error('a')], 2)).toBe(false);
    expect(checkGlobalStepFailure([], 0)).toBe(false);
  });
});
