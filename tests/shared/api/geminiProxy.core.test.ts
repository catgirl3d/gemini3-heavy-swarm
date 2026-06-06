import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content, Tool } from '@google/genai';
import { executeGeminiRequest, validateAndPrepareProxy } from '@shared/api/geminiProxy.core';
import type { GeminiRequest } from '@shared/api/types';
import { DEFAULT_MODEL, MAX_CONTENT_CHARS } from '@shared/security/security';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const validContents: Content[] = [{
  role: 'user',
  parts: [{ text: 'hello from the client' }],
}];

const validRequest = (overrides: Partial<GeminiRequest> = {}): GeminiRequest => ({
  model: 'gemini-2.5-flash',
  contents: validContents,
  generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
  systemInstruction: { parts: [{ text: 'Be concise' }] },
  tools: [{ googleSearch: {} }] as Tool[],
  ...overrides,
});

describe('geminiProxy.core', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe('validateAndPrepareProxy', () => {
    it('rejects invalid contents before any model routing or serialization', () => {
      const result = validateAndPrepareProxy({ ...validRequest(), contents: [] }, false);

      expect(result).toEqual({
        ok: false,
        error: 'Missing or invalid "contents" in request body',
        statusCode: 400,
      });
    });

    it('rejects malformed non-empty contents items that do not expose a non-empty parts array', () => {
      const result = validateAndPrepareProxy({
        ...validRequest(),
        contents: [{ role: 'user' } as Content],
      }, true);

      expect(result).toEqual({
        ok: false,
        error: 'Invalid "contents" structure: each item must have a non-empty "parts" array (further validation by Gemini API)',
        statusCode: 400,
      });
    });

    it('preserves the requested private-mode model and serializes the exact proxy payload contract', () => {
      const request = validRequest({ model: 'gemini-2.5-pro' });

      const result = validateAndPrepareProxy(request, true);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error('Expected private-mode proxy preparation to succeed');
      }

      expect(result.targetModel).toBe('gemini-2.5-pro');
      expect(result.targetUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent');
      expect(JSON.parse(result.requestBody)).toEqual({
        contents: validContents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
        systemInstruction: { parts: [{ text: 'Be concise' }] },
        tools: [{ googleSearch: {} }],
      });
    });

    it('forces the demo model regardless of the client-requested model in non-private mode', () => {
      const result = validateAndPrepareProxy(validRequest({ model: 'gemini-3-pro-preview' }), false);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error('Expected demo-mode proxy preparation to succeed');
      }

      expect(result.targetModel).toBe(DEFAULT_MODEL);
      expect(result.targetUrl).toContain(`${DEFAULT_MODEL}:streamGenerateContent`);
    });

    it('rejects unauthorized models and oversized request bodies with exact boundary errors', () => {
      const unauthorized = validateAndPrepareProxy(validRequest({ model: 'gpt-4-ultra-mega-secret' }), true);
      expect(unauthorized).toEqual({
        ok: false,
        error: 'Invalid or unauthorized model',
        statusCode: 400,
      });

      const oversized = validateAndPrepareProxy({
        ...validRequest(),
        contents: [{ parts: [{ text: 'a'.repeat(MAX_CONTENT_CHARS + 1) }] }],
      }, true);
      expect(oversized).toEqual({
        ok: false,
        error: 'Content too large',
        statusCode: 413,
      });
    });

    it('rejects non-serializable payload pieces as malformed requests', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      const result = validateAndPrepareProxy({
        ...validRequest(),
        systemInstruction: circular as unknown as Content,
      }, true);

      expect(result).toEqual({
        ok: false,
        error: 'Content is not serializable',
        statusCode: 400,
      });
    });
  });

  describe('executeGeminiRequest', () => {
    it('posts the serialized body with Gemini auth headers and returns the upstream response unchanged', async () => {
      const upstreamResponse = { ok: false, status: 503, text: vi.fn().mockResolvedValue('Service overloaded') } as unknown as Response;
      fetchMock.mockResolvedValueOnce(upstreamResponse);

      const response = await executeGeminiRequest('https://api.google.com/v1/models/test:streamGenerateContent', '{"payload":true}', 'key123');

      expect(fetchMock).toHaveBeenCalledWith('https://api.google.com/v1/models/test:streamGenerateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'key123',
        },
        body: '{"payload":true}',
        signal: expect.any(AbortSignal),
      });
      expect(response).toBe(upstreamResponse);
    });

    it('aborts stalled fetches through the request timeout signal', async () => {
      fetchMock.mockImplementationOnce((_url, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted by timeout')), { once: true });
      }));

      await expect(executeGeminiRequest('https://api.google.com/v1/models/test:streamGenerateContent', '{}', 'key123', 10))
        .rejects.toThrow('Aborted by timeout');
    });
  });
});
