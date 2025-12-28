import { describe, it, expect } from 'vitest';
import { validateContents, validateContentSize, getTargetModel, buildGeminiUrl } from '@shared/validation/geminiValidation';

describe('geminiValidation', () => {
  describe('validateContents', () => {
    it('should validate correctly structured contents', () => {
      const contents = [{ parts: [{ text: 'hello' }] }];
      expect(validateContents(contents).valid).toBe(true);
    });

    it('should fail on empty contents', () => {
      expect(validateContents([]).valid).toBe(false);
      expect(validateContents(null).valid).toBe(false);
    });

    it('should fail on missing parts', () => {
      const contents = [{ text: 'hello' }];
      // @ts-ignore
      expect(validateContents(contents).valid).toBe(false);
    });
  });

  describe('validateContentSize', () => {
    it('should pass for small content', () => {
      const contents = [{ parts: [{ text: 'small' }] }];
      expect(validateContentSize(contents, 100).valid).toBe(true);
    });

    it('should fail for oversized content', () => {
      const contents = [{ parts: [{ text: 'a'.repeat(200) }] }];
      const result = validateContentSize(contents, 100);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(413);
    });
  });

  describe('getTargetModel', () => {
    it('should return flash-lite in public mode by default', () => {
      expect(getTargetModel('gemini-1.5-pro', false)).toBe('gemini-2.5-flash-lite');
    });

    it('should respect requested model in private mode', () => {
      expect(getTargetModel('gemini-1.5-pro', true)).toBe('gemini-1.5-pro');
    });
  });

  describe('buildGeminiUrl', () => {
    it('should construct correct streaming URL', () => {
      expect(buildGeminiUrl('test-model')).toContain('test-model:streamGenerateContent');
    });
  });
});
