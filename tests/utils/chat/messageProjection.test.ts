import { describe, expect, it } from 'vitest';
import { type Message, type Work } from '@/types';
import { STEPS } from '@/types/steps';
import { getHistoryParts, getMessageDisplaySources, getMessageDisplayText } from '@/utils/chat/messageProjection';

describe('messageProjection', () => {
  it('uses user message parts as display and history payload', () => {
    const message: Message = {
      id: 'user-1',
      role: 'user',
      parts: [{ text: 'User prompt' }],
    };

    expect(getMessageDisplayText(message)).toBe('User prompt');
    expect(getHistoryParts(message)).toBe(message.parts);
    expect(getMessageDisplaySources(message)).toBeUndefined();
  });

  it('projects model display text and sources from work instead of parts', () => {
    const work: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['Final from work'],
        [`${STEPS.SYNTHESIS}_sources`]: [{ uri: 'https://source.test', title: 'Source' }],
      },
    };
    const message: Message = {
      id: 'model-1',
      role: 'model',
      parts: [{ text: 'stale parts text' }],
      work,
    };

    expect(getMessageDisplayText(message)).toBe('Final from work');
    expect(getMessageDisplaySources(message)).toEqual([{ uri: 'https://source.test', title: 'Source' }]);
    expect(getHistoryParts(message)).toEqual([{ text: 'Final from work' }]);
  });

  it('prefers live work for active model projection', () => {
    const message: Message = {
      id: 'model-1',
      role: 'model',
      parts: [{ text: '' }],
      work: {
        results: {
          [STEPS.SYNTHESIS]: ['Snapshot answer'],
        },
      },
    };
    const liveWork: Work = {
      results: {
        [STEPS.SYNTHESIS]: ['Live answer'],
      },
    };

    expect(getMessageDisplayText(message, liveWork)).toBe('Live answer');
  });
});
