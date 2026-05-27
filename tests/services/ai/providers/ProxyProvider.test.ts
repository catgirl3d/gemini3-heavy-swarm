import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProxyProvider } from '@/services/ai/providers/ProxyProvider';
import { AppSettings } from '@/types';

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

// Mock ProxyGenAI
const mockGenerateContentStream = vi.fn();
vi.mock('@/services/proxy/ProxyGenAI', () => ({
  ProxyGenAI: class {
    models = {
      generateContentStream: mockGenerateContentStream
    };
  }
}));

describe('ProxyProvider', () => {
  let provider: ProxyProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ProxyProvider();
  });

  it('should have correct name and capabilities', () => {
    expect(provider.name).toBe('proxy');
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
      useSearchInInitial: true 
    } as AppSettings;
    const effective = provider.getEffectiveSettings(settings);
    expect(effective).toBe(settings);
  });

  it('should normalize chunks correctly during streaming', async () => {
    const mockChunk = { some: 'proxy-data' };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream: mockAsyncIterable
    });

    (extractPartsFromChunk as any).mockReturnValue([{ text: 'proxy text' }]);
    (extractUsageMetadataFromChunk as any).mockReturnValue({ totalTokenCount: 5 });
    (extractTextFromParts as any).mockReturnValue({ text: 'proxy text', thought: '' });
    (extractTokenUsage as any).mockReturnValue({ totalTokens: 5, promptTokens: 3, candidatesTokens: 2 });

    const result = await provider.models.generateContentStream({
      model: 'proxy-model',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      text: 'proxy text',
      thought: '',
      usage: { totalTokens: 5, promptTokens: 3, candidatesTokens: 2 },
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
      model: 'proxy-model',
      contents: []
    });

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it('should handle chunks with missing metadata gracefully', async () => {
    const mockChunk = { some: 'proxy-data' };
    const mockAsyncIterable = (async function* () {
      yield mockChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream: mockAsyncIterable
    });

    (extractPartsFromChunk as any).mockReturnValue([]);
    (extractUsageMetadataFromChunk as any).mockReturnValue(null);
    (extractGroundingChunksFromChunk as any).mockReturnValue(undefined);
    (extractTextFromParts as any).mockReturnValue({ text: '', thought: '' });
    (extractTokenUsage as any).mockReturnValue(null);

    const result = await provider.models.generateContentStream({
      model: 'proxy-model',
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
    const testError = new Error('Stream generation failed');
    mockGenerateContentStream.mockRejectedValue(testError);

    await expect(
      provider.models.generateContentStream({
        model: 'proxy-model',
        contents: []
      })
    ).rejects.toThrow('Stream generation failed');
  });
});
