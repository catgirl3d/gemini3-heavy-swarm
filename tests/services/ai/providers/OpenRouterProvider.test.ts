import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from '@/services/ai/providers/OpenRouterProvider';
import { AppSettings } from '@/types';

// Mock OpenRouterGenAI
const mockGenerateContentStream = vi.fn();
vi.mock('@/services/openrouter/OpenRouterGenAI', () => ({
  OpenRouterGenAI: class {
    models = {
      generateContentStream: mockGenerateContentStream
    };
  }
}));

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenRouterProvider({ model: 'anthropic/claude-3-opus' });
  });

  it('should have correct name and capabilities', () => {
    expect(provider.name).toBe('openrouter');
    expect(provider.capabilities).toEqual({
      search: false,
      vision: false,
      reasoning: true,
      codeExecution: false,
    });
  });

  it('should disable search in getEffectiveSettings', () => {
    const settings = { 
      useSearchInInitial: true,
      useSearchInRefinement: true,
      useSearchInSynthesis: true,
    } as AppSettings;
    
    const effective = provider.getEffectiveSettings(settings);
    
    expect(effective.useSearchInInitial).toBe(false);
    expect(effective.useSearchInRefinement).toBe(false);
    expect(effective.useSearchInSynthesis).toBe(false);
  });

  it('should return settings.openRouterModel in getDefaultModel', () => {
    const settings = { openRouterModel: 'openai/gpt-4-turbo' } as AppSettings;
    expect(provider.getDefaultModel(settings)).toBe('openai/gpt-4-turbo');
  });

  it('should normalize chunks correctly during streaming', async () => {
    const mockChunk = { 
        text: vi.fn(() => 'openrouter text'),
        thought: 'thinking...',
        usageMetadata: { 
          totalTokenCount: 15,
          promptTokenCount: 8,
          candidatesTokenCount: 7,
          thoughtsTokenCount: 2
        }
    };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream: mockAsyncIterable
    });

    const result = await provider.models.generateContentStream({
      model: 'or-model',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(mockChunk.text).toHaveBeenCalled();
    expect(chunks[0]).toEqual({
      text: 'openrouter text',
      thought: 'thinking...',
      usage: {
        totalTokens: 15,
        promptTokens: 8,
        candidatesTokens: 7,
        thoughtsTokenCount: 2,
        cachedContentTokenCount: undefined,
        toolUsePromptTokenCount: undefined
      },
      groundingChunks: undefined,
      raw: mockChunk
    });
  });

  it('should handle empty stream correctly', async () => {
    const mockAsyncIterable = (async function* () {
      // Empty stream
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream: mockAsyncIterable
    });

    const result = await provider.models.generateContentStream({
      model: 'or-model',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it('should handle chunks with missing usageMetadata', async () => {
    const mockChunk = { 
      text: vi.fn(() => 'text without usage'),
      thought: '',
      usageMetadata: null
    };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream: mockAsyncIterable
    });

    const result = await provider.models.generateContentStream({
      model: 'or-model',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].usage).toBeNull();
    expect(chunks[0].text).toBe('text without usage');
  });

  it('should handle chunk without text function', async () => {
    const mockChunk = { 
      text: 'plain string',
      thought: 'thinking',
      usageMetadata: { totalTokenCount: 5 }
    };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream: mockAsyncIterable
    });

    const result = await provider.models.generateContentStream({
      model: 'or-model',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(''); // When text is not a function, normalizeChunk returns empty string
  });

  it('should propagate errors from generateContentStream', async () => {
    const testError = new Error('OpenRouter API error');
    mockGenerateContentStream.mockRejectedValue(testError);

    await expect(
      provider.models.generateContentStream({
        model: 'or-model',
        contents: []
      })
    ).rejects.toThrow('OpenRouter API error');
  });
});
