
import { describe, it, expect, vi } from 'vitest';
import { calculateUpdatedStateForRegeneration } from '../../src/utils/swarm/regenerationHelpers';
import { STEPS } from '../../src/types/steps';
import { Message, Work, AppSettings } from '../../src/types';

// Mocks
const mockSettings: AppSettings = {
  model: 'test-model',
  debugMode: false,
  numAgents: 3,
  temperature: 0.7,
  unsafeTemperature: false,
  activeProfileId: 'default',
  profiles: [],
  devMode: false,
  simulateSynthesisError: 'none',
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  dynamicAgentRoles: false,
  activeRoleProfileId: 'default',
  roleProfiles: [],
  savedInstructions: [],
  savedRoles: []
};

const mockWork: Work = {
  results: {},
  agentStates: []
};

const mockMessage: Message = {
    id: 'msg-1',
    role: 'model',
    parts: [{ text: 'Old content' }],
    work: mockWork
};

describe('calculateUpdatedStateForRegeneration', () => {
    it('should update existing work in a message', () => {
        const messages = [mockMessage];
        const stepId = STEPS.INITIAL;
        const agentIndex = 0;
        const text = 'New Generated Text';
        
        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            stepId,
            agentIndex,
            mockWork,
            text,
            mockSettings,
            false // not first chunk
        );
        
        expect(updated[0].work?.results[stepId]).toBeDefined();
        const results = updated[0].work?.results[stepId];
        
        // Assuming results is array for INITIAL step
        expect(Array.isArray(results)).toBe(true);
        if (Array.isArray(results)) {
            expect(results[agentIndex]).toEqual(text);
        }
    });

    it('should fallback to workContext if message work is missing', () => {
        const msgWithoutWork = { ...mockMessage, work: undefined };
        const messages = [msgWithoutWork];
        const stepId = STEPS.REFINEMENT;
        const agentIndex = 1;
        const text = 'Refined Text';
        
        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            stepId,
            agentIndex,
            mockWork, // Context provided fallback
            text,
            mockSettings,
            true
        );
        
        expect(updated[0].work).toBeDefined();
        expect(Array.isArray(updated[0].work?.results[stepId])).toBe(true);
        expect((updated[0].work?.results[stepId] as string[])[agentIndex]).toEqual(text);
    });

    it('should handle Synthesis step text updates on message parts', () => {
        const messages = [mockMessage];
        const stepId = STEPS.SYNTHESIS;
        const agentIndex = 0;
        const text = 'Synthesis Result';
        
        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            stepId,
            agentIndex,
            mockWork,
            text,
            mockSettings,
            false
        );
        
        // Should update message parts for synthesis
        expect(updated[0].parts[0].text).toBe(text);
        
        // Should ALSO update work result
        // Synthesis usually stores object { text: ... } or just text depending on implementation
        // BaseStep ensureResults might convert to object or array. 
        // Let's check what updateWorkForStep does.
        // It calls updateStepResult which handles it.
        
        const result = updated[0].work?.results[stepId];
        expect(result).toBeDefined();
    });
});
