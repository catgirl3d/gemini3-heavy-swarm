import { describe, it, expect } from 'vitest';
import { isThinkingModel } from '@/utils/common/modelUtils';
import { ProviderType } from '@/types';

describe('modelUtils', () => {
  describe('isThinkingModel', () => {
    it('should identify Gemini 3 models as thinking', () => {
      expect(isThinkingModel(ProviderType.Gemini, 'gemini-3-flash-preview')).toBe(true);
      expect(isThinkingModel(ProviderType.Gemini, 'gemini-3-pro-preview')).toBe(true);
    });

    it('should identify Gemini models with "thinking" in name as thinking', () => {
      expect(isThinkingModel(ProviderType.Gemini, 'gemini-2.0-flash-thinking-exp')).toBe(true);
    });

    it('should not identify other Gemini models as thinking', () => {
      expect(isThinkingModel(ProviderType.Gemini, 'gemini-2.5-flash')).toBe(false);
      expect(isThinkingModel(ProviderType.Gemini, 'gemini-1.5-pro')).toBe(false);
    });

    it('should identify OpenRouter models with "thinking" in name as thinking (fallback)', () => {
      expect(isThinkingModel(ProviderType.OpenRouter, 'google/gemini-2.0-flash-thinking-exp:free')).toBe(true);
    });

    it('should identify OpenRouter models by metadata (supported_parameters)', () => {
      const mockModels = [
        { value: 'model-1', label: 'Model 1', supportsReasoning: true },
        { value: 'model-2', label: 'Model 2', supportsReasoning: false }
      ];
      expect(isThinkingModel(ProviderType.OpenRouter, 'model-1', mockModels)).toBe(true);
      expect(isThinkingModel(ProviderType.OpenRouter, 'model-2', mockModels)).toBe(false);
    });

    it('should prioritize metadata over name for OpenRouter', () => {
      const mockModels = [
        { value: 'thinking-model-but-no-reasoning', label: 'Thinking Model', supportsReasoning: false }
      ];
      // Even if it has "thinking" in name, if metadata says no reasoning, it's false
      expect(isThinkingModel(ProviderType.OpenRouter, 'thinking-model-but-no-reasoning', mockModels)).toBe(false);
    });

    it('should return false for unknown providers or empty models', () => {
      expect(isThinkingModel('unknown' as any, 'some-model')).toBe(false);
      expect(isThinkingModel(ProviderType.OpenRouter, '')).toBe(false);
    });
  });
});
