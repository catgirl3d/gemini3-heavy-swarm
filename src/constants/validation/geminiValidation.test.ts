import { describe, it, expect } from 'vitest';
import { 
  validateContents, 
  validateContentSize, 
  getTargetModel, 
  buildGeminiUrl 
} from './geminiValidation';

describe('geminiValidation', () => {
  describe('validateContents', () => {
    it('should fail for empty or missing contents', () => {
      expect(validateContents(undefined).valid).toBe(false);
      expect(validateContents([]).valid).toBe(false);
      expect(validateContents(null).valid).toBe(false);
    });

    it('should fail if any item is missing parts or parts is empty', () => {
      const invalid = [
        { role: 'user' }, // missing parts
        { role: 'user', parts: [] } // empty parts
      ];
      expect(validateContents(invalid).valid).toBe(false);
    });

    it('should succeed for valid contents', () => {
      const valid = [
        { role: 'user', parts: [{ text: 'hi' }] }
      ];
      expect(validateContents(valid).valid).toBe(true);
    });
  });

  describe('validateContentSize', () => {
    it('should succeed if under limit', () => {
      const contents = [{ parts: [{ text: 'small' }] }];
      expect(validateContentSize(contents, 100).valid).toBe(true);
    });

    it('should fail if over limit', () => {
      const contents = [{ parts: [{ text: 'large content' }] }];
      const result = validateContentSize(contents, 10);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(413);
    });

    it('should handle non-serializable objects', () => {
      const circular = {};
      circular.self = circular;
      const result = validateContentSize(circular, 100);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('getTargetModel', () => {
    const defaultModel = 'gemini-2.5-flash-lite';

    it('should return default model in demo mode (not private)', () => {
      expect(getTargetModel('some-model', false)).toBe(defaultModel);
      expect(getTargetModel(undefined, false)).toBe(defaultModel);
    });

    it('should return requested model in private mode', () => {
      expect(getTargetModel('gemini-pro', true)).toBe('gemini-pro');
    });

    it('should return default model in private mode if none requested', () => {
      expect(getTargetModel(undefined, true)).toBe(defaultModel);
    });
  });

  describe('buildGeminiUrl', () => {
    it('should format the URL correctly', () => {
      expect(buildGeminiUrl('my-model'))
        .toBe('https://generativelanguage.googleapis.com/v1beta/models/my-model:streamGenerateContent');
    });
  });
});
