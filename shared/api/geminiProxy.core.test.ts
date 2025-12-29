import { describe, it, expect, vi } from 'vitest';
import { validateAndPrepareProxy, executeGeminiRequest } from '@shared/api/geminiProxy.core';

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
      const result = validateAndPrepareProxy({ contents: [] }, false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as any).statusCode).toBe(400);
      }
    });

    it('should return target model and url for valid request', () => {
      const result = validateAndPrepareProxy(validBody, true); // Private mode to allow 2.5-flash
      if (!result.ok) throw new Error('Expected success');
      expect(result.targetModel).toBe('gemini-2.5-flash');
      expect(result.targetUrl).toContain('gemini-2.5-flash');
      expect(typeof result.requestBody).toBe('string');
    });

    it('should enforce flash-lite in demo mode', () => {
      const result = validateAndPrepareProxy(validBody, false); // Demo mode
      if (!result.ok) throw new Error('Expected success');
      expect(result.targetModel).toBe('gemini-2.5-flash-lite');
    });

    it('should return 413 if content is too large', () => {
      const largeBody = {
        contents: [{ parts: [{ text: 'a'.repeat(110000) }] }] // 110k chars > 100k limit
      };
      const result = validateAndPrepareProxy(largeBody, false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as any).statusCode).toBe(413);
      }
    });
  });

  describe('executeGeminiRequest', () => {
    it('should call fetch with correct parameters', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      
      await executeGeminiRequest('https://api.google.com/v1/...', '{"data":"test"}', 'key123');
      
      expect(fetchMock).toHaveBeenCalledWith('https://api.google.com/v1/...', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'key123',
        },
        body: '{"data":"test"}',
        signal: expect.any(AbortSignal),
      });
    });
  });
});
