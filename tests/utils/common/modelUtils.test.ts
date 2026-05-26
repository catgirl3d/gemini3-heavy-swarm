import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isThinkingModel, getModelDisplayName } from '@/utils/common/modelUtils';
import { ProviderType } from '@/types';
import * as modelsCache from '@/services/openrouter/modelsCache';

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

  describe('getModelDisplayName', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return empty string for empty input', () => {
      expect(getModelDisplayName('')).toBe('');
      expect(getModelDisplayName('   ')).toBe('');
      expect(getModelDisplayName(null as any)).toBe('');
    });

    it('should return display name from MODEL_DISPLAY_NAMES if exists', () => {
      expect(getModelDisplayName('gemini-3-flash-preview')).toBe('Gemini 3 Flash');
      expect(getModelDisplayName('gemini-3.1-flash-lite')).toBe('Gemini 3.1 Flash-Lite');
      expect(getModelDisplayName('gemini-3.5-flash')).toBe('Gemini 3.5 Flash');
      expect(getModelDisplayName('gemini-3.1-pro-preview')).toBe('Gemini 3.1 Pro');
    });

    it('should handle provider/model format with beautification', () => {
      expect(getModelDisplayName('anthropic/claude-3-opus')).toBe('Claude 3 Opus');
      expect(getModelDisplayName('openai/gpt-4o')).toBe('Gpt 4o');
    });

    it('should beautify technical IDs', () => {
      expect(getModelDisplayName('unknown-model-id')).toBe('Unknown Model Id');
      expect(getModelDisplayName('very_technical_name')).toBe('Very Technical Name');
      expect(getModelDisplayName('gemini:free')).toBe('Gemini Free');
    });

    it('should handle multiple slashes and beautify the result', () => {
      expect(getModelDisplayName('provider/subprovider/model-name-here')).toBe('Model Name Here');
    });

    it('should strip provider prefix with colon and space from cache', () => {
      // Mock cache to return a pretty name with a colon
      vi.spyOn(modelsCache, 'getCachedModels').mockReturnValue([
        { value: 'anthropic/claude-3-opus', label: 'Anthropic: Claude 3 Opus' }
      ]);
      
      expect(getModelDisplayName('anthropic/claude-3-opus')).toBe('Claude 3 Opus');
    });

    it('should beautify technical IDs even with colons', () => {
      // Ensure cache is empty
      vi.spyOn(modelsCache, 'getCachedModels').mockReturnValue(null);
      
      expect(getModelDisplayName('anthropic/claude-3:stable')).toBe('Claude 3 Stable');
      expect(getModelDisplayName('gemini-3:free')).toBe('Gemini 3 Free');
    });

    it('should handle short option by stripping Swarm suffix', () => {
      // From constants
      expect(getModelDisplayName('gemini-3-flash-preview', { short: true })).toBe('Gemini 3 Flash');
      // From ID (beautified)
      expect(getModelDisplayName('my-custom-model-swarm Swarm', { short: true })).toBe('My Custom Model Swarm');
    });

    it('should handle withSwarmSuffix option with beautification', () => {
      // From constants (suffix added dynamically)
      expect(getModelDisplayName('gemini-3-flash-preview', { withSwarmSuffix: true })).toBe('Gemini 3 Flash Swarm');
      // Doesn't have suffix (from ID)
      expect(getModelDisplayName('anthropic/claude-3', { withSwarmSuffix: true })).toBe('Claude 3 Swarm');
      // Doesn't have suffix (custom)
      expect(getModelDisplayName('custom-model', { withSwarmSuffix: true })).toBe('Custom Model Swarm');
    });
  });
});
