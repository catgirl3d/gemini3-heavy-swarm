/**
 * Generates a UUID v4 string with fallback for environments
 * where crypto.randomUUID() is not available.
 * 
 * @returns A UUID v4 string in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * 
 * @remarks
 * - Uses crypto.randomUUID() when available (secure contexts, modern browsers)
 * - Falls back to Math.random() implementation for older browsers or non-HTTPS contexts
 * - The fallback provides sufficient randomness for client-side message IDs
 */
export function generateUUID(): string {
  // Use native implementation if available (requires secure context)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback implementation for non-secure contexts or older browsers
  // Based on RFC 4122 Section 4.4 (pseudo-random UUID)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
