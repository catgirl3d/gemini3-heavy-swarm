
import { describe, it, expect } from 'vitest';
import { getMissingAgentsForMessage, getUpdatedAgentName } from '../../src/utils/swarm/agentHelpers';
import { STEPS } from '../../src/types/steps';
import { Work, AgentState, AppSettings } from '../../src/types';

describe('agentHelpers', () => {
    const messageId = 'msg-1';

    describe('getMissingAgentsForMessage', () => {
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
            
            const result = getMissingAgentsForMessage(messageId, work);
            expect(result).toEqual(savedAgents);
        });

        it('should filter saved agentStates by messageId', () => {
            const savedAgents: AgentState[] = [
                { id: 'a1', stepId: STEPS.INITIAL, agentIndex: 0, status: 'done', label: 'F', messageId: messageId, name: 'A1' },
                { id: 'a2', stepId: STEPS.INITIAL, agentIndex: 0, status: 'done', label: 'F', messageId: 'other-msg', name: 'A2' }
            ];
            
            const work: Work = { agentStates: savedAgents };
            
            const result = getMissingAgentsForMessage(messageId, work);
            expect(result.length).toBe(1);
            expect(result[0].messageId).toBe(messageId);
        });

        it('should return empty array if no results or saved states', () => {
            const work: Work = { results: {} };
            const result = getMissingAgentsForMessage(messageId, work);
            expect(result).toEqual([]);
        });
    });

    describe('getUpdatedAgentName', () => {
        const mockSettings: AppSettings = {
            dynamicAgentRoles: true,
            activeRoleProfileId: 'p1',
            roleProfiles: [{
                id: 'p1',
                name: 'Profile 1',
                roles: [
                    { id: 'r1', name: 'Researcher', instruction: '' },
                    { id: 'r2', name: 'Analyst', instruction: '' }
                ],
                criticRoles: [{ id: 'c1', name: 'Reviewer', instruction: '' }]
            }]
        } as AppSettings;

        it('should always return role-based name for initial step', () => {
            const name = getUpdatedAgentName(0, STEPS.INITIAL, mockSettings);
            expect(name).toBe('Agent 1 (Researcher)');
        });

        it('should always return role-based name for refinement step', () => {
            const name = getUpdatedAgentName(0, STEPS.REFINEMENT, mockSettings);
            expect(name).toBe('Critic 1 (Reviewer)');
        });

        it('should return synthesizer name for synthesis step', () => {
            const name = getUpdatedAgentName(0, STEPS.SYNTHESIS, mockSettings);
            expect(name).toBe('Synthesizer');
        });

        it('should handle index correctly and use corresponding role', () => {
            const name = getUpdatedAgentName(1, STEPS.INITIAL, mockSettings);
            expect(name).toBe('Agent 2 (Analyst)');
        });
    });
});
