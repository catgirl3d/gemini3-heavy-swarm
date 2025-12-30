
import { describe, it, expect } from 'vitest';
import { getMissingAgentsForMessage } from '../../src/utils/swarm/agentHelpers';
import { STEPS } from '../../src/types/steps';
import { Work, AgentState } from '../../src/types';

describe('getMissingAgentsForMessage', () => {
    const messageId = 'msg-1';
    
    it('should return saved agentStates if present', () => {
        const savedAgents: AgentState[] = [{
            id: 'a1',
            stepId: STEPS.INITIAL,
            agentIndex: 0,
            status: 'done',
            label: 'Finished',
            messageId: messageId,
            name: 'Researcher 1'
        }];
        
        const work: Work = {
            agentStates: savedAgents
        };
        
        const result = getMissingAgentsForMessage(messageId, work, STEPS.INITIAL);
        expect(result).toEqual(savedAgents);
    });

    it('should filter saved agentStates by messageId', () => {
        const savedAgents: AgentState[] = [
            { id: 'a1', stepId: STEPS.INITIAL, agentIndex: 0, status: 'done', label: 'F', messageId: messageId, name: 'A1' },
            { id: 'a2', stepId: STEPS.INITIAL, agentIndex: 0, status: 'done', label: 'F', messageId: 'other-msg', name: 'A2' }
        ];
        
        const work: Work = { agentStates: savedAgents };
        
        const result = getMissingAgentsForMessage(messageId, work, STEPS.INITIAL);
        expect(result.length).toBe(1);
        expect(result[0].messageId).toBe(messageId);
    });

    it('should reconstruct agents from results if saved states are missing', () => {
        const work: Work = {
            results: {
                [STEPS.INITIAL]: ['Result 1', '', '[System: Error message]']
            },
            agentNames: ['Custom Name 1', 'Custom Name 2', 'Custom Name 3']
        };
        
        const result = getMissingAgentsForMessage(messageId, work, STEPS.INITIAL);
        
        expect(result.length).toBe(3);
        
        // Agent 1: has text -> status: done
        expect(result[0].status).toBe('done');
        expect(result[0].name).toBe('Custom Name 1');
        
        // Agent 2: empty text -> status: waiting
        expect(result[1].status).toBe('waiting');
        
        // Agent 3: error tag -> status: error
        expect(result[2].status).toBe('error');
    });

    it('should return empty array if no results or saved states', () => {
        const work: Work = { results: {} };
        const result = getMissingAgentsForMessage(messageId, work, STEPS.INITIAL);
        expect(result).toEqual([]);
    });
});
