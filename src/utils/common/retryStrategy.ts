import { AppError, ErrorCode } from '@/utils/errors/AppError';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  onRetry?: (error: AppError, attempt: number, delay: number) => void;
  shouldRetry?: (error: any) => boolean;
  signal?: AbortSignal;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 0,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  factor: 2,
};

/**
 * Executes a function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    if (opts.signal?.aborted) {
      throw new AppError('Aborted', ErrorCode.ABORTED);
    }

    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const appError = AppError.from(error);

      // Check if we should retry
      const isLastAttempt = attempt > opts.maxRetries;
      const shouldRetry = opts.shouldRetry 
        ? opts.shouldRetry(appError) 
        : appError.isTransient();

      if (isLastAttempt || !shouldRetry) {
        throw appError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.maxDelayMs,
        opts.initialDelayMs * Math.pow(opts.factor, attempt - 1)
      );

      if (opts.onRetry) {
        opts.onRetry(appError, attempt, delay);
      }

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          opts.signal?.removeEventListener('abort', onAbort);
          resolve();
        }, delay);

        const onAbort = () => {
          clearTimeout(timer);
          reject(new AppError('Aborted', ErrorCode.ABORTED));
        };

        opts.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  throw AppError.from(lastError);
}
