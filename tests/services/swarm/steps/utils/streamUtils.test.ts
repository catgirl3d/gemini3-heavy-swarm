import { describe, it, expect } from 'vitest';
import {
  extractGroundingChunksFromChunk,
  extractPartsFromChunk,
  extractTextFromParts,
  extractTokenUsage,
  extractUsageMetadataFromChunk,
  GeminiPart,
  GeminiStreamChunk,
  GeminiUsageMetadata,
  isValidStreamChunk
} from '@/services/swarm/steps/utils/streamUtils';

type TextExtractionInput = Parameters<typeof extractTextFromParts>[0] | null | unknown;
const extractTextFromUnknown = extractTextFromParts as (input: TextExtractionInput) => { text: string; thought: string };
const extractUsageFromUnknown = extractTokenUsage as (input: GeminiUsageMetadata | null | unknown) => ReturnType<typeof extractTokenUsage>;

describe('streamUtils', () => {
  const parts: GeminiPart[] = [
    { text: 'reason', thought: true },
    { text: ' answer' }
  ];
  const usageMetadata: GeminiUsageMetadata = {
    promptTokenCount: 10,
    candidatesTokenCount: 20,
    totalTokenCount: 30,
    thoughtsTokenCount: 5,
    cachedContentTokenCount: 2,
    toolUsePromptTokenCount: 1,
    isEstimated: true
  };
  const groundingChunks = [{ web: { uri: 'https://example.com', title: 'Example' } }];
  const streamChunk: GeminiStreamChunk = {
    candidates: [
      {
        content: { parts },
        groundingMetadata: { groundingChunks }
      },
      {
        content: { parts: [{ text: 'ignored' }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://ignored.test' } }] }
      }
    ],
    usageMetadata
  };

  describe('isValidStreamChunk', () => {
    it('rejects null, primitives, and objects without stream fields', () => {
      expect(isValidStreamChunk(null)).toBe(false);
      expect(isValidStreamChunk('chunk')).toBe(false);
      expect(isValidStreamChunk(1)).toBe(false);
      expect(isValidStreamChunk({})).toBe(false);
      expect(isValidStreamChunk({ text: () => 'text' })).toBe(false);
      expect(isValidStreamChunk({ candidates: 'bad' })).toBe(false);
      expect(isValidStreamChunk({ usageMetadata: 'bad' })).toBe(false);
    });

    it('accepts chunks with candidates or usageMetadata', () => {
      expect(isValidStreamChunk({ candidates: [] })).toBe(true);
      expect(isValidStreamChunk({ usageMetadata: {} })).toBe(true);
      expect(isValidStreamChunk(streamChunk)).toBe(true);
    });
  });

  describe('chunk extractors', () => {
    it('extracts first-candidate parts, usage metadata, and grounding chunks', () => {
      expect(extractPartsFromChunk(streamChunk)).toBe(parts);
      expect(extractUsageMetadataFromChunk(streamChunk)).toBe(usageMetadata);
      expect(extractGroundingChunksFromChunk(streamChunk)).toBe(groundingChunks);
    });

    it('returns undefined for invalid or incomplete chunks', () => {
      expect(extractPartsFromChunk({ text: () => 'invalid' })).toBeUndefined();
      expect(extractUsageMetadataFromChunk(null)).toBeUndefined();
      expect(extractGroundingChunksFromChunk('invalid')).toBeUndefined();
      expect(extractPartsFromChunk({ candidates: [] })).toBeUndefined();
      expect(extractPartsFromChunk({ candidates: [{ content: { parts: 'bad' } }] })).toBeUndefined();
      expect(extractUsageMetadataFromChunk({ usageMetadata: 'bad' })).toBeUndefined();
      expect(extractGroundingChunksFromChunk({ candidates: [{ content: { parts } }] })).toBeUndefined();
    });
  });

  describe('extractTextFromParts', () => {
    it('should return empty strings for undefined or null input', () => {
      const extractFromUnknown = extractTextFromParts as (parts: unknown) => { text: string; thought: string };

      expect(extractTextFromParts(undefined)).toEqual({ text: '', thought: '' });
      expect(extractFromUnknown(null)).toEqual({ text: '', thought: '' });
    });

    it('should return empty strings for empty array', () => {
      expect(extractTextFromParts([])).toEqual({ text: '', thought: '' });
    });

    it('should extract text from parts with only text', () => {
      const parts = [
        { text: 'Hello ' },
        { text: 'world!' }
      ];
      expect(extractTextFromParts(parts)).toEqual({ text: 'Hello world!', thought: '' });
    });

    it('should extract thoughts from parts with thought: true', () => {
      const parts = [
        { text: 'Reasoning...', thought: true }
      ];
      expect(extractTextFromParts(parts)).toEqual({ text: '', thought: 'Reasoning...' });
    });

    it('should separate text and thoughts in mixed parts', () => {
      const parts = [
        { text: 'Chain of thought', thought: true },
        { text: ' Final answer' },
        { text: ' more reasoning', thought: true }
      ];
      expect(extractTextFromParts(parts)).toEqual({ 
        text: ' Final answer', 
        thought: 'Chain of thought more reasoning' 
      });
    });

    it('should ignore parts without text', () => {
      const parts = [
        { text: 'Visible' },
        { thought: true }, // thought true but no text
        { } // empty part
      ];
      expect(extractTextFromParts(parts)).toEqual({ text: 'Visible', thought: '' });
    });

    it('should treat false, omitted, and non-boolean thought flags as regular text', () => {
      const parts = [
        { text: 'Regular ', thought: false },
        { text: 'omitted ' },
        { text: 'string flag', thought: 'true' as unknown },
        { text: '', thought: true }
      ];

      expect(extractTextFromUnknown(parts)).toEqual({ text: 'Regular omitted string flag', thought: '' });
    });

    it('should return empty strings for non-array runtime input', () => {
      expect(extractTextFromUnknown({ text: 'not an array' })).toEqual({ text: '', thought: '' });
    });
  });

  describe('extractTokenUsage', () => {
    it('should return null if usageMetadata is undefined', () => {
      expect(extractTokenUsage(undefined)).toBeNull();
    });

    it('should extract full token usage info', () => {
      const metadata = {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30
      };
      expect(extractTokenUsage(metadata)).toEqual({
        promptTokens: 10,
        candidatesTokens: 20,
        totalTokens: 30,
        thoughtsTokenCount: undefined,
        cachedContentTokenCount: undefined,
        toolUsePromptTokenCount: undefined,
        isEstimated: undefined
      });
    });

    it('should propagate isEstimated flag', () => {
      const metadata = {
        totalTokenCount: 10,
        isEstimated: true
      };
      expect(extractUsageFromUnknown(metadata)?.isEstimated).toBe(true);
    });

    it('should default missing values to 0', () => {
      const metadata = {
        promptTokenCount: 5
        // missing others
      };
      expect(extractTokenUsage(metadata)).toEqual({
        promptTokens: 5,
        candidatesTokens: 0,
        totalTokens: 0,
        thoughtsTokenCount: undefined,
        cachedContentTokenCount: undefined,
        toolUsePromptTokenCount: undefined
      });
    });

    it('should extract extended token fields for thinking models', () => {
      const metadata = {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 500,
        thoughtsTokenCount: 150,
        cachedContentTokenCount: 50,
        toolUsePromptTokenCount: 0
      };
      expect(extractTokenUsage(metadata)).toEqual({
        promptTokens: 100,
        candidatesTokens: 200,
        totalTokens: 500,
        thoughtsTokenCount: 150,
        cachedContentTokenCount: 50,
        toolUsePromptTokenCount: 0
      });
    });

    it('should handle partial extended fields', () => {
      const metadata = {
        promptTokenCount: 80,
        candidatesTokenCount: 120,
        totalTokenCount: 250,
        thoughtsTokenCount: 50
        // cachedContentTokenCount and toolUsePromptTokenCount missing
      };
      expect(extractTokenUsage(metadata)).toEqual({
        promptTokens: 80,
        candidatesTokens: 120,
        totalTokens: 250,
        thoughtsTokenCount: 50,
        cachedContentTokenCount: undefined,
        toolUsePromptTokenCount: undefined
      });
    });

    it('should preserve zero extended values and false isEstimated flag', () => {
      expect(extractTokenUsage({
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
        thoughtsTokenCount: 0,
        cachedContentTokenCount: 0,
        toolUsePromptTokenCount: 0,
        isEstimated: false
      })).toEqual({
        promptTokens: 0,
        candidatesTokens: 0,
        totalTokens: 0,
        thoughtsTokenCount: 0,
        cachedContentTokenCount: 0,
        toolUsePromptTokenCount: 0,
        isEstimated: false
      });
    });

    it('should coerce NaN core token counts to zero while preserving negative values', () => {
      expect(extractTokenUsage({
        promptTokenCount: Number.NaN,
        candidatesTokenCount: -1,
        totalTokenCount: Number.NaN
      })).toEqual({
        promptTokens: 0,
        candidatesTokens: -1,
        totalTokens: 0,
        thoughtsTokenCount: undefined,
        cachedContentTokenCount: undefined,
        toolUsePromptTokenCount: undefined,
        isEstimated: undefined
      });
    });
  });
});
