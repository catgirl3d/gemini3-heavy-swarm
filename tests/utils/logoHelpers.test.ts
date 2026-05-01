import { describe, expect, it } from 'vitest';
import geminiIcon from '@/assets/Google-gemini-icon.webp';
import openRouterLogo from '@/assets/openrouter.svg';
import openaiLogo from '@/assets/openai.webp';
import anthropicLogo from '@/assets/anthropic.svg';
import claudeLogo from '@/assets/claude-color.webp';
import deepseekLogo from '@/assets/deepseek-color.svg';
import grokLogo from '@/assets/grok.webp';
import mistralLogo from '@/assets/mistral-color.svg';
import qwenLogo from '@/assets/qwen-color.svg';
import metaLogo from '@/assets/meta-color.svg';
import minimaxLogo from '@/assets/minimax-color.webp';
import perplexityLogo from '@/assets/perplexity-color.svg';
import zaiLogo from '@/assets/zai.svg';
import { getProviderLogo } from '@/utils/logoHelpers';
import { ProviderType } from '@/types';

describe('getProviderLogo', () => {
  it('returns the Gemini icon for Gemini provider regardless of model', () => {
    expect(getProviderLogo(ProviderType.Gemini)).toBe(geminiIcon);
    expect(getProviderLogo(ProviderType.Gemini, 'openai/gpt-4o')).toBe(geminiIcon);
  });

  it('returns the OpenRouter logo when OpenRouter has no model', () => {
    expect(getProviderLogo(ProviderType.OpenRouter)).toBe(openRouterLogo);
  });

  it.each([
    ['google/gemini-pro', geminiIcon],
    ['openai/gpt-4o', openaiLogo],
    ['anthropic/claude-3.5-sonnet', claudeLogo],
    ['anthropic/messages-api', anthropicLogo],
    ['deepseek/deepseek-chat', deepseekLogo],
    ['deepseek/r1', deepseekLogo],
    ['meta-llama/llama-3.1', metaLogo],
    ['x-ai/grok-4', grokLogo],
    ['mistralai/mixtral-8x7b', mistralLogo],
    ['qwen/qwen3', qwenLogo],
    ['minimax/minimax-01', minimaxLogo],
    ['perplexity/sonar', perplexityLogo],
    ['z-ai/glm-4.5', zaiLogo],
  ])('maps OpenRouter model %s to its provider logo', (model, expectedLogo) => {
    expect(getProviderLogo(ProviderType.OpenRouter, model)).toBe(expectedLogo);
  });

  it('falls back to OpenRouter logo for unknown OpenRouter models', () => {
    expect(getProviderLogo(ProviderType.OpenRouter, 'unknown/provider-model')).toBe(openRouterLogo);
  });

  it('matches OpenRouter model families case-insensitively', () => {
    expect(getProviderLogo(ProviderType.OpenRouter, 'Google/GEMINI-Pro')).toBe(geminiIcon);
    expect(getProviderLogo(ProviderType.OpenRouter, 'OPENAI/GPT-4O')).toBe(openaiLogo);
  });
});
