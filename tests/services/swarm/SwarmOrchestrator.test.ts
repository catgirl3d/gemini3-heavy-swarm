import { describe, it, expect, vi } from 'vitest';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { AiProvider } from '@/types/ai-provider';
import { StepDescriptor, STEPS, StepId } from '@/types/steps';
import { AppSettings, Message, AgentState, Work } from '@/types';
import { MutableRefObject } from 'react';

describe('SwarmOrchestrator Integrated', () => {
    const mockProvider: AiProvider = {
        name: 'mock',
        capabilities: {
            search: false,
            vision: false,
            reasoning: false,
            codeExecution: false
        },
        isProxy: false,
        getEffectiveSettings: (s) => s,
        getDefaultModel: () => 'model',
        models: {
            generateContentStream: vi.fn()
        }
    };

    const mockStep = (id: StepId): StepDescriptor => ({
        id,
        name: id,
        description: id,
        execute: vi.fn().mockResolvedValue(['result']),
    });

    it('should use provided steps and return work', async () => {
        const step1 = mockStep(STEPS.INITIAL);
        const step2 = mockStep(STEPS.REFINEMENT);
        const step3: StepDescriptor = {
            ...mockStep(STEPS.SYNTHESIS),
            execute: vi.fn().mockResolvedValue({ text: 'Final answer' })
        };

        const orchestrator = new SwarmOrchestrator(mockProvider, [step1, step2, step3]);

        const result = await orchestrator.runSwarm(
            { numAgents: 1, debugMode: false, devMode: false, pauseAfterInitial: false } as AppSettings,
            'input',
            null,
            null,
            [],
            'id',
            vi.fn(),
            new AbortController().signal,
            { current: null }
        );

        expect(result.text).toBe('Final answer');
        expect(step1.execute).toHaveBeenCalled();
        expect(step3.execute).toHaveBeenCalled();
    });

    it('should delegate regeneration to the matching step', async () => {
        const step1 = mockStep(STEPS.INITIAL);
        const step2: StepDescriptor = {
            ...mockStep(STEPS.SYNTHESIS),
            regenerate: vi.fn().mockResolvedValue({ text: 'Regen result', work: {} })
        };

        const orchestrator = new SwarmOrchestrator(mockProvider, [step1, step2]);

        const result = await orchestrator.regenerateResponse(
            { numAgents: 1, debugMode: false } as AppSettings,
            'input',
            null,
            null,
            [],
            'id',
            0,
            STEPS.SYNTHESIS,
            { results: {} } as Work,
            [] as AgentState[],
            vi.fn(),
            new AbortController().signal
        );

        expect(result.text).toBe('Regen result');
        expect(step2.regenerate).toHaveBeenCalled();
    });
});
