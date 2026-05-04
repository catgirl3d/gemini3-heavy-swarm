/**
 * Result type for update operations that can fail silently.
 * Allows callers to check if update succeeded and react accordingly.
 */
export interface UpdateResult<T> {
  /** Updated settings (or original if update failed) */
  settings: T;
  /** Whether the update succeeded */
  success: boolean;
  /** Error message if update failed */
  error?: string;
}
