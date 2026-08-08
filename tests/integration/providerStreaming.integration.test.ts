import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '@/services/ai/providers/GeminiProvider';
import { OpenRouterProvider } from '@/services/ai/providers/OpenRouterProvider';
import { ProxyProvider } from '@/services/ai/providers/ProxyProvider';

const mockGeminiGenerateStream = vi.fn();
const mockOpenRouterGenerateStream = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: mockGeminiGenerateStream,
    };
  }
}));

vi.mock('@/services/openrouter/OpenRouterGenAI', () => ({
  OpenRouterGenAI: class {
    models = {
      generateContentStream: mockOpenRouterGenerateStream,
    };
  }
}));

type ReaderChunk = string | { done: true };

const createReader = (chunks: ReaderChunk[]) => {
  let index = 0;

  return {
    read: vi.fn(async () => {
      const chunk = chunks[index++];
      if (chunk === undefined || (typeof chunk === 'object' && chunk.done)) {
        return { done: true, value: undefined };
      }

      return { done: false, value: chunk };
    }),
  };
};

const createProxyResponse = (chunks: ReaderChunk[]) => {
  const reader = createReader(chunks);

  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(''),
    headers: { get: vi.fn(() => 'application/json') },
    body: {
      pipeThrough: vi.fn(() => ({
        getReader: () => reader,
      })),
    },
  } as unknown as Response;
};

const consumeStream = async (stream: AsyncIterable<unknown>) => {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
};

describe('Provider streaming integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('TextDecoderStream', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes real Gemini-style chunks with thought, grounding, and usage metadata', async () => {
    const provider = new GeminiProvider('test-api-key');
    const rawChunk = {
      candidates: [{
        content: {
          parts: [
            { text: 'Thinking... ', thought: true },
            { text: 'Visible answer' },
          ],
        },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
        },
      }],
      usageMetadata: {
        totalTokenCount: 20,
        promptTokenCount: 8,
        candidatesTokenCount: 12,
        thoughtsTokenCount: 4,
      },
    };

    mockGeminiGenerateStream.mockResolvedValue((async function* () {
      yield rawChunk;
    })());

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunks = await consumeStream(result.stream) as Array<Record<string, unknown>>;

    expect(chunks).toEqual([
      {
        text: 'Visible answer',
        thought: 'Thinking... ',
        usage: {
          promptTokens: 8,
          candidatesTokens: 12,
          totalTokens: 20,
          thoughtsTokenCount: 4,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined,
          isEstimated: undefined,
        },
        groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
        raw: rawChunk,
      },
    ]);
  });

  it('normalizes real OpenRouter-style chunks and prefers top-level text and reasoning', async () => {
    const provider = new OpenRouterProvider({ apiKey: 'test-or-key', model: 'deepseek/deepseek-r1' });
    const rawChunk = {
      text: () => 'OpenRouter answer',
      thought: 'Reasoning trace',
      candidates: [{ content: { parts: [{ text: 'fallback text' }] } }],
      usageMetadata: {
        totalTokenCount: 30,
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 6,
        isEstimated: false,
      },
    };

    mockOpenRouterGenerateStream.mockResolvedValue({
      stream: (async function* () {
        yield rawChunk;
      })(),
    });

    const result = await provider.models.generateContentStream({
      model: 'deepseek/deepseek-r1',
      contents: [],
    });
    const chunks = await consumeStream(result.stream) as Array<Record<string, unknown>>;

    expect(chunks).toEqual([
      {
        text: 'OpenRouter answer',
        thought: 'Reasoning trace',
        usage: {
          promptTokens: 10,
          candidatesTokens: 20,
          totalTokens: 30,
          thoughtsTokenCount: 6,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined,
          isEstimated: false,
        },
        groundingChunks: undefined,
        raw: rawChunk,
      },
    ]);
  });

  it('preserves mixed Gemini stream chunks when thought, text, and usage arrive in separate yields', async () => {
    const provider = new GeminiProvider('test-api-key');
    const thoughtOnlyChunk = {
      candidates: [{
        content: {
          parts: [{ text: 'Reasoning only', thought: true }],
        },
      }],
    };
    const textOnlyChunk = {
      candidates: [{
        content: {
          parts: [{ text: 'Visible answer only' }],
        },
      }],
    };
    const usageOnlyChunk = {
      usageMetadata: {
        totalTokenCount: 14,
        promptTokenCount: 6,
        candidatesTokenCount: 8,
      },
    };

    mockGeminiGenerateStream.mockResolvedValue((async function* () {
      yield thoughtOnlyChunk;
      yield textOnlyChunk;
      yield usageOnlyChunk;
    })());

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunks = await consumeStream(result.stream) as Array<Record<string, unknown>>;

    expect(chunks).toEqual([
      {
        text: '',
        thought: 'Reasoning only',
        usage: null,
        groundingChunks: undefined,
        raw: thoughtOnlyChunk,
      },
      {
        text: 'Visible answer only',
        thought: '',
        usage: null,
        groundingChunks: undefined,
        raw: textOnlyChunk,
      },
      {
        text: '',
        thought: '',
        usage: {
          promptTokens: 6,
          candidatesTokens: 8,
          totalTokens: 14,
          thoughtsTokenCount: undefined,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined,
          isEstimated: undefined,
        },
        groundingChunks: undefined,
        raw: usageOnlyChunk,
      },
    ]);
  });

  it('parses fragmented proxy JSON and then normalizes it through ProxyProvider with the real parser path', async () => {
    const provider = new ProxyProvider();
    const fragmentA = '[{"candidates":[{"content":{"parts":[{"text":"Reasoning ","thought":true},{"text":"Proxy ';
    const fragmentB = 'answer"}]},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://proxy.test","title":"Proxy Source"}}]}}],"usageMetadata":{"totalTokenCount":9,"promptTokenCount":4,"candidatesTokenCount":5}}]';
    vi.mocked(fetch).mockResolvedValue(createProxyResponse([fragmentA, fragmentB]));

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunks = await consumeStream(result.stream) as Array<Record<string, unknown>>;

    expect(chunks).toEqual([
      {
        text: 'Proxy answer',
        thought: 'Reasoning ',
        usage: {
          promptTokens: 4,
          candidatesTokens: 5,
          totalTokens: 9,
          thoughtsTokenCount: undefined,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined,
          isEstimated: undefined,
        },
        groundingChunks: [{ web: { uri: 'https://proxy.test', title: 'Proxy Source' } }],
        raw: expect.objectContaining({
          candidates: expect.any(Array),
          usageMetadata: expect.objectContaining({ totalTokenCount: 9 }),
        }),
      },
    ]);
  });
});
