import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterGenAI } from '@/services/openrouter/OpenRouterGenAI';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

describe('OpenRouterGenAI', () => {
  let client: OpenRouterGenAI;

  beforeEach(() => {
    client = new OpenRouterGenAI({ model: 'test-model', isProxy: true, apiKey: 'test-key' });
    vi.clearAllMocks();
  });

  describe('generateContentStream validation', () => {
    it('should throw error when contents is invalid', async () => {
      const invalidRequests = [
        { model: 'test', contents: undefined },
        { model: 'test', contents: 'not an array' },
        { model: 'test', contents: [] },
        { model: 'test', contents: [{ role: 'user', parts: undefined }] },
      ];

      for (const request of invalidRequests) {
        await expect(async () => {
          const result = await client.models.generateContentStream(request as any);
          for await (const chunk of result.stream) { break; }
        }).rejects.toThrow(AppError);
      }
    });

    it('should accept valid contents and map to messages correctly', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const request = {
        model: 'test-model',
        config: { systemInstruction: 'Be helpful' },
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
      };

      const result = await client.models.generateContentStream(request as any);
      const chunks = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/openrouter'),
        expect.objectContaining({
          body: expect.stringContaining('"role":"system","content":"Be helpful"')
        })
      );
      expect(chunks[0].text()).toBe('Hello');
    });

    it('should call OpenRouter directly with auth headers and object-form system instructions', async () => {
      const directClient = new OpenRouterGenAI({ model: 'fallback-model', isProxy: false, apiKey: 'or-key' });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Direct"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const result = await directClient.models.generateContentStream({
        model: 'request-model',
        config: { systemInstruction: { parts: [{ text: 'Object system instruction' }] } },
        contents: [{ role: 'user', parts: [{ text: 'Hi direct' }] }]
      } as any);

      const chunks = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer or-key',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Gemini Swarm'
          }),
          body: expect.stringContaining('Object system instruction')
        })
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('request-model');
      expect(chunks[0].text()).toBe('Direct');
    });
  });

  describe('Stream Processing and Metadata', () => {
    it('should handle reasoning/thought tokens', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning":"Thinking..."}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const result = await client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any);
      const chunks = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      // First chunk should have thought
      expect(chunks[0].candidates[0].content.parts[0]).toEqual({ text: 'Thinking...', thought: true });
      // Second chunk should have content (and maybe previous thought state depending on implementation, but service yields deltas)
      expect(chunks[1].candidates[0].content.parts.find(p => p.text === 'Answer')).toBeDefined();
    });

    it('should use real usage data when provided by API', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}], "usage":{"prompt_tokens":10, "completion_tokens":5, "total_tokens":15, "reasoning_tokens":2}}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const result = await client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any);
      let lastUsage;
      for await (const chunk of result.stream) {
        lastUsage = chunk.usageMetadata;
      }

      expect(lastUsage).toEqual({
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
        thoughtsTokenCount: 2,
        isEstimated: false
      });
    });

    it('should estimate tokens if usage is missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello world"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const result = await client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any);
      let lastUsage;
      for await (const chunk of result.stream) {
        lastUsage = chunk.usageMetadata;
      }

      expect(lastUsage.promptTokenCount).toBeGreaterThan(0);
      expect(lastUsage.candidatesTokenCount).toBeGreaterThan(0);
      expect(lastUsage.isEstimated).toBe(true);
    });

    it('should track transition from estimated to real usage', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            // Chunk 1: Content only (estimated)
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
            // Chunk 2: Usage data (real)
            controller.enqueue(new TextEncoder().encode('data: {"choices":[], "usage":{"prompt_tokens":20, "completion_tokens":10, "total_tokens":30}}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const result = await client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any);
      const usages: any[] = [];
      for await (const chunk of result.stream) {
        if (chunk.usageMetadata) {
          usages.push({ ...chunk.usageMetadata });
        }
      }

      // First usage (estimated from content)
      expect(usages[0].isEstimated).toBe(true);
      
      // Last usage (real from API)
      const lastUsage = usages[usages.length - 1];
      expect(lastUsage.isEstimated).toBe(false);
      expect(lastUsage.promptTokenCount).toBe(20);
      expect(lastUsage.candidatesTokenCount).toBe(10);
      expect(lastUsage.totalTokenCount).toBe(30);
    });

    it('should ignore malformed SSE lines and continue streaming later valid chunks', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {not-json}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Recovered"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          }
        })
      });
      global.fetch = fetchMock;

      const result = await client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any);
      const chunks = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks.some(chunk => chunk.text() === 'Recovered')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should wrap fetch failures and reject responses without a body', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('offline'));

      await expect(client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any))
        .rejects.toMatchObject({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network or connection error: offline'
        });

      global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, body: null });

      await expect(client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any))
        .rejects.toMatchObject({
          code: ErrorCode.PROXY_ERROR,
          message: 'No response body from OpenRouter'
        });
    });

    it('should throw AppError on non-200 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      });

      await expect(client.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any))
        .rejects.toThrow(/OpenRouter error \(401\)/);
    });

    it('should handle network timeout during streaming', async () => {
      // Mock a stream that never finishes or errors
      const slowStream = new ReadableStream({
        start(controller) {
          // Send one chunk then wait indefinitely
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Thinking..."}}]}\n\n'));
        }
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: slowStream
      });

      // Set a very short timeout for testing
      const fastClient = new OpenRouterGenAI({ model: 'test', isProxy: true, timeout: 10 });
      
      const result = await fastClient.models.generateContentStream({ contents: [{ parts: [{ text: 'test' }] }] } as any);
      
      await expect(async () => {
        for await (const chunk of result.stream) {
          // First chunk might arrive before timeout
        }
      }).rejects.toThrow(/Stream read timeout/);
    });
  });
});
