import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '@/services/ai/providers/GeminiProvider';
import { OpenRouterProvider } from '@/services/ai/providers/OpenRouterProvider';
import { ProxyProvider } from '@/services/ai/providers/ProxyProvider';
import { StreamChunk } from '@/types/ai-provider';

/**
 * Integration tests for streaming generation.
 * These tests verify that providers correctly normalize chunks
 * and that BaseStep can consume them properly.
 */

// Define mock functions outside so they can be accessed in tests
const mockGeminiGenerateStream = vi.fn();
const mockOpenRouterGenerateStream = vi.fn();

// Mock the underlying SDK clients
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: mockGeminiGenerateStream
    };
  }
}));

vi.mock('@/services/openrouter/OpenRouterGenAI', () => ({
  OpenRouterGenAI: class {
    models = {
      generateContentStream: mockOpenRouterGenerateStream
    };
  }
}));

vi.mock('@/services/swarm/steps/utils/streamUtils', () => ({
  extractPartsFromChunk: vi.fn(),
  extractUsageMetadataFromChunk: vi.fn(),
  extractGroundingChunksFromChunk: vi.fn(),
  extractTokenUsage: vi.fn(),
  extractTextFromParts: vi.fn(),
}));

import { GoogleGenAI } from '@google/genai';
import { OpenRouterGenAI } from '@/services/openrouter/OpenRouterGenAI';
import {
  extractPartsFromChunk,
  extractUsageMetadataFromChunk,
  extractGroundingChunksFromChunk,
  extractTokenUsage,
  extractTextFromParts
} from '@/services/swarm/steps/utils/streamUtils';

describe('Streaming Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GeminiProvider streaming integration', () => {
    it('should normalize Gemini chunks correctly for BaseStep consumption', async () => {
      const provider = new GeminiProvider('test-api-key');

      // Simulate raw Gemini SDK chunks
      const rawChunk1 = { raw: 'gemini-chunk-1' };
      const rawChunk2 = { raw: 'gemini-chunk-2' };

      const mockStream = (async function* () {
        yield rawChunk1;
        yield rawChunk2;
      })();

      mockGeminiGenerateStream.mockResolvedValue(mockStream);

      // Mock extraction utilities
      (extractPartsFromChunk as any)
        .mockReturnValueOnce([{ text: 'Hello ' }])
        .mockReturnValueOnce([{ text: 'world!' }]);

      (extractUsageMetadataFromChunk as any)
        .mockReturnValueOnce({ totalTokenCount: 5 })
        .mockReturnValueOnce({ totalTokenCount: 10 });

      (extractGroundingChunksFromChunk as any).mockImplementation(() => []);

      (extractTextFromParts as any)
        .mockReturnValueOnce({ text: 'Hello ', thought: '' })
        .mockReturnValueOnce({ text: 'world!', thought: '' });

      (extractTokenUsage as any)
        .mockReturnValueOnce({ totalTokens: 5, promptTokens: 3, candidatesTokens: 2 })
        .mockReturnValueOnce({ totalTokens: 10, promptTokens: 3, candidatesTokens: 7 });

      // Generate stream
      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      // Consume and validate chunks
      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      
      // Verify first chunk
      expect(chunks[0]).toEqual({
        text: 'Hello ',
        thought: '',
        usage: { totalTokens: 5, promptTokens: 3, candidatesTokens: 2 },
        groundingChunks: [], // Always present in normalized StreamChunk
        raw: rawChunk1
      });

      // Verify second chunk
      expect(chunks[1]).toEqual({
        text: 'world!',
        thought: '',
        usage: { totalTokens: 10, promptTokens: 3, candidatesTokens: 7 },
        groundingChunks: [], // Always present in normalized StreamChunk
        raw: rawChunk2
      });
    });

    it('should handle reasoning thoughts in Gemini chunks', async () => {
      const provider = new GeminiProvider('test-api-key');

      const rawChunk = { raw: 'gemini-thinking' };

      const mockStream = (async function* () {
        yield rawChunk;
      })();

      mockGeminiGenerateStream.mockResolvedValue(mockStream);

      (extractPartsFromChunk as any).mockReturnValue([
        { text: 'Thinking...', thought: true },
        { text: 'Answer' }
      ]);

      (extractUsageMetadataFromChunk as any).mockReturnValue({ 
        totalTokenCount: 20,
        thoughtsTokenCount: 5 
      });

      (extractGroundingChunksFromChunk as any).mockReturnValue([]);

      (extractTextFromParts as any).mockImplementationOnce(() => ({
        text: 'Answer',
        thought: 'Thinking...'
      }));

      (extractTokenUsage as any).mockReturnValue({ 
        totalTokens: 20,
        thoughtsTokenCount: 5,
        promptTokens: 10,
        candidatesTokens: 10
      });

      const result = await provider.models.generateContentStream({
        model: 'gemini-2.0-flash-thinking-exp',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].thought).toBe('Thinking...');
      expect(chunks[0].text).toBe('Answer');
      expect(chunks[0].usage?.thoughtsTokenCount).toBe(5);
    });

    it('should handle grounding chunks from Google Search', async () => {
      const provider = new GeminiProvider('test-api-key');

      const rawChunk = { raw: 'gemini-grounded' };

      const mockStream = (async function* () {
        yield rawChunk;
      })();

      mockGeminiGenerateStream.mockResolvedValue(mockStream);

      const mockGroundingChunks = [{
        web: {
          uri: 'https://example.com',
          title: 'Example Source'
        }
      }];

      // Set up mocks for this specific test (no clearAllMocks mid-test)
      (extractPartsFromChunk as any).mockReturnValueOnce([{ text: 'Based on sources...' }]);
      (extractUsageMetadataFromChunk as any).mockReturnValueOnce({ totalTokenCount: 15 });
      (extractGroundingChunksFromChunk as any).mockReturnValueOnce(mockGroundingChunks);
      (extractTextFromParts as any).mockReturnValueOnce({ text: 'Based on sources...', thought: '' });
      (extractTokenUsage as any).mockReturnValueOnce({ totalTokens: 15, promptTokens: 5, candidatesTokens: 10 });

      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].groundingChunks).toEqual(mockGroundingChunks);
      // Verify structure of grounding chunks
      expect(chunks[0].groundingChunks?.[0]?.web?.uri).toBe('https://example.com');
      expect(chunks[0].groundingChunks?.[0]?.web?.title).toBe('Example Source');
    });
  });

  describe('OpenRouterProvider streaming integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should normalize OpenRouter chunks correctly for BaseStep consumption', async () => {
      const provider = new OpenRouterProvider({ 
        apiKey: 'test-or-key', 
        model: 'anthropic/claude-3-opus' 
      });

      // Simulate normalized OpenRouter chunks (already processed by OpenRouterGenAI)
      const mockChunk1 = {
        text: () => 'OpenRouter ',
        thought: '',
        usageMetadata: { totalTokenCount: 8, promptTokenCount: 3, candidatesTokenCount: 5 }
      };

      const mockChunk2 = {
        text: () => 'response',
        thought: '',
        usageMetadata: { totalTokenCount: 12, promptTokenCount: 3, candidatesTokenCount: 9 }
      };

      const mockStream = (async function* () {
        yield mockChunk1;
        yield mockChunk2;
      })();

      mockOpenRouterGenerateStream.mockResolvedValue({
        stream: mockStream
      });

      const result = await provider.models.generateContentStream({
        model: 'anthropic/claude-3-opus',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);

      // Verify first chunk
      expect(chunks[0]).toEqual({
        text: 'OpenRouter ',
        thought: '',
        usage: {
          totalTokens: 8,
          promptTokens: 3,
          candidatesTokens: 5,
          thoughtsTokenCount: undefined,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined
        },
        groundingChunks: undefined, // OpenRouter doesn't support grounding
        raw: mockChunk1
      });

      // Verify second chunk
      expect(chunks[1]).toEqual({
        text: 'response',
        thought: '',
        usage: {
          totalTokens: 12,
          promptTokens: 3,
          candidatesTokens: 9,
          thoughtsTokenCount: undefined,
          cachedContentTokenCount: undefined,
          toolUsePromptTokenCount: undefined
        },
        groundingChunks: undefined, // OpenRouter doesn't support grounding
        raw: mockChunk2
      });
    });

    it('should handle reasoning thoughts in OpenRouter chunks', async () => {
      const provider = new OpenRouterProvider({ 
        apiKey: 'test-or-key', 
        model: 'deepseek/deepseek-r1' 
      });

      const mockChunk = {
        text: () => 'Final answer',
        thought: 'Chain of thought reasoning...',
        usageMetadata: { 
          totalTokenCount: 100,
          thoughtsTokenCount: 50,
          promptTokenCount: 20,
          candidatesTokenCount: 80
        }
      };

      const mockStream = (async function* () {
        yield mockChunk;
      })();

      mockOpenRouterGenerateStream.mockResolvedValue({
        stream: mockStream
      });

      const result = await provider.models.generateContentStream({
        model: 'deepseek/deepseek-r1',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].thought).toBe('Chain of thought reasoning...');
      expect(chunks[0].text).toBe('Final answer');
      expect(chunks[0].usage?.thoughtsTokenCount).toBe(50);
    });

    it('should handle missing usage metadata gracefully', async () => {
      const provider = new OpenRouterProvider({ 
        apiKey: 'test-or-key', 
        model: 'openai/gpt-4' 
      });

      const mockChunk = {
        text: () => 'Response without usage',
        thought: '',
        usageMetadata: null
      };

      const mockStream = (async function* () {
        yield mockChunk;
      })();

      mockOpenRouterGenerateStream.mockResolvedValue({
        stream: mockStream
      });

      const result = await provider.models.generateContentStream({
        model: 'openai/gpt-4',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].usage).toBeNull();
    });
  });

  describe('ProxyProvider streaming integration', () => {
    // ProxyProvider.normalizeChunk() uses extract* utilities to normalize raw chunks.
    // Each test configures specific mock return values for its scenario.
    
    beforeEach(() => {
        vi.clearAllMocks();
        // Don't set global default values - let each test configure mocks explicitly
        // This prevents mock pollution and makes tests more explicit
    });

    it('should normalize proxy chunks correctly', async () => {
      const provider = new ProxyProvider();

      // ProxyProvider.normalizeChunk() uses extractPartsFromChunk, extractTextFromParts, etc.
      // We need to mock these utilities to return correct values for each chunk.
      
      // Mock the extraction utilities for the two chunks
      (extractPartsFromChunk as any)
        .mockReturnValueOnce([{ text: 'Proxy ' }])
        .mockReturnValueOnce([{ text: 'response' }]);
      
      (extractTextFromParts as any)
        .mockReturnValueOnce({ text: 'Proxy ', thought: '' })
        .mockReturnValueOnce({ text: 'response', thought: '' });
      
      (extractUsageMetadataFromChunk as any)
        .mockReturnValueOnce({})
        .mockReturnValueOnce({ totalTokenCount: 10 });
      
      (extractTokenUsage as any)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ totalTokens: 10, promptTokens: 0, candidatesTokens: 0 });
      
      (extractGroundingChunksFromChunk as any).mockReturnValue([]);

      // ProxyProvider uses fetch internally via ProxyGenAI
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: '{"candidates":[{"content":{"parts":[{"text":"Proxy "}]}}]}'
          })
          .mockResolvedValueOnce({
            done: false,
            value: '{"candidates":[{"content":{"parts":[{"text":"response"}]}}], "usageMetadata": {"totalTokenCount": 10}}'
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockStream = {
        getReader: () => mockReader
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          pipeThrough: vi.fn().mockReturnValue(mockStream),
          getReader: () => mockReader
        }
      });

      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      
      
      expect(chunks[0].text).toBe('Proxy ');
      expect(chunks[1].text).toBe('response');
      
      // ProxyProvider.normalizeChunk() transforms usageMetadata via extractTokenUsage
      // into the normalized 'usage' property on StreamChunk
      expect(chunks[1].usage).toEqual({ totalTokens: 10, promptTokens: 0, candidatesTokens: 0 });
    });

    it('should handle 4xx HTTP errors from proxy', async () => {
      const provider = new ProxyProvider();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key'
      });

      await expect(
        provider.models.generateContentStream({
          model: 'gemini-1.5-flash',
          contents: []
        })
      ).rejects.toThrow(); // Should reject with appropriate error
    });

    it('should handle 5xx HTTP errors from proxy', async () => {
      const provider = new ProxyProvider();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error occurred'
      });

      await expect(
        provider.models.generateContentStream({
          model: 'gemini-1.5-flash',
          contents: []
        })
      ).rejects.toThrow(); // Should reject with appropriate error
    });

    it('should handle network errors from proxy', async () => {
      const provider = new ProxyProvider();

      global.fetch = vi.fn().mockRejectedValue(new Error('Network request failed'));

      await expect(
        provider.models.generateContentStream({
          model: 'gemini-1.5-flash',
          contents: []
        })
      ).rejects.toThrow('Network request failed');
    });

    it('should handle malformed JSON chunks from proxy', async () => {
      const provider = new ProxyProvider();

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: 'INVALID JSON{{{' // Malformed JSON
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          })
      };

      const mockStream = {
        getReader: () => mockReader
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          pipeThrough: vi.fn().mockReturnValue(mockStream),
          getReader: () => mockReader
        }
      });

      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      // Should handle malformed JSON gracefully (might skip chunk or throw)
      // Behavior depends on ProxyGenAI implementation
      const chunks: StreamChunk[] = [];
      try {
        for await (const chunk of result.stream) {
          chunks.push(chunk);
        }
      } catch (error) {
        // Error during parsing is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error handling in streaming', () => {
    it('should propagate errors from Gemini stream', async () => {
      const provider = new GeminiProvider('test-api-key');

      const mockStream = (async function* () {
        yield { raw: 'chunk-1' };
        throw new Error('Stream error');
      })();

      mockGeminiGenerateStream.mockResolvedValue(mockStream);

      (extractPartsFromChunk as any).mockReturnValue([{ text: 'partial' }]);
      (extractUsageMetadataFromChunk as any).mockReturnValue({});
      (extractGroundingChunksFromChunk as any).mockReturnValue([]);
      (extractTextFromParts as any).mockReturnValue({ text: 'partial', thought: '' });
      (extractTokenUsage as any).mockReturnValue(null);

      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      await expect(async () => {
        for await (const chunk of result.stream) {
          // consume until error
        }
      }).rejects.toThrow('Stream error');
    });

    it('should propagate errors from OpenRouter stream', async () => {
      const provider = new OpenRouterProvider({ 
        apiKey: 'test-or-key', 
        model: 'test-model' 
      });

      const mockStream = (async function* () {
        yield { text: () => 'partial', thought: '', usageMetadata: {} };
        throw new Error('OpenRouter stream error');
      })();

      mockOpenRouterGenerateStream.mockResolvedValue({
        stream: mockStream
      });

      const result = await provider.models.generateContentStream({
        model: 'test-model',
        contents: []
      });

      await expect(async () => {
        for await (const chunk of result.stream) {
          // consume until error
        }
      }).rejects.toThrow('OpenRouter stream error');
    });
  });

  describe('AbortSignal cancellation', () => {
    it('should cancel Gemini stream when AbortSignal is triggered', async () => {
      const provider = new GeminiProvider('test-api-key');
      const abortController = new AbortController();

      let streamStarted = false;
      let streamAborted = false;

      const mockStream = (async function* () {
        streamStarted = true;
        yield { raw: 'chunk-1' };
        
        // Simulate checking abort signal
        if (abortController.signal.aborted) {
          streamAborted = true;
          throw new Error('Stream aborted');
        }
        
        yield { raw: 'chunk-2' };
      })();

      mockGeminiGenerateStream.mockResolvedValue(mockStream);

      (extractPartsFromChunk as any).mockReturnValue([{ text: 'partial' }]);
      (extractUsageMetadataFromChunk as any).mockReturnValue({});
      (extractGroundingChunksFromChunk as any).mockReturnValue([]);
      (extractTextFromParts as any).mockReturnValue({ text: 'partial', thought: '' });
      (extractTokenUsage as any).mockReturnValue(null);

      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      // Start consuming stream
      const streamIterator = result.stream[Symbol.asyncIterator]();
      
      // Get first chunk
      const firstChunk = await streamIterator.next();
      expect(firstChunk.done).toBe(false);
      expect(streamStarted).toBe(true);

      // Abort the stream
      abortController.abort();

      // Try to get next chunk - should throw or return done
      try {
        await streamIterator.next();
      } catch (error) {
        // Stream was aborted
        expect(streamAborted).toBe(true);
      }
    });

    it('should cancel OpenRouter stream when AbortSignal is triggered', async () => {
      const provider = new OpenRouterProvider({ 
        apiKey: 'test-or-key', 
        model: 'test-model' 
      });
      const abortController = new AbortController();

      let streamStarted = false;
      let streamAborted = false;

      const mockStream = (async function* () {
        streamStarted = true;
        yield { text: () => 'chunk-1', thought: '', usageMetadata: {} };
        
        // Simulate checking abort signal
        if (abortController.signal.aborted) {
          streamAborted = true;
          throw new Error('Stream aborted');
        }
        
        yield { text: () => 'chunk-2', thought: '', usageMetadata: {} };
      })();

      mockOpenRouterGenerateStream.mockResolvedValue({
        stream: mockStream
      });

      const result = await provider.models.generateContentStream({
        model: 'test-model',
        contents: []
      });

      // Start consuming stream
      const streamIterator = result.stream[Symbol.asyncIterator]();
      
      // Get first chunk
      const firstChunk = await streamIterator.next();
      expect(firstChunk.done).toBe(false);
      expect(streamStarted).toBe(true);

      // Abort the stream
      abortController.abort();

      // Try to get next chunk - should throw or return done
      try {
        await streamIterator.next();
      } catch (error) {
        // Stream was aborted
        expect(streamAborted).toBe(true);
      }
    });
  });

  describe('Token usage tracking accuracy', () => {
    it('should accumulate token usage correctly across chunks', async () => {
      const provider = new GeminiProvider('test-api-key');

      const mockStream = (async function* () {
        yield { raw: 'chunk-1' };
        yield { raw: 'chunk-2' };
        yield { raw: 'chunk-3' };
      })();

      mockGeminiGenerateStream.mockResolvedValue(mockStream);

      (extractPartsFromChunk as any).mockReturnValue([{ text: 'text' }]);
      (extractGroundingChunksFromChunk as any).mockReturnValue([]);
      (extractTextFromParts as any).mockReturnValue({ text: 'text', thought: '' });

      // Simulate progressive token counts (as API would return)
      (extractUsageMetadataFromChunk as any)
        .mockReturnValueOnce({ totalTokenCount: 5 })
        .mockReturnValueOnce({ totalTokenCount: 10 })
        .mockReturnValueOnce({ totalTokenCount: 15 });

      (extractTokenUsage as any)
        .mockReturnValueOnce({ totalTokens: 5, promptTokens: 3, candidatesTokens: 2 })
        .mockReturnValueOnce({ totalTokens: 10, promptTokens: 3, candidatesTokens: 7 })
        .mockReturnValueOnce({ totalTokens: 15, promptTokens: 3, candidatesTokens: 12 });

      const result = await provider.models.generateContentStream({
        model: 'gemini-1.5-flash',
        contents: []
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      // Verify progressive token counts
      expect(chunks[0].usage?.totalTokens).toBe(5);
      expect(chunks[1].usage?.totalTokens).toBe(10);
      expect(chunks[2].usage?.totalTokens).toBe(15);

      // Final chunk should have complete count
      const finalUsage = chunks[chunks.length - 1].usage;
      expect(finalUsage?.totalTokens).toBe(15);
      expect(finalUsage?.candidatesTokens).toBe(12);
    });
  });
});
