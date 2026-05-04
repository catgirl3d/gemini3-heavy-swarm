import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '@/utils/errors/AppError';
import { ProxyGenAI } from '@/services/proxy/ProxyGenAI';

const loggerWarn = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock('@/constants', () => ({
  API_SECRET: 'test-secret',
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = loggerWarn;
    error = loggerError;
  },
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

const consumeStream = async (stream: AsyncIterable<any>) => {
  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
};

describe('ProxyGenAI', () => {
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

  it('formats proxy payloads and wraps string system instructions for models.generateContentStream', async () => {
    vi.mocked(fetch).mockResolvedValue(createResponse());
    const proxy = new ProxyGenAI();
    const request = {
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      config: {
        systemInstruction: 'Follow the system rules',
        tools: [{ googleSearch: {} }],
        temperature: 0.4,
      },
    } as any;

    await proxy.models.generateContentStream(request);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/gemini');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-Secret': 'test-secret',
    });

    const payload = JSON.parse(init?.body as string);
    expect(payload).toEqual({
      model: 'gemini-2.5-flash-lite',
      contents: request.contents,
      generationConfig: { temperature: 0.4 },
      systemInstruction: { parts: [{ text: 'Follow the system rules' }] },
      tools: [{ googleSearch: {} }],
    });
  });

  it('rethrows existing AppError instances and wraps generic fetch failures as network errors', async () => {
    const existing = new AppError('stop now', ErrorCode.ABORTED);
    vi.mocked(fetch).mockRejectedValueOnce(existing);

    const proxy = new ProxyGenAI();
    await expect(proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any })).rejects.toBe(existing);

    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await expect(proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any })).rejects.toMatchObject({
      code: ErrorCode.NETWORK_ERROR,
      message: 'Network or connection error: offline',
    });
  });

  it('classifies non-ok responses and rejects missing response bodies', async () => {
    const proxy = new ProxyGenAI();
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ ok: false, status: 401, text: 'Permission denied' }));

    await expect(proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any })).rejects.toMatchObject({
      code: ErrorCode.INVALID_SETTINGS,
      status: 401,
    });

    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ chunks: null }));

    await expect(proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any })).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'No response body from proxy',
    });
  });

  it('parses fragmented JSON objects across multiple reads', async () => {
    const fragmentA = '[{"candidates":[{"content":{"parts":[{"text":"Hel';
    const fragmentB = 'lo "},{"text":"world"}]}}],"usageMetadata":{"totalTokenCount":5,"promptTokenCount":2,"candidatesTokenCount":3}}]';
    vi.mocked(fetch).mockResolvedValue(createResponse({ chunks: [fragmentA, fragmentB] }));

    const proxy = new ProxyGenAI();
    const result = await proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any });
    const chunks = await consumeStream(result.stream);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text()).toBe('Hello world');
    expect(chunks[0].usageMetadata).toEqual({
      totalTokenCount: 5,
      promptTokenCount: 2,
      candidatesTokenCount: 3,
    });
  });

  it('parses multiple objects in one chunk and ignores braces inside strings', async () => {
    const first = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'a {brace} "quote"' }] } }],
      usageMetadata: { totalTokenCount: 1 },
    });
    const second = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'second' }] } }],
      usageMetadata: { totalTokenCount: 2 },
    });
    vi.mocked(fetch).mockResolvedValue(createResponse({ chunks: [`[${first},${second}]`] }));

    const proxy = new ProxyGenAI();
    const result = await proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any });
    const chunks = await consumeStream(result.stream);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text()).toBe('a {brace} "quote"');
    expect(chunks[1].text()).toBe('second');
  });

  it('times out stalled stream reads and rejects oversized buffers', async () => {
    const pendingReader = { read: vi.fn(() => new Promise<never>(() => {})) };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
      headers: { get: vi.fn(() => 'application/json') },
      body: {
        pipeThrough: vi.fn(() => ({ getReader: () => pendingReader })),
      },
    } as unknown as Response);

    const proxy = new ProxyGenAI();
    const timedOut = await proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any });
    const nextPromise = timedOut.stream[Symbol.asyncIterator]().next();
    const timeoutAssertion = expect(nextPromise).rejects.toMatchObject({
      code: ErrorCode.NETWORK_ERROR,
      message: 'Stream read timeout',
    });

    await vi.advanceTimersByTimeAsync(60000);
    await timeoutAssertion;

    const hugeChunk = 'x'.repeat((5 * 1024 * 1024) + 1);
    vi.mocked(fetch).mockResolvedValueOnce(createResponse({ chunks: [hugeChunk] }));

    const overflowed = await proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any });
    await expect(overflowed.stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'Response stream buffer overflow',
    });
  });

  it('throws when the stream ends with an incomplete JSON fragment', async () => {
    const first = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'first' }] } }],
      usageMetadata: { totalTokenCount: 1 },
    });
    vi.mocked(fetch).mockResolvedValue(createResponse({
      chunks: [`[${first},{"candidates":[{"content":{"parts":[{"text":"broken`],
    }));

    const proxy = new ProxyGenAI();
    const result = await proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any });
    const iterator = result.stream[Symbol.asyncIterator]();

    const firstChunk = await iterator.next();
    expect(firstChunk.done).toBe(false);
    expect(firstChunk.value).toBeDefined();
    if (firstChunk.done) {
      throw new Error('Expected first chunk before truncated fragment error');
    }
    const chunkValue = firstChunk.value as { text: () => string };
    expect(chunkValue.text()).toBe('first');

    await expect(iterator.next()).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'Response stream ended with incomplete JSON chunk',
    });
  });

  it('throws when the stream ends with a balanced but malformed JSON object', async () => {
    const first = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'first' }] } }],
      usageMetadata: { totalTokenCount: 1 },
    });
    vi.mocked(fetch).mockResolvedValue(createResponse({
      chunks: [`[${first},{"candidates":not-json}]`],
    }));

    const proxy = new ProxyGenAI();
    const result = await proxy.getGenerativeModel({ model: 'x' }).generateContentStream({ contents: [] as any });
    const iterator = result.stream[Symbol.asyncIterator]();

    const firstChunk = await iterator.next();
    expect(firstChunk.done).toBe(false);
    if (firstChunk.done) {
      throw new Error('Expected first chunk before malformed final object error');
    }
    expect((firstChunk.value as { text: () => string }).text()).toBe('first');

    await expect(iterator.next()).rejects.toMatchObject({
      code: ErrorCode.PROXY_ERROR,
      message: 'Response stream ended with incomplete JSON chunk',
    });
  });
});
