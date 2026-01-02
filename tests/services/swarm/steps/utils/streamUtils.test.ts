import { describe, it, expect } from 'vitest';
import { extractTextFromParts, extractTokenUsage } from '@/services/swarm/steps/utils/streamUtils';

describe('streamUtils', () => {
  describe('extractTextFromParts', () => {
    it('should return empty strings for undefined or null input', () => {
      // @ts-ignore
      expect(extractTextFromParts(undefined)).toEqual({ text: '', thought: '' });
      // @ts-ignore
      expect(extractTextFromParts(null)).toEqual({ text: '', thought: '' });
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
      expect(extractTokenUsage(metadata as any).isEstimated).toBe(true);
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
  });
});
