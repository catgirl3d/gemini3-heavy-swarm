import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettings, Message, Work } from '@/types';
import { STEPS } from '@/types/steps';
import {
  ensureModelMessageForSynthesis,
  findTargetMessageIndex,
  updateMessageParts,
  updateWorkAgentNames,
} from '@/utils/chat/messageHelpers';

const generateUUIDMock = vi.hoisted(() => vi.fn(() => '00000000-0000-4000-8000-000000000000'));

vi.mock('@/utils/common/uuid', () => ({
  generateUUID: generateUUIDMock,
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    generateUUIDMock.mockReturnValue('00000000-0000-4000-8000-000000000000');
  });

  describe('updateMessageParts', () => {
    it('replaces only the first part text and preserves remaining parts', () => {
      const message = createMessage('model', 'm1', 'first', {
        parts: [{ text: 'first' }, { text: 'second' }],
      });

      const updated = updateMessageParts(message, 'updated');

      expect(updated).not.toBe(message);
      expect(updated.parts).toEqual([{ text: 'updated' }, { text: 'second' }]);
      expect(message.parts).toEqual([{ text: 'first' }, { text: 'second' }]);
    });

    it('returns the original message when the visible text is unchanged', () => {
      const message = createMessage('model', 'm1', 'same text');

      const updated = updateMessageParts(message, 'same text');

      expect(updated).toBe(message);
    });

    it('creates a first part when parts is empty', () => {
      const updated = updateMessageParts(createMessage('model', 'm1', 'ignored', { parts: [] }), 'created');

      expect(updated.parts).toEqual([{ text: 'created' }]);
    });

    it('creates a first part when parts is absent on malformed input', () => {
      const message = { id: 'm1', role: 'model' } as Message;

      const updated = updateMessageParts(message, 'created');

      expect(updated.parts).toEqual([{ text: 'created' }]);
    });
  });

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

  describe('ensureModelMessageForSynthesis', () => {
    it('returns an existing current model target without creating', () => {
      const messages = [createMessage('model', 'm1')];

      const result = ensureModelMessageForSynthesis(messages, 0, undefined, 'new text');

      expect(result).toEqual({ message: messages[0], index: 0, wasCreated: false });
      expect(generateUUIDMock).not.toHaveBeenCalled();
    });

    it('returns an existing next model target without creating', () => {
      const messages = [createMessage('user', 'u1'), createMessage('model', 'm1')];

      const result = ensureModelMessageForSynthesis(messages, 0, undefined, 'new text');

      expect(result).toEqual({ message: messages[1], index: 1, wasCreated: false });
      expect(generateUUIDMock).not.toHaveBeenCalled();
    });

    it('returns the final model target for synthesis without creating', () => {
      const messages = [
        createMessage('user', 'u1'),
        createMessage('user', 'u2'),
        createMessage('model', 'm1'),
      ];

      const result = ensureModelMessageForSynthesis(messages, 0, undefined, 'new text');

      expect(result).toEqual({ message: messages[2], index: 2, wasCreated: false });
      expect(generateUUIDMock).not.toHaveBeenCalled();
    });

    it('creates a new model message when no target exists', () => {
      const workContext: Work = { agentNames: ['Agent 1'] };
      const messages = [createMessage('user', 'u1')];

      const result = ensureModelMessageForSynthesis(
        messages,
        0,
        workContext,
        'created text',
        { debugMode: true } as AppSettings
      );

      expect(result).toEqual({
        message: {
          id: '00000000-0000-4000-8000-000000000000',
          role: 'model',
          parts: [{ text: 'created text' }],
          work: workContext,
        },
        index: 1,
        wasCreated: true,
      });
      expect(generateUUIDMock).toHaveBeenCalledTimes(1);
    });
  });
});
