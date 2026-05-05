
import { describe, it, expect } from 'vitest';
import { getUpdatedAgentName } from '../../src/utils/swarm/agentHelpers';
import { STEPS } from '../../src/types/steps';
import { AppSettings } from '../../src/types';

describe('agentHelpers', () => {
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
