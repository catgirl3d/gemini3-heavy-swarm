import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyProvider } from '@/services/ai/providers/ProxyProvider';
import type { AppSettings } from '@/types';

const mockGenerateContentStream = vi.fn();

vi.mock('@/services/proxy/ProxyGenAI', () => ({
  ProxyGenAI: class {
    models = {
      generateContentStream: mockGenerateContentStream,
    };
  }
}));

const consumeStream = async (stream: AsyncIterable<unknown>) => {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
};

describe('ProxyProvider normalization', () => {
  let provider: ProxyProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ProxyProvider();
  });

  it('exposes the proxy provider identity and settings contract', () => {
    expect(provider.name).toBe('proxy');
    expect(provider.isProxy).toBe(true);
    expect(provider.capabilities).toEqual({
      search: true,
      vision: true,
      reasoning: true,
      codeExecution: true,
    });

    const settings = { geminiModel: 'gemini-2.5-flash' } as AppSettings;
    expect(provider.getDefaultModel(settings)).toBe('gemini-2.5-flash');
    expect(provider.getEffectiveSettings(settings)).toBe(settings);
  });

  it('normalizes realistic ProxyGenAI chunks into provider StreamChunk output', async () => {
    const rawChunk = {
      candidates: [{
        content: {
          parts: [
            { text: 'Reasoning path. ', thought: true },
            { text: 'Final proxy answer.' },
          ],
        },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
        },
      }],
      usageMetadata: {
        totalTokenCount: 12,
        promptTokenCount: 5,
        candidatesTokenCount: 7,
      },
    };
    const stream = (async function* () {
      yield rawChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream,
      [Symbol.asyncIterator]() {
        return stream[Symbol.asyncIterator]();
      },
    });

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunks = await consumeStream(result.stream) as Array<Record<string, unknown>>;

    expect(chunks).toEqual([
      {
        text: 'Final proxy answer.',
        thought: 'Reasoning path. ',
        usage: {
          promptTokens: 5,
          candidatesTokens: 7,
          totalTokens: 12,
          thoughtsTokenCount: undefined,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined,
          isEstimated: undefined,
        },
        groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
        raw: rawChunk,
      },
    ]);
  });

  it('keeps empty or usage-less proxy chunks valid without inventing data', async () => {
    const rawChunk = {
      candidates: [{ content: { parts: [] } }],
      usageMetadata: null,
    };
    const stream = (async function* () {
      yield rawChunk;
    })();

    mockGenerateContentStream.mockResolvedValue({
      stream,
      [Symbol.asyncIterator]() {
        return stream[Symbol.asyncIterator]();
      },
    });

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunks = await consumeStream(result.stream) as Array<Record<string, unknown>>;

    expect(chunks).toEqual([
      {
        text: '',
        thought: '',
        usage: null,
        groundingChunks: undefined,
        raw: rawChunk,
      },
    ]);
  });

  it('propagates upstream ProxyGenAI failures unchanged', async () => {
    const error = new Error('Proxy stream failed');
    mockGenerateContentStream.mockRejectedValue(error);

    await expect(provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    })).rejects.toBe(error);
  });
});
