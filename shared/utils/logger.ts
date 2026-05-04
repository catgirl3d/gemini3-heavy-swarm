/**
 * Simple Logger class for unified logging.
 * Prefixes messages with a context and handles different log levels.
 */
export class Logger {
  static globalDebugMode = false;

  constructor(
    private context: string,
    private debugMode: boolean = false
  ) {}

  private shouldLog(): boolean {
    return this.debugMode || Logger.globalDebugMode;
  }

  /**
   * Logs a debug message with optional data.
   */
  debug(message: string, data?: unknown) {
    if (this.shouldLog()) {
      console.log(`[DEBUG:${this.context}] ${message}`, data ?? '');
    }
  }

  /**
   * Logs an error message.
   * Note: Errors are always logged to console.error regardless of debugMode
   * as they represent critical failures.
   */
  error(message: string, error?: unknown) {
    console.error(`[ERROR:${this.context}] ${message}`, error ?? '');
  }

  /**
   * Logs an info message.
   * Note: Info messages are always logged as they represent important operational information.
   */
  info(message: string, data?: unknown) {
    console.log(`[INFO:${this.context}] ${message}`, data ?? '');
  }

  /**
   * Logs a warning message.
   * Note: Warnings are always logged as they represent important issues that should not be ignored.
   */
  warn(message: string, data?: unknown) {
    console.warn(`[WARN:${this.context}] ${message}`, data ?? '');
  }
}
