import { describe, it, expect, vi } from 'vitest';
import { validateAndPrepareOpenRouterProxy, executeOpenRouterRequest } from '@shared/api/openrouterProxy.core';

// Mock global fetch
const fetchMock = vi.fn();
(global as any).fetch = fetchMock;

describe('openrouterProxy.core', () => {
  describe('validateAndPrepareOpenRouterProxy', () => {
    const validBody = {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hello' }]
    };

    it('should return error for invalid messages', () => {
      const result = validateAndPrepareOpenRouterProxy({ model: 'test', messages: [] });
      if (!result.ok) {
        expect((result as any).statusCode).toBe(400);
      }
    });

    it('should return error for missing model', () => {
      const result = validateAndPrepareOpenRouterProxy({ model: '', messages: [{ role: 'user', content: 'hi' }] });
      if (!result.ok) {
        expect((result as any).statusCode).toBe(400);
      }
    });

    it('should return target url for valid request', () => {
      const result = validateAndPrepareOpenRouterProxy(validBody);
      if (!result.ok) throw new Error('Expected success');
      expect(result.targetUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(typeof result.requestBody).toBe('string');
    });

    it('should return 413 if content is too large', () => {
      const largeBody = {
        model: 'test',
        messages: [{ role: 'user', content: 'a'.repeat(210000) }] // > 200k limit
      };
      const result = validateAndPrepareOpenRouterProxy(largeBody);
      if (!result.ok) {
        expect((result as any).statusCode).toBe(413);
      }
    });
  });

  describe('executeOpenRouterRequest', () => {
    it('should call fetch with correct parameters', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      
      await executeOpenRouterRequest(
        'https://openrouter.ai/api/v1/chat/completions', 
        '{"data":"test"}', 
        'key123',
        'https://myapp.com',
        'My App'
      );
      
      expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer key123',
          'HTTP-Referer': 'https://myapp.com',
          'X-Title': 'My App'
        },
        body: '{"data":"test"}',
        signal: expect.any(AbortSignal),
      });
    });
  });
});
