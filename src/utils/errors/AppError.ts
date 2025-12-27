export enum ErrorCode {
  RATE_LIMIT = 'RATE_LIMIT',
  SERVICE_OVERLOADED = 'SERVICE_OVERLOADED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_SETTINGS = 'INVALID_SETTINGS',
  PROXY_ERROR = 'PROXY_ERROR',
  SAFETY_BLOCK = 'SAFETY_BLOCK',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  ABORTED = 'ABORTED',
  UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
  public code: ErrorCode;
  public details?: unknown;
  public status?: number;

  constructor(message: string, code: ErrorCode = ErrorCode.UNKNOWN, details?: unknown, status?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.status = status;

    // Standard behavior for Error subclasses
    Object.setPrototypeOf(this, AppError.prototype);
  }

  public isTransient(): boolean {
    return [
      ErrorCode.RATE_LIMIT,
      ErrorCode.SERVICE_OVERLOADED,
      ErrorCode.NETWORK_ERROR,
      ErrorCode.PROXY_ERROR,
    ].includes(this.code);
  }

  public toFriendlyMessage(): string {
    switch (this.code) {
      case ErrorCode.RATE_LIMIT:
        return 'Too many requests (429). Please wait a moment and try again.';
      case ErrorCode.SERVICE_OVERLOADED:
        return 'Service temporarily unavailable (503). Please try again later.';
      case ErrorCode.SAFETY_BLOCK:
        return 'Response blocked due to safety settings.';
      case ErrorCode.NETWORK_ERROR:
        return 'Network error. Please check your connection and try again.';
      case ErrorCode.INVALID_SETTINGS:
        if (this.message.includes('Origin not allowed')) {
          return 'Configuration error: Your browser origin is not allowed by the proxy.';
        }
        return 'Configuration error. Please check your API key or model settings.';
      case ErrorCode.PROXY_ERROR:
        return this.message || 'The proxy encountered an error. Please try again later.';
      case ErrorCode.VALIDATION_ERROR:
        return 'Invalid request. Please check your prompt or model configuration.';
      case ErrorCode.ABORTED:
        return 'Operation was cancelled.';
      default:
        return this.message || 'An unexpected error occurred.';
    }
  }

  /**
   * Universal error classifier that takes an error object and an optional HTTP status code.
   * Centralizes error mapping logic to avoid duplication across the app.
   */
  public static from(error: unknown, status?: number): AppError {
    if (error instanceof AppError) {
      if (status !== undefined && error.status === undefined) {
        error.status = status;
      }
      return error;
    }

    let code: ErrorCode | null = null;
    let message = 'An unexpected error occurred.';

    // 1. Classify by HTTP status code (highest precision)
    if (status !== undefined) {
      if (status === 429) code = ErrorCode.RATE_LIMIT;
      else if (status === 503) code = ErrorCode.SERVICE_OVERLOADED;
      else if (status === 401 || status === 403) code = ErrorCode.INVALID_SETTINGS;
      else if (status === 400) code = ErrorCode.VALIDATION_ERROR;
      else if (status >= 500) code = ErrorCode.PROXY_ERROR;
    }

    // Classification logic by string pattern
    const classify = (source: string): ErrorCode | null => {
      const s = source.toLowerCase();
      
      // 429 - Rate Limit / Resource Exhausted
      if (
        s.includes('429') || 
        s.includes('rate limit') || 
        s.includes('resource_exhausted') || 
        s.includes('resourceexhausted') || 
        s.includes('quota') ||
        s.includes('limit exceeded')
      ) {
        return ErrorCode.RATE_LIMIT;
      }
      
      // 503 - Service Overloaded / Unavailable
      if (
        s.includes('503') || 
        s.includes('overloaded') || 
        s.includes('transient') || 
        s.includes('unavailable') ||
        s.includes('service_unavailable')
      ) {
        return ErrorCode.SERVICE_OVERLOADED;
      }

      // Safety blocks
      if (s.includes('safety') || s.includes('finish_reason_safety') || s.includes('blocked')) {
        return ErrorCode.SAFETY_BLOCK;
      }
      
      // Network issues
      if (s.includes('network') || s.includes('failed to fetch') || s.includes('econnrefused')) {
        return ErrorCode.NETWORK_ERROR;
      }
      
      // 401/403 - Invalid Credentials
      if (s.includes('401') || s.includes('403') || s.includes('invalid api key') || s.includes('permission_denied')) {
        return ErrorCode.INVALID_SETTINGS;
      }
      
      // 400 - Validation/Bad Request
      if (s.includes('400') || s.includes('invalid argument') || s.includes('bad request')) {
        return ErrorCode.VALIDATION_ERROR;
      }
      
      // Timeouts
      if (s.includes('timeout') || s.includes('deadline_exceeded')) {
        return ErrorCode.NETWORK_ERROR;
      }
      
      if (s.includes('aborted')) {
        return ErrorCode.ABORTED;
      }
      
      return null;
    };

    // 2. Classify by Error object details or string message
    if (error instanceof Error) {
      message = error.message;
      if (!code) {
        code = classify(message) || (error.name === 'AbortError' ? ErrorCode.ABORTED : null) || classify(error.stack || '');
      }
    } else if (typeof error === 'string') {
      message = error;
      if (!code) {
        code = classify(message);
      }
    }

    return new AppError(message, code || ErrorCode.UNKNOWN, error, status);
  }
}
