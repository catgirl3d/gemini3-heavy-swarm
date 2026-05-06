import { describe, expect, it } from 'vitest';
import { Message, Work } from '@/types';
import { STEPS } from '@/types/steps';
import {
  findTargetMessageIndex,
  updateWorkAgentNames,
} from '@/utils/chat/messageHelpers';

const createMessage = (
  role: Message['role'],
  id: string,
  text = `${id} text`,
  overrides: Partial<Message> = {}
): Message => ({
  id,
  role,
  parts: [{ text }],
  ...overrides,
});

describe('messageHelpers', () => {
  describe('updateWorkAgentNames', () => {
    it('delegates initial step name updates through setWorkName behavior', () => {
      const work: Work = { agentNames: ['Agent 1'] };

      const updated = updateWorkAgentNames(work, STEPS.INITIAL, 0, 'Updated Agent');

      expect(updated).not.toBe(work);
      expect(updated.agentNames).toEqual(['Updated Agent']);
      expect(work.agentNames).toEqual(['Agent 1']);
    });

    it('is a no-op for synthesis', () => {
      const work: Work = { agentNames: ['Agent 1'] };

      expect(updateWorkAgentNames(work, STEPS.SYNTHESIS, 0, 'Ignored')).toBe(work);
    });
  });

  describe('findTargetMessageIndex', () => {
    it('returns the current index when the current message is model', () => {
      const messages = [createMessage('user', 'u1'), createMessage('model', 'm1')];

      expect(findTargetMessageIndex(messages, 1, STEPS.INITIAL)).toBe(1);
    });

    it('returns the next index when the current message is user and next is model', () => {
      const messages = [createMessage('user', 'u1'), createMessage('model', 'm1')];

      expect(findTargetMessageIndex(messages, 0, STEPS.REFINEMENT)).toBe(1);
    });

    it('returns the final array item for synthesis when that item is model', () => {
      const messages = [
        createMessage('user', 'u1'),
        createMessage('user', 'u2'),
        createMessage('model', 'm1'),
      ];

      expect(findTargetMessageIndex(messages, 0, STEPS.SYNTHESIS)).toBe(2);
    });

    it('does not use the final-item fallback for non-synthesis steps', () => {
      const messages = [
        createMessage('user', 'u1'),
        createMessage('user', 'u2'),
        createMessage('model', 'm1'),
      ];

      expect(findTargetMessageIndex(messages, 0, STEPS.INITIAL)).toBeNull();
    });

    it('returns null when no target model message exists', () => {
      const messages = [createMessage('user', 'u1'), createMessage('user', 'u2')];

      expect(findTargetMessageIndex(messages, 0, STEPS.SYNTHESIS)).toBeNull();
    });
  });

});
