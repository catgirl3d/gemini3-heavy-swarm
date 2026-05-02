
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateUpdatedStateForRegeneration, updateWorkForStep } from '../../src/utils/swarm/regenerationHelpers';
import { STEPS } from '../../src/types/steps';
import { Message, Work, AppSettings, TokenUsage, ProviderType } from '../../src/types';

const mockSettings: AppSettings = {
  model: 'test-model',
  debugMode: false,
  numAgents: 3,
  temperature: 0.7,
  maxOutputTokens: 8192,
  unsafeTemperature: false,
  activeProfileId: 'default',
  profiles: [],
  devMode: false,
  simulateInitialError: 'none',
  simulateRefinementError: 'none',
  simulateSynthesisError: 'none',
  simulateInitialErrorAttempts: 0,
  simulateRefinementErrorAttempts: 0,
  simulateSynthesisErrorAttempts: 0,
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  useSearchInInitial: true,
  useSearchInRefinement: true,
  useSearchInSynthesis: true,
  dynamicAgentRoles: true,
  activeRoleProfileId: 'default',
  roleProfiles: [],
  savedInstructions: [],
  savedRoles: [],
  provider: ProviderType.Gemini,
  openRouterModel: ''
};

const mockWork: Work = {
  results: {},
  agentStates: [],
  agentNames: []
};

const mockMessage: Message = {
    id: 'msg-1',
    role: 'model',
    parts: [{ text: 'Old content' }],
    work: mockWork
};

describe('calculateUpdatedStateForRegeneration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

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
            false,
            'msg-1'
        );
        
        expect(updated[0].work?.results[stepId]).toBeDefined();
        const results = updated[0].work?.results[stepId];
        
        expect(Array.isArray(results)).toBe(true);
        if (Array.isArray(results)) {
            expect(results[agentIndex]).toEqual(text);
        }
    });

    it('should apply thought and usage metadata when provided', () => {
        const messages = [mockMessage];
        const stepId = STEPS.INITIAL;
        const agentIndex = 0;
        const text = 'Thinking result';
        const thought = 'Initial reasoning';
        const usage: TokenUsage = { totalTokens: 100, promptTokens: 40, candidatesTokens: 60 };
        
        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            stepId,
            agentIndex,
            mockWork,
            text,
            mockSettings,
            false,
            'msg-1',
            thought,
            usage
        );
        
        const work = updated[0].work;
        expect(work?.results[`${stepId}_thoughts` as any]).toBeDefined();
        expect((work?.results[`${stepId}_thoughts` as any] as string[])[agentIndex]).toBe(thought);
        
        expect(work?.results[`${stepId}_usage` as any]).toBeDefined();
        expect((work?.results[`${stepId}_usage` as any] as any[])[agentIndex]).toEqual(usage);
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
            false,
            'msg-1'
        );
        
        expect(updated[0].parts[0].text).toBe(text);
        expect(updated[0].work?.results[stepId]).toBeDefined();
    });

    it('does not clear visible synthesis text on thought-only chunks', () => {
        const messages = [{
            ...mockMessage,
            parts: [{ text: 'Previous synthesis' }],
        }];
        const thought = 'Reasoning before visible text';

        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            STEPS.SYNTHESIS,
            0,
            mockWork,
            '',
            mockSettings,
            false,
            'msg-1',
            thought
        );

        expect(updated[0].parts[0].text).toBe('Previous synthesis');
        expect((updated[0].work?.results?.[STEPS.SYNTHESIS] as { text?: string })?.text).toBe('');
        expect(updated[0].work?.results?.[`${STEPS.SYNTHESIS}_thought` as any]).toBe(thought);
    });

    it('creates a new model message for synthesis when no target model exists yet', () => {
        const messages: Message[] = [
            { id: 'user-1', role: 'user', parts: [{ text: 'Prompt text' }] }
        ];

        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            STEPS.SYNTHESIS,
            0,
            mockWork,
            'Fresh synthesis',
            mockSettings,
            true,
            'msg-1'
        );

        expect(updated).toHaveLength(2);
        expect(updated[1]).toMatchObject({
            role: 'model',
            parts: [{ text: 'Fresh synthesis' }]
        });
        expect((updated[1].work?.results?.[STEPS.SYNTHESIS] as { text?: string })?.text).toBe('Fresh synthesis');
    });

    it('falls back to workContext when the target message has no work of its own', () => {
        const messages: Message[] = [{
            id: 'msg-2',
            role: 'model',
            parts: [{ text: 'Old content' }]
        }];

        const updated = calculateUpdatedStateForRegeneration(
            messages,
            0,
            STEPS.INITIAL,
            1,
            mockWork,
            'Recovered text',
            mockSettings,
            false,
            'msg-2',
            undefined,
            null
        );

        expect(updated[0].work?.results?.[STEPS.INITIAL]).toEqual(['', 'Recovered text']);
        expect(updated[0].work?.results?.[`${STEPS.INITIAL}_usage` as any]).toBeUndefined();
    });

    it('returns the original collection when no message or work can be resolved', () => {
        expect(calculateUpdatedStateForRegeneration(
            [],
            0,
            STEPS.INITIAL,
            0,
            undefined,
            'ignored',
            mockSettings,
            true,
            'missing-msg'
        )).toEqual([]);
    });

    it('normalizes null usage metadata to undefined in work updates', () => {
        const updated = updateWorkForStep(
            mockWork,
            STEPS.INITIAL,
            0,
            'Updated text',
            mockSettings,
            'msg-1',
            'Thought',
            null
        );

        expect(updated.results?.[STEPS.INITIAL]).toEqual(['Updated text']);
        expect(updated.results?.[`${STEPS.INITIAL}_usage` as any]).toBeUndefined();
    });
});

