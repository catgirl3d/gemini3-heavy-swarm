
import { describe, it, expect } from 'vitest';
import { updateTargetMessage } from '../../../src/utils/chat/messageUpdaters';
import { Message, Work } from '../../../src/types';
import { STEPS } from '../../../src/types/steps';

describe('updateTargetMessage', () => {
    const mockWork: Work = { agentNames: ['Agent 1'] };
    const initialMessages: Message[] = [
        { id: 'u1', role: 'user', parts: [{ text: 'hi' }] },
        { id: 'm1', role: 'model', parts: [{ text: 'placeholder' }], work: mockWork }
    ];

    it('should update a model message with new parts and work', () => {
        const updates = {
            parts: [{ text: 'updated text' }],
            work: { ...mockWork, agentNames: ['Updated Agent'] }
        };
        
        const result = updateTargetMessage(initialMessages, 1, STEPS.INITIAL, updates);
        
        expect(result).not.toBeNull();
        if (result) {
            expect(result[1].parts[0].text).toBe('updated text');
            expect(result[1].work?.agentNames).toEqual(['Updated Agent']);
            expect(result.length).toBe(2);
        }
    });

    it('should fallback to workContext if work is missing in updates', () => {
        const workContext: Work = { agentNames: ['Context Agent'] };
        const updates = { parts: [{ text: 'new' }] };
        
        // Remove work from existing message to test fallback
        const msgWithoutWork = { ...initialMessages[1], work: undefined };
        const msgs = [initialMessages[0], msgWithoutWork];
        
        const result = updateTargetMessage(msgs, 1, STEPS.INITIAL, updates, { workContext });
        
        expect(result).not.toBeNull();
        if (result) {
            expect(result[1].work).toEqual(workContext);
        }
    });

    it('should return null if target message is not found', () => {
        const result = updateTargetMessage(initialMessages, 99, STEPS.INITIAL, {});
        expect(result).toBeNull();
    });

    it('should return null if target is not a model message', () => {
        const userOnlyMessages: Message[] = [
            { id: 'u1', role: 'user', parts: [{ text: 'hi' }] },
            { id: 'u2', role: 'user', parts: [{ text: 'hi' }] }
        ];
        const result = updateTargetMessage(userOnlyMessages, 0, STEPS.INITIAL, {});
        expect(result).toBeNull();
    });
});
