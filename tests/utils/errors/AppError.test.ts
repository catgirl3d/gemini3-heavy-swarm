import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

/**
 * Unit tests for AppError classification logic.
 * These examples correspond to real-world errors from Google Gemini API and SDK.
 */
describe('AppError Classification', () => {
  const testCases = [
    {
      name: '429 via HTTP status',
      input: { err: 'error message', status: 429 },
      expected: ErrorCode.RATE_LIMIT
    },
    {
      name: '503 via HTTP status',
      input: { err: 'error message', status: 503 },
      expected: ErrorCode.SERVICE_OVERLOADED
    },
    {
      name: 'Gemini SDK 429 message',
      input: { err: '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/...: [429 Too Many Requests] Resource has been exhausted (e.g. check quota).' },
      expected: ErrorCode.RATE_LIMIT
    },
    {
      name: 'Gemini SDK 503 message',
      input: { err: '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/...: [503 Service Unavailable] The service is currently overloaded. Please try again later.' },
      expected: ErrorCode.SERVICE_OVERLOADED
    },
    {
      name: 'Gemini API status string: RESOURCE_EXHAUSTED',
      input: { err: '{"error": {"code": 429, "message": "...", "status": "RESOURCE_EXHAUSTED"}}' },
      expected: ErrorCode.RATE_LIMIT
    },
    {
      name: 'Gemini API status string: UNAVAILABLE',
      input: { err: '{"error": {"code": 503, "message": "...", "status": "UNAVAILABLE"}}' },
      expected: ErrorCode.SERVICE_OVERLOADED
    },
    {
      name: 'Safety block message',
      input: { err: 'Response blocked due to safety settings: FINISH_REASON_SAFETY' },
      expected: ErrorCode.SAFETY_BLOCK
    },
    {
      name: 'Network error: Failed to fetch',
      input: { err: 'TypeError: Failed to fetch' },
      expected: ErrorCode.NETWORK_ERROR
    },
    {
      name: 'AbortError',
      input: { err: new DOMException('The user aborted a request.', 'AbortError') },
      expected: ErrorCode.ABORTED
    },
    {
      name: '500 Internal Error as Proxy Error',
      input: { err: '500 Internal Server Error', status: 500 },
      expected: ErrorCode.PROXY_ERROR
    },
    {
      name: 'Edge case: Mixed case ResourceExhausted',
      input: { err: 'Error: ResourceExhausted' },
      expected: ErrorCode.RATE_LIMIT
    }
  ];

  testCases.forEach(tc => {
    it(tc.name, () => {
      const appErr = AppError.from(tc.input.err, tc.input.status);
      expect(appErr.code).toBe(tc.expected);
    });
  });

  it('returns the same AppError instance and backfills status when provided', () => {
    const existing = new AppError('already wrapped', ErrorCode.UNKNOWN);

    const result = AppError.from(existing, 418);

    expect(result).toBe(existing);
    expect(result.status).toBe(418);
  });

  it('gives HTTP status precedence over conflicting message text', () => {
    expect(AppError.from(new Error('429 Too Many Requests'), 401).code).toBe(ErrorCode.INVALID_SETTINGS);
    expect(AppError.from('503 Service Unavailable', 400).code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('classifies 401/403 and 400 statuses directly', () => {
    expect(AppError.from('denied', 401).code).toBe(ErrorCode.INVALID_SETTINGS);
    expect(AppError.from('forbidden', 403).code).toBe(ErrorCode.INVALID_SETTINGS);
    expect(AppError.from('bad input', 400).code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('classifies plain objects with message fields and stack-only hints', () => {
    expect(AppError.from({ message: 'Permission_Denied from backend' }).code).toBe(ErrorCode.INVALID_SETTINGS);

    const genericError = new Error('Unexpected failure');
    genericError.stack = 'Error: Unexpected failure\n at callsite RESOURCE_EXHAUSTED';
    expect(AppError.from(genericError).code).toBe(ErrorCode.RATE_LIMIT);
  });

  it('falls back to unknown for unclassified inputs', () => {
    const fromNull = AppError.from(null);
    const fromObject = AppError.from({});

    expect(fromNull.code).toBe(ErrorCode.UNKNOWN);
    expect(fromObject.code).toBe(ErrorCode.UNKNOWN);
    expect(fromObject.message).toBe('An unexpected error occurred.');
  });

  it('classifies AbortError by name even without an aborted message', () => {
    const abortByName = new Error('Some generic failure');
    abortByName.name = 'AbortError';

    expect(AppError.from(abortByName).code).toBe(ErrorCode.ABORTED);
  });

  it('does not treat generic blocked messages as safety blocks', () => {
    expect(AppError.from('Proxy blocked upstream network route').code).toBe(ErrorCode.NETWORK_ERROR);
    expect(AppError.from('Access denied: blocked region').code).toBe(ErrorCode.UNKNOWN);
  });

  it('reports transient codes correctly', () => {
    expect(new AppError('rate', ErrorCode.RATE_LIMIT).isTransient()).toBe(true);
    expect(new AppError('overloaded', ErrorCode.SERVICE_OVERLOADED).isTransient()).toBe(true);
    expect(new AppError('network', ErrorCode.NETWORK_ERROR).isTransient()).toBe(true);
    expect(new AppError('proxy', ErrorCode.PROXY_ERROR).isTransient()).toBe(true);
    expect(new AppError('settings', ErrorCode.INVALID_SETTINGS).isTransient()).toBe(false);
    expect(new AppError('validation', ErrorCode.VALIDATION_ERROR).isTransient()).toBe(false);
    expect(new AppError('aborted', ErrorCode.ABORTED).isTransient()).toBe(false);
  });

  it('returns friendly messages for all error codes', () => {
    expect(new AppError('ignored', ErrorCode.RATE_LIMIT).toFriendlyMessage()).toBe('Too many requests (429). Please wait a moment and try again.');
    expect(new AppError('ignored', ErrorCode.SERVICE_OVERLOADED).toFriendlyMessage()).toBe('Service temporarily unavailable (503). Please try again later.');
    expect(new AppError('ignored', ErrorCode.SAFETY_BLOCK).toFriendlyMessage()).toBe('Response blocked due to safety settings.');
    expect(new AppError('ignored', ErrorCode.NETWORK_ERROR).toFriendlyMessage()).toBe('Network error. Please check your connection and try again.');
    expect(new AppError('Origin not allowed by proxy', ErrorCode.INVALID_SETTINGS).toFriendlyMessage()).toBe('Configuration error: Your browser origin is not allowed by the proxy.');
    expect(new AppError('bad key', ErrorCode.INVALID_SETTINGS).toFriendlyMessage()).toBe('Configuration error. Please check your API key or model settings.');
    expect(new AppError('Proxy exploded', ErrorCode.PROXY_ERROR).toFriendlyMessage()).toBe('Proxy exploded');
    expect(new AppError('ignored', ErrorCode.VALIDATION_ERROR).toFriendlyMessage()).toBe('Invalid request. Please check your prompt or model configuration.');
    expect(new AppError('ignored', ErrorCode.ABORTED).toFriendlyMessage()).toBe('Operation was cancelled.');
    expect(new AppError('custom unknown', ErrorCode.UNKNOWN).toFriendlyMessage()).toBe('custom unknown');
  });
});
