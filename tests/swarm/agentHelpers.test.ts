
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

        it('should return empty array if no results or saved states', () => {
            const work: Work = { results: {} };
            const result = getMissingAgentsForMessage(messageId, work, STEPS.INITIAL);
            expect(result).toEqual([]);
        });
    });

    describe('getUpdatedAgentName', () => {
        const mockSettings: AppSettings = {
            dynamicAgentRoles: false,
            activeRoleProfileId: 'p1',
            roleProfiles: [{
                id: 'p1',
                name: 'Profile 1',
                roles: [{ name: 'Researcher', instruction: '' }],
                criticRoles: [{ name: 'Reviewer', instruction: '' }]
            }]
        } as AppSettings;

        it('should return basic name for initial step when dynamic roles are disabled', () => {
            const name = getUpdatedAgentName(0, STEPS.INITIAL, { ...mockSettings, dynamicAgentRoles: false });
            expect(name).toBe('Agent 1');
        });

        it('should return role-based name for initial step when dynamic roles are enabled', () => {
            const name = getUpdatedAgentName(0, STEPS.INITIAL, { ...mockSettings, dynamicAgentRoles: true });
            expect(name).toBe('Agent 1 (Researcher)');
        });

        it('should return basic name for refinement step when dynamic roles are disabled', () => {
            const name = getUpdatedAgentName(0, STEPS.REFINEMENT, { ...mockSettings, dynamicAgentRoles: false });
            expect(name).toBe('Critic 1');
        });

        it('should return role-based name for refinement step when dynamic roles are enabled', () => {
            const name = getUpdatedAgentName(0, STEPS.REFINEMENT, { ...mockSettings, dynamicAgentRoles: true });
            expect(name).toBe('Critic 1 (Reviewer)');
        });

        it('should return synthesizer name for synthesis step regardless of settings', () => {
            const name1 = getUpdatedAgentName(0, STEPS.SYNTHESIS, { ...mockSettings, dynamicAgentRoles: false });
            const name2 = getUpdatedAgentName(0, STEPS.SYNTHESIS, { ...mockSettings, dynamicAgentRoles: true });
            
            expect(name1).toBe('Synthesizer');
            expect(name2).toBe('Synthesizer');
        });

        it('should handle index correctly for multiple agents', () => {
            const name = getUpdatedAgentName(1, STEPS.INITIAL, { ...mockSettings, dynamicAgentRoles: false });
            expect(name).toBe('Agent 2');
        });
    });
});
