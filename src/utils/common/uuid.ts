/**
 * UUID v4 validation regex according to RFC 4122
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where y is one of [8, 9, a, b]
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a UUID v4 string.
 * 
 * @param uuid - String to validate
 * @returns true if valid UUID v4, false otherwise
 */
export const isValidUUID = (uuid: string): boolean => {
  return UUID_V4_REGEX.test(uuid);
};

/**
 * Generates a UUID v4 string with fallback for environments
 * where crypto.randomUUID() is not available.
 *
 * @returns A UUID v4 string in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * @throws Error if generated UUID is invalid (should never happen in practice)
 *
 * @remarks
 * - Uses crypto.randomUUID() when available (secure contexts, modern browsers)
 * - Falls back to Math.random() implementation for older browsers or non-HTTPS contexts
 * - The fallback provides sufficient randomness for client-side message IDs
 * - Generated UUIDs are validated to ensure correctness
 */
export const generateUUID = (): string => {
  let uuid: string;
  
  // Use native implementation if available (requires secure context)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    uuid = globalThis.crypto.randomUUID();
  } else {
    // Fallback implementation for non-secure contexts or older browsers
    // Based on RFC 4122 Section 4.4 (pseudo-random UUID)
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Validate generated UUID to ensure correctness
  if (!isValidUUID(uuid)) {
    throw new Error(
      `Generated invalid UUID: "${uuid}". ` +
      `This indicates a critical issue with UUID generation. ` +
      `Please report this error to support.`
    );
  }
  
  return uuid;
};
