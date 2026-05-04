import { describe, expect, it, vi } from 'vitest';
import { getGenerationConfig } from '@/services/proxy/geminiConfig';
import { MAX_OUTPUT_TOKENS_LIMIT, MIN_OUTPUT_TOKENS_FOR_THINKING } from '@/constants';

const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = loggerWarnMock;
    error = vi.fn();
  },
}));

describe('getGenerationConfig', () => {
  it('uses default temperature and no thinking config for non-thinking models', () => {
    const config = getGenerationConfig('gemini-1.5-flash', undefined, 2048);

    expect(config).toEqual({
      maxOutputTokens: 2048,
      temperature: 0.7,
    });
  });

  it('uses caller temperature for non-thinking models', () => {
    const config = getGenerationConfig('gemini-1.5-pro', 0.2, 1024);

    expect(config.temperature).toBe(0.2);
    expect(config.thinkingConfig).toBeUndefined();
  });

  it('configures Gemini 3 thinking level and omits temperature by default', () => {
    const config = getGenerationConfig('gemini-3-pro', 0.2, MIN_OUTPUT_TOKENS_FOR_THINKING + 1);

    expect(config).toEqual({
      maxOutputTokens: MIN_OUTPUT_TOKENS_FOR_THINKING + 1,
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'high',
      },
    });
  });

  it('allows unsafe caller temperature for Gemini 3 when explicitly enabled', () => {
    const config = getGenerationConfig('gemini-3-flash', 0.4, MIN_OUTPUT_TOKENS_FOR_THINKING, true);

    expect(config.temperature).toBe(0.4);
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'high',
    });
  });

  it('does not add unsafe Gemini 3 temperature when no user temperature is provided', () => {
    const config = getGenerationConfig('gemini-3-pro', undefined, MIN_OUTPUT_TOKENS_FOR_THINKING, true);

    expect(config.temperature).toBeUndefined();
  });

  it('enforces minimum output tokens for thinking models', () => {
    loggerWarnMock.mockClear();

    const config = getGenerationConfig('gemini-2.0-flash-thinking', 0.6, 1024);

    expect(config.maxOutputTokens).toBe(MIN_OUTPUT_TOKENS_FOR_THINKING);
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining('requires minimum'));
  });

  it('configures legacy thinking models with thinking budget and default temperature', () => {
    const config = getGenerationConfig('gemini-2.5-flash-thinking', undefined, MIN_OUTPUT_TOKENS_FOR_THINKING);

    expect(config).toEqual({
      maxOutputTokens: MIN_OUTPUT_TOKENS_FOR_THINKING,
      temperature: 0.7,
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 16000,
      },
    });
  });

  it('uses default max output tokens when caller does not provide a token limit', () => {
    const config = getGenerationConfig('gemini-1.5-flash', 0.3);

    expect(config.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_LIMIT);
    expect(config.temperature).toBe(0.3);
  });
});
