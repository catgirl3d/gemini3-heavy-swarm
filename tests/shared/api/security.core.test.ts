import { describe, it, expect, vi } from 'vitest';
import { validateApiSecret } from '@shared/api/security.core';

describe('security.core', () => {
  describe('validateApiSecret', () => {
    it('should return valid true when secrets match', () => {
      const result = validateApiSecret('secret123', 'secret123');
      expect(result.valid).toBe(true);
    });

    it('should return valid false when secrets do not match', () => {
      const result = validateApiSecret('wrong', 'secret123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or missing API secret');
    });

    it('should return server error when env secret is missing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = validateApiSecret('any', undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should return valid false when header secret is null', () => {
      const result = validateApiSecret(null, 'secret123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or missing API secret');
    });
  });
});
