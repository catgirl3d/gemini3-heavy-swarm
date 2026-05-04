import { describe, it, expect, vi } from 'vitest';
import { validateAndPrepareProxy, executeGeminiRequest } from '@shared/api/geminiProxy.core';
import { MAX_CONTENT_CHARS } from '@shared/security/security';

// Mock global fetch
const fetchMock = vi.fn();
(global as any).fetch = fetchMock;

describe('geminiProxy.core', () => {
  describe('validateAndPrepareProxy', () => {
    const validBody = {
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: 'hello' }] }]
    };

    it('should return error for invalid contents', () => {
      const result = validateAndPrepareProxy({ contents: [] } as any, false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as any).statusCode).toBe(400);
      }
    });

    it('should return target model and url for valid request', () => {
      const result = validateAndPrepareProxy(validBody as any, true); // Private mode to allow 2.5-flash
      if (!result.ok) throw new Error('Expected success');
      expect(result.targetModel).toBe('gemini-2.5-flash');
      expect(result.targetUrl).toContain('gemini-2.5-flash');
      expect(typeof result.requestBody).toBe('string');
    });

    it('should enforce flash-lite in demo mode', () => {
      const result = validateAndPrepareProxy(validBody as any, false); // Demo mode
      if (!result.ok) throw new Error('Expected success');
      expect(result.targetModel).toBe('gemini-2.5-flash-lite');
    });

    it('should return 413 if content is too large', () => {
      const largeBody = {
        contents: [{ parts: [{ text: 'a'.repeat(MAX_CONTENT_CHARS + 1) }] }]
      };
      const result = validateAndPrepareProxy(largeBody as any, false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as any).statusCode).toBe(413);
      }
    });

    it('should reject unauthorized models', () => {
      const unauthorizedBody = {
        model: 'gpt-4-ultra-mega-secret',
        contents: [{ parts: [{ text: 'hello' }] }]
      };
      const result = validateAndPrepareProxy(unauthorizedBody as any, true);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as any).statusCode).toBe(400);
        expect((result as any).error).toContain('unauthorized');
      }
    });
  });

  describe('executeGeminiRequest', () => {
    it('should call fetch with correct parameters', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      
      await executeGeminiRequest('https://api.google.com/v1/...', '{"data":"test"}', 'key123');
      
      expect(fetchMock).toHaveBeenCalledWith('https://api.google.com/v1/...', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'key123',
        },
        body: '{"data":"test"}',
        signal: expect.any(AbortSignal),
      }));
    });

    it('should timeout correctly', async () => {
      fetchMock.mockImplementationOnce((...args) => new Promise((resolve, reject) => {
        const options = args[1] as { signal?: AbortSignal };
        const timeout = setTimeout(() => resolve({ ok: true }), 100);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Aborted'));
        });
      }));

      await expect(executeGeminiRequest('http://test', '{}', 'key', 10))
        .rejects.toThrow('Aborted');
    });
  });
});
