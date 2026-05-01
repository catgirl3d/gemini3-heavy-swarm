import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUUID, isValidUUID } from '@/utils/common/uuid';

const VALID_UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('uuid utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('isValidUUID', () => {
    it('accepts valid UUID v4 values', () => {
      expect(isValidUUID(VALID_UUID)).toBe(true);
      expect(isValidUUID('123E4567-E89B-42D3-B456-426614174000')).toBe(true);
    });

    it('rejects invalid UUID values', () => {
      const invalidValues = [
        '',
        'not-a-uuid',
        '123e4567-e89b-12d3-a456-426614174000',
        '123e4567-e89b-42d3-c456-426614174000',
        '123e4567-e89b-42d3-a456',
        '123e4567-e89b-42d3-a456-426614174000-extra',
      ];

      invalidValues.forEach((uuid) => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });
  });

  describe('generateUUID', () => {
    it('uses native crypto.randomUUID when available', () => {
      const randomUUID = vi.fn(() => VALID_UUID);
      vi.stubGlobal('crypto', { randomUUID });

      expect(generateUUID()).toBe(VALID_UUID);
      expect(randomUUID).toHaveBeenCalledTimes(1);
    });

    it('throws when native crypto.randomUUID returns an invalid value', () => {
      vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'invalid') });

      expect(() => generateUUID()).toThrow(/Generated invalid UUID/);
    });

    it('falls back when crypto is missing', () => {
      vi.stubGlobal('crypto', undefined);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const uuid = generateUUID();

      expect(uuid).toBe('00000000-0000-4000-8000-000000000000');
      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid[14]).toBe('4');
      expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
    });

    it('falls back when randomUUID is unavailable', () => {
      vi.stubGlobal('crypto', {});
      vi.spyOn(Math, 'random').mockReturnValue(0.999999);

      const uuid = generateUUID();

      expect(isValidUUID(uuid)).toBe(true);
      expect(uuid[14]).toBe('4');
      expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
    });

    it('throws when fallback generation produces an invalid UUID', () => {
      vi.stubGlobal('crypto', undefined);
      vi.spyOn(Math, 'random').mockReturnValue(1);

      expect(() => generateUUID()).toThrow(/Generated invalid UUID/);
    });
  });
});
