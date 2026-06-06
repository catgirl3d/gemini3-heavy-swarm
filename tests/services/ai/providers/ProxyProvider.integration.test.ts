import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyProvider } from '@/services/ai/providers/ProxyProvider';
import { ErrorCode } from '@/utils/errors/AppError';

vi.mock('@/constants', () => ({
  API_SECRET: 'test-secret',
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
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

const createResponse = ({
  ok = true,
  status = 200,
  text = '',
  chunks = [] as ReaderChunk[] | null,
} = {}) => {
  const reader = chunks ? createReader(chunks) : undefined;

  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(text),
    headers: { get: vi.fn(() => 'application/json') },
    body: chunks
      ? {
          pipeThrough: vi.fn(() => ({
            getReader: () => reader,
          })),
        }
      : null,
  } as unknown as Response;
};

describe('ProxyProvider integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('TextDecoderStream', class {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the real proxy request contract through fetch with X-API-Secret', async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse({ chunks: ['[]'] }));
    const provider = new ProxyProvider();

    await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      config: {
        generationConfig: { temperature: 0.5 },
        systemInstruction: 'Be precise',
        tools: [{ googleSearch: {} }],
      },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/gemini');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-Secret': 'test-secret',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      generationConfig: { generationConfig: { temperature: 0.5 } },
      systemInstruction: { parts: [{ text: 'Be precise' }] },
      tools: [{ googleSearch: {} }],
    });
  });

  it('surfaces non-ok proxy HTTP responses and missing bodies through the provider contract', async () => {
    const provider = new ProxyProvider();
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ ok: false, status: 503, text: 'Service overloaded' }));

    await expect(provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    })).rejects.toMatchObject({
      code: ErrorCode.SERVICE_OVERLOADED,
      status: 503,
    });

    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ chunks: null }));

    await expect(provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    })).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'No response body from proxy',
    });
  });

  it('surfaces fetch-level proxy failures and stream read timeouts through the provider contract', async () => {
    const provider = new ProxyProvider();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('socket closed'));

    await expect(provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    })).rejects.toMatchObject({
      code: ErrorCode.NETWORK_ERROR,
      message: 'Network or connection error: socket closed',
    });

    const neverReader = {
      read: vi.fn(() => new Promise(() => undefined)),
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
      headers: { get: vi.fn(() => 'application/json') },
      body: {
        pipeThrough: vi.fn(() => ({
          getReader: () => neverReader,
        })),
      },
    } as unknown as Response);

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunksPromise = (async () => {
      for await (const _chunk of result.stream) {
        // consume until timeout rejects
      }
    })();
    const timeoutAssertion = expect(chunksPromise).rejects.toMatchObject({
      code: ErrorCode.NETWORK_ERROR,
      message: 'Stream read timeout',
    });

    await vi.advanceTimersByTimeAsync(60000);

    await timeoutAssertion;
  });

  it('surfaces malformed fragmented proxy JSON tails through the provider contract', async () => {
    const provider = new ProxyProvider();
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({
      chunks: ['[{"candidates":[{"content":{"parts":[{"text":"partial"}]}},'],
    }));

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunksPromise = (async () => {
      for await (const _chunk of result.stream) {
        // consume until malformed tail rejects
      }
    })();

    await expect(chunksPromise).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'Response stream ended with incomplete JSON chunk',
    });
  });

  it('surfaces response stream buffer overflow through the real proxy parser path', async () => {
    const provider = new ProxyProvider();
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({
      chunks: ['x'.repeat(5 * 1024 * 1024 + 1)],
    }));

    const result = await provider.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [],
    });
    const chunksPromise = (async () => {
      for await (const _chunk of result.stream) {
        // consume until overflow rejects
      }
    })();

    await expect(chunksPromise).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'Response stream buffer overflow',
    });
  });
});
