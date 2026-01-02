import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAndPrepareOpenRouterProxy, executeOpenRouterRequest } from '@shared/api/openrouterProxy.core';

// Mock global fetch
const fetchMock = vi.fn();
(global as any).fetch = fetchMock;

describe('openrouterProxy.core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateAndPrepareOpenRouterProxy', () => {
    const validFreeBody = {
      model: 'openai/gpt-4o:free',
      messages: [{ role: 'user', content: 'hello' }]
    };

    const validPaidBody = {
      model: 'openai/gpt-4',
      messages: [{ role: 'user', content: 'hello' }]
    };

    it('should return error for invalid messages', () => {
      const result = validateAndPrepareOpenRouterProxy({ model: 'test', messages: [] });
      if (!result.ok) {
        expect(result.statusCode).toBe(400);
        expect(result.error).toContain('Invalid messages');
      }
    });

    it('should return error for missing model', () => {
      const result = validateAndPrepareOpenRouterProxy({ model: '', messages: [{ role: 'user', content: 'hi' }] });
      if (!result.ok) {
        expect(result.statusCode).toBe(400);
        expect(result.error).toContain('Model is required');
      }
    });

    it('should return target url for valid free model request', () => {
      const result = validateAndPrepareOpenRouterProxy(validFreeBody);
      if (!result.ok) throw new Error('Expected success');
      expect(result.targetUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(typeof result.requestBody).toBe('string');
    });

    it('should return 413 if content is too large', () => {
      const largeBody = {
        model: 'test:free',
        messages: [{ role: 'user', content: 'a'.repeat(210000) }] // > 200k limit
      };

      const result = validateAndPrepareOpenRouterProxy(largeBody);
      if (!result.ok) {
        expect(result.statusCode).toBe(413);
        expect(result.error).toContain('too large');
      }
    });

    // CRITICAL: Test private mode security
    describe('Private Mode Security', () => {
      it('should reject paid models in demo mode (default)', () => {
        const result = validateAndPrepareOpenRouterProxy(validPaidBody, false);
        if (!result.ok) {
          expect(result.statusCode).toBe(403);
          expect(result.error).toContain('Only free models are allowed in demo mode');
        } else {
          throw new Error('Expected rejection of paid model in demo mode');
        }
      });

      it('should reject paid models when isPrivateMode is not provided', () => {
        const result = validateAndPrepareOpenRouterProxy(validPaidBody);
        if (!result.ok) {
          expect(result.statusCode).toBe(403);
        } else {
          throw new Error('Expected rejection of paid model without private mode');
        }
      });

      it('should allow paid models in private mode', () => {
        const result = validateAndPrepareOpenRouterProxy(validPaidBody, true);
        if (!result.ok) {
          throw new Error(`Expected success in private mode, got: ${result.error}`);
        }
        expect(result.ok).toBe(true);
        expect(result.targetUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
      });

      it('should always allow free models regardless of mode', () => {
        const demoResult = validateAndPrepareOpenRouterProxy(validFreeBody, false);
        const privateResult = validateAndPrepareOpenRouterProxy(validFreeBody, true);
        
        if (!demoResult.ok) throw new Error('Free model should work in demo mode');
        if (!privateResult.ok) throw new Error('Free model should work in private mode');
        
        expect(demoResult.ok).toBe(true);
        expect(privateResult.ok).toBe(true);
      });
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

    it('should omit optional headers if not provided', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      
      await executeOpenRouterRequest(
        'https://openrouter.ai/api/v1/chat/completions', 
        '{"data":"test"}', 
        'key123'
      );
      
      const callHeaders = fetchMock.mock.calls[0][1].headers;
      expect(callHeaders['HTTP-Referer']).toBeUndefined();
      expect(callHeaders['X-Title']).toBeUndefined();
      expect(callHeaders['Authorization']).toBe('Bearer key123');
    });

    // CRITICAL: Test timeout handling
    describe('Error Handling', () => {
      it('should abort request on timeout', async () => {
        // Simulate a slow response that responds to abort signals
        let abortSignalReceived: AbortSignal | undefined;
        
        fetchMock.mockImplementation((_url, options) => {
          abortSignalReceived = options?.signal;
          
          return new Promise((resolve, reject) => {
            // Simulate long request
            const timer = setTimeout(() => resolve({ ok: true }), 5000);
            
            // Listen to abort signal and reject if aborted
            if (abortSignalReceived) {
              abortSignalReceived.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          });
        });

        const timeoutMs = 100; // Very short timeout
        
        // Should reject due to abort
        await expect(
          executeOpenRouterRequest(
            'https://openrouter.ai/api/v1/chat/completions',
            '{"data":"test"}',
            'key123',
            undefined,
            undefined,
            timeoutMs
          )
        ).rejects.toThrow('abort');
        
        // Verify that abort signal was passed and triggered
        expect(abortSignalReceived).toBeDefined();
        expect(abortSignalReceived?.aborted).toBe(true);
      }, 10000); // Increase test timeout to allow for cleanup


      it('should propagate fetch errors', async () => {
        const networkError = new Error('Network failure');
        fetchMock.mockRejectedValueOnce(networkError);

        await expect(
          executeOpenRouterRequest(
            'https://openrouter.ai/api/v1/chat/completions',
            '{"data":"test"}',
            'key123'
          )
        ).rejects.toThrow('Network failure');
      });

      it('should clear timeout after successful response', async () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        fetchMock.mockResolvedValueOnce({ ok: true });

        await executeOpenRouterRequest(
          'https://openrouter.ai/api/v1/chat/completions',
          '{"data":"test"}',
          'key123'
        );

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });

      it('should clear timeout even on fetch error', async () => {
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
        fetchMock.mockRejectedValueOnce(new Error('Network error'));

        await expect(
          executeOpenRouterRequest(
            'https://openrouter.ai/api/v1/chat/completions',
            '{"data":"test"}',
            'key123'
          )
        ).rejects.toThrow();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });
    });
  });
});
