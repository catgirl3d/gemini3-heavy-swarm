/**
 * Simple Logger class for unified logging.
 * Prefixes messages with a context and handles different log levels.
 */
export class Logger {
  constructor(
    private context: string,
    private debugMode: boolean = false
  ) {}

  /**
   * Logs a debug message with optional data.
   */
  debug(message: string, data?: any) {
    if (this.debugMode) {
      console.log(`[DEBUG:${this.context}] ${message}`, data ?? '');
    }
  }

  /**
   * Logs an error message regardless of debugMode.
   */
  error(message: string, error?: any) {
    console.error(`[ERROR:${this.context}] ${message}`, error ?? '');
  }

  /**
   * Logs an info message regardless of debugMode.
   */
  info(message: string, data?: any) {
    console.log(`[INFO:${this.context}] ${message}`, data ?? '');
  }

  /**
   * Logs a warning message regardless of debugMode.
   */
  warn(message: string, data?: any) {
    console.warn(`[WARN:${this.context}] ${message}`, data ?? '');
  }
}
