import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '@/services/ai/providers/GeminiProvider';
import { AppSettings, ProviderType } from '@/types';

// Mock streamUtils
vi.mock('@/services/swarm/steps/utils/streamUtils', () => ({
  extractPartsFromChunk: vi.fn(),
  extractUsageMetadataFromChunk: vi.fn(),
  extractGroundingChunksFromChunk: vi.fn(),
  extractTokenUsage: vi.fn(),
  extractTextFromParts: vi.fn(),
}));

import { 
  extractPartsFromChunk, 
  extractUsageMetadataFromChunk, 
  extractGroundingChunksFromChunk, 
  extractTokenUsage, 
  extractTextFromParts 
} from '@/services/swarm/steps/utils/streamUtils';

// Mock GoogleGenAI
const mockGenerateContentStream = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: mockGenerateContentStream
    };
  }
}));

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider(mockApiKey);
  });

  it('should have correct name and capabilities', () => {
    expect(provider.name).toBe(ProviderType.Gemini);
    expect(provider.capabilities).toEqual({
      search: true,
      vision: true,
      reasoning: true,
      codeExecution: true,
    });
  });

  it('should return settings.geminiModel in getDefaultModel', () => {
    const settings = { geminiModel: 'gemini-1.5-flash' } as AppSettings;
    expect(provider.getDefaultModel(settings)).toBe('gemini-1.5-flash');
  });

  it('should return settings unchanged in getEffectiveSettings', () => {
    const settings = { 
      geminiModel: 'gemini-1.5-flash',
      useSearchInInitial: true,
      useSearchInRefinement: false
    } as AppSettings;
    const effective = provider.getEffectiveSettings(settings);
    expect(effective).toBe(settings);
    expect(effective.useSearchInInitial).toBe(true);
    expect(effective.useSearchInRefinement).toBe(false);
  });

  it('should normalize chunks correctly during streaming', async () => {
    const mockChunk = { some: 'raw-data' };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue(mockAsyncIterable);


    (extractPartsFromChunk as any).mockReturnValue([{ text: 'hello' }]);
    (extractUsageMetadataFromChunk as any).mockReturnValue({ totalTokenCount: 10 });
    (extractGroundingChunksFromChunk as any).mockReturnValue([]);
    (extractTextFromParts as any).mockReturnValue({ text: 'hello', thought: '' });
    (extractTokenUsage as any).mockReturnValue({ totalTokens: 10, promptTokens: 5, candidatesTokens: 5 });

    // Ensure the provider initializes the model correctly
    const result = await provider.models.generateContentStream({
      model: 'gemini-pro',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      text: 'hello',
      thought: '',
      usage: { totalTokens: 10, promptTokens: 5, candidatesTokens: 5 },
      groundingChunks: [],
      raw: mockChunk
    });
    
    expect(extractPartsFromChunk).toHaveBeenCalledWith(mockChunk);
  });

  it('should handle empty stream correctly', async () => {
    const mockAsyncIterable = (async function* () {
      // Empty stream
    })();

    mockGenerateContentStream.mockResolvedValue(mockAsyncIterable);

    const result = await provider.models.generateContentStream({
      model: 'gemini-pro',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it('should handle chunks with missing metadata gracefully', async () => {
    const mockChunk = { minimal: 'data' };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue(mockAsyncIterable);

    (extractPartsFromChunk as any).mockReturnValue([]);
    (extractUsageMetadataFromChunk as any).mockReturnValue(undefined);
    (extractGroundingChunksFromChunk as any).mockReturnValue(undefined);
    (extractTextFromParts as any).mockReturnValue({ text: '', thought: '' });
    (extractTokenUsage as any).mockReturnValue(null);

    const result = await provider.models.generateContentStream({
      model: 'gemini-pro',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      text: '',
      thought: '',
      usage: null,
      groundingChunks: undefined,
      raw: mockChunk
    });
  });

  it('should propagate errors from generateContentStream', async () => {
    const testError = new Error('Gemini API error');
    mockGenerateContentStream.mockRejectedValue(testError);

    await expect(
      provider.models.generateContentStream({
        model: 'gemini-pro',
        contents: []
      })
    ).rejects.toThrow('Gemini API error');
  });
});
