import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { isLatestRegenerableMessage } from '@/utils/swarm/sessionHelpers';

describe('sessionHelpers', () => {
  it('allows regeneration only for the latest assistant turn', () => {
    const messages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'Question 1' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'Answer 1' }] },
      { id: 'user-2', role: 'user', parts: [{ text: 'Question 2' }] },
      { id: 'model-2', role: 'model', parts: [{ text: 'Answer 2' }] },
    ];

    expect(isLatestRegenerableMessage(messages, 'model-1')).toBe(false);
    expect(isLatestRegenerableMessage(messages, 'model-2')).toBe(true);
  });

  it('treats an assistant turn as historical as soon as a later user prompt exists', () => {
    const messages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'Question 1' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'Answer 1' }] },
      { id: 'user-2', role: 'user', parts: [{ text: 'Follow up' }] },
    ];

    expect(isLatestRegenerableMessage(messages, 'model-1')).toBe(false);
  });

  it('rejects missing and non-model messages', () => {
    const messages: Message[] = [
      { id: 'user-1', role: 'user', parts: [{ text: 'Question 1' }] },
      { id: 'model-1', role: 'model', parts: [{ text: 'Answer 1' }] },
    ];

    expect(isLatestRegenerableMessage(messages, 'user-1')).toBe(false);
    expect(isLatestRegenerableMessage(messages, 'missing')).toBe(false);
  });
});
