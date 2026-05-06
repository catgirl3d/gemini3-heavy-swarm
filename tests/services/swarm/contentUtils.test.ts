import { describe, expect, it } from 'vitest';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { Message } from '@/types';
import { STEPS } from '@/types/steps';

describe('prepareGeminiContent', () => {
  it('maps chat history to Gemini content and drops message metadata', () => {
    const parts = [{ text: '' }];
    const history: Message[] = [
      {
        id: 'msg-1',
        role: 'model',
        parts,
        image: 'data:image/png;base64,ignored',
        work: {
          results: {
            [STEPS.SYNTHESIS]: ['previous answer'],
            [`${STEPS.SYNTHESIS}_sources`]: [{ uri: 'https://example.test', title: 'Example' }],
          },
        },
      },
    ];

    const result = prepareGeminiContent(history, 'next question', null, null);

    expect(result.history).toEqual([{ role: 'model', parts: [{ text: 'previous answer' }] }]);
  });

  it('adds non-empty user input as an untrimmed text part', () => {
    const result = prepareGeminiContent([], '  keep surrounding spaces  ', null, null);

    expect(result.baseApiParts).toEqual([{ text: '  keep surrounding spaces  ' }]);
  });

  it('omits text parts for whitespace-only user input', () => {
    const result = prepareGeminiContent([], '   \n\t  ', null, null);

    expect(result.baseApiParts).toEqual([]);
  });

  it('uses imageFile MIME type before data URL MIME metadata', () => {
    const imageFile = new File(['image'], 'photo.webp', { type: 'image/webp' });
    const result = prepareGeminiContent(
      [],
      'describe image',
      'data:image/png;base64,abc123',
      imageFile
    );

    expect(result.baseApiParts).toEqual([
      {
        inlineData: {
          mimeType: 'image/webp',
          data: 'abc123',
        },
      },
      { text: 'describe image' },
    ]);
  });

  it('extracts MIME type from a data URL when no imageFile is available', () => {
    const result = prepareGeminiContent([], '', 'data:image/gif;base64,gif-data', null);

    expect(result.baseApiParts).toEqual([
      {
        inlineData: {
          mimeType: 'image/gif',
          data: 'gif-data',
        },
      },
    ]);
  });

  it('falls back to jpeg MIME type for images without data URL metadata', () => {
    const result = prepareGeminiContent([], 'caption', 'raw-base64-without-header', null);

    expect(result.baseApiParts).toEqual([
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: undefined,
        },
      },
      { text: 'caption' },
    ]);
  });
});
