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
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}], "usage":{"prompt_tokens":10, "completion_tokens":5, "total_tokens":15}}\n\n'));
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
        thoughtsTokenCount: undefined
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
    });
  });

  describe('Error Handling', () => {
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
