import { describe, it, expect, vi } from 'vitest';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { AiProvider } from '@/types/ai-provider';
import { StepContext, StepDescriptor, STEPS, StepId } from '@/types/steps';
import { AppSettings, AgentState, Work } from '@/types';
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

    const createSettings = (overrides: Partial<AppSettings> = {}) => ({
        numAgents: 1,
        debugMode: false,
        devMode: false,
        pauseAfterInitial: false,
        pauseAfterRefinement: false,
        ...overrides,
    } as AppSettings);

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

    it('should resume from existing work and skip completed steps', async () => {
        const step1 = mockStep(STEPS.INITIAL);
        const step2: StepDescriptor = {
            ...mockStep(STEPS.SYNTHESIS),
            execute: vi.fn().mockResolvedValue({ text: 'Resumed final' })
        };
        const existingWork: Work = {
            results: {
                [STEPS.INITIAL]: ['already complete'],
                [STEPS.SYNTHESIS]: {}
            },
            stepMetadata: [
                { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
                { id: STEPS.SYNTHESIS, status: 'pending', label: 'Synthesis Step' }
            ],
            agentNames: ['Saved Agent'],
            criticNames: ['Saved Critic']
        };

        const orchestrator = new SwarmOrchestrator(mockProvider, [step1, step2]);

        const result = await orchestrator.runSwarm(
            createSettings(),
            'input',
            null,
            null,
            [],
            'id',
            vi.fn(),
            new AbortController().signal,
            { current: null },
            undefined,
            undefined,
            undefined,
            existingWork
        );

        expect(result.text).toBe('Resumed final');
        expect(result.work).toMatchObject({
            results: {
                [STEPS.INITIAL]: ['already complete'],
                [STEPS.SYNTHESIS]: { text: 'Resumed final' }
            },
            stepMetadata: [
                { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
                { id: STEPS.SYNTHESIS, status: 'done', label: 'Synthesis Step' }
            ],
            agentNames: ['Saved Agent'],
            criticNames: ['Saved Critic']
        });
        expect(step1.execute).not.toHaveBeenCalled();
        expect(step2.execute).toHaveBeenCalledTimes(1);
    });

    it('should suppress final text when synthesis returns an error result', async () => {
        const synthesisStep: StepDescriptor = {
            ...mockStep(STEPS.SYNTHESIS),
            execute: vi.fn().mockResolvedValue({ text: 'partial failure text', error: true })
        };
        const orchestrator = new SwarmOrchestrator(mockProvider, [synthesisStep]);

        const result = await orchestrator.runSwarm(
            createSettings(),
            'input',
            null,
            null,
            [],
            'id',
            vi.fn(),
            new AbortController().signal,
            { current: null }
        );

        expect(result.text).toBe('');
        expect(result.work.results?.[STEPS.SYNTHESIS]).toEqual({ text: 'partial failure text', error: true });
    });

    it('should return synthesis sources when the final result includes them', async () => {
        const sources = [{ uri: 'https://source.test', title: 'Source' }];
        const synthesisStep: StepDescriptor = {
            ...mockStep(STEPS.SYNTHESIS),
            execute: vi.fn().mockResolvedValue({ text: 'Final with sources', sources })
        };
        const orchestrator = new SwarmOrchestrator(mockProvider, [synthesisStep]);

        const result = await orchestrator.runSwarm(
            createSettings(),
            'input',
            null,
            null,
            [],
            'id',
            vi.fn(),
            new AbortController().signal,
            { current: null }
        );

        expect(result.text).toBe('Final with sources');
        expect(result.sources).toBe(sources);
    });

    it('should return empty text when no synthesis result exists', async () => {
        const orchestrator = new SwarmOrchestrator(mockProvider, []);

        const result = await orchestrator.runSwarm(
            createSettings(),
            'input',
            null,
            null,
            [],
            'id',
            vi.fn(),
            new AbortController().signal,
            { current: null },
            undefined,
            undefined,
            undefined,
            {}
        );

        expect(result.text).toBe('');
        expect(result.sources).toBeUndefined();
    });

    it('should pass effective provider settings into step execution', async () => {
        const originalSettings = createSettings({ numAgents: 1 });
        const effectiveSettings = createSettings({ numAgents: 4 });
        const provider: AiProvider = {
            ...mockProvider,
            getEffectiveSettings: vi.fn(() => effectiveSettings)
        };
        let receivedSettings: AppSettings | undefined;
        const step: StepDescriptor = {
            ...mockStep(STEPS.INITIAL),
            execute: vi.fn(async (context) => {
                receivedSettings = context.settings;
                return ['effective'];
            })
        };
        const orchestrator = new SwarmOrchestrator(provider, [step]);

        await orchestrator.runSwarm(
            originalSettings,
            'input',
            null,
            null,
            [],
            'id',
            vi.fn(),
            new AbortController().signal,
            { current: null }
        );

        expect(provider.getEffectiveSettings).toHaveBeenCalledWith(originalSettings);
        expect(receivedSettings).toEqual(effectiveSettings);
    });

    it('should forward pause, status, and synthesis callbacks through StepRunner', async () => {
        const settings = createSettings({ pauseAfterInitial: true });
        const pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null> = { current: null };
        const onMessageUpdate = vi.fn();
        const onPause = vi.fn();
        const onStatusUpdate = vi.fn();
        const onSynthesisJump = vi.fn();
        const signal = new AbortController().signal;
        let receivedContext: StepContext | undefined;
        const step: StepDescriptor = {
            ...mockStep(STEPS.INITIAL),
            execute: vi.fn(async (context) => {
                receivedContext = context;
                context.onSynthesisJump?.();
                return ['draft'];
            })
        };
        const orchestrator = new SwarmOrchestrator(mockProvider, [step]);

        const runPromise = orchestrator.runSwarm(
            settings,
            'input',
            null,
            null,
            [],
            'message-id',
            onMessageUpdate,
            signal,
            pauseResolverRef,
            onPause,
            onStatusUpdate,
            onSynthesisJump
        );

        await vi.waitFor(() => {
            expect(onPause).toHaveBeenCalledTimes(1);
        });

        expect(onStatusUpdate).toHaveBeenCalledWith('Drafting initial responses...');
        expect(pauseResolverRef.current).toEqual(expect.any(Function));
        expect(receivedContext).toMatchObject({
            ai: mockProvider,
            settings,
            userInput: 'input',
            image: null,
            imageFile: null,
            history: [],
            messageId: 'message-id',
            signal,
            onMessageUpdate,
            onSynthesisJump,
        });
        expect(onSynthesisJump).toHaveBeenCalledTimes(1);

        pauseResolverRef.current?.();
        await expect(runPromise).resolves.toMatchObject({
            text: '',
            work: expect.objectContaining({
                results: expect.objectContaining({
                    [STEPS.INITIAL]: ['draft'],
                }),
            }),
        });
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

    it('should reject regeneration when the requested step is missing', async () => {
        const orchestrator = new SwarmOrchestrator(mockProvider, [mockStep(STEPS.INITIAL)]);

        await expect(orchestrator.regenerateResponse(
            createSettings(),
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
        )).rejects.toThrow('Step synthesis_step not found');
    });

    it('should reject regeneration when the step does not support regeneration', async () => {
        const orchestrator = new SwarmOrchestrator(mockProvider, [mockStep(STEPS.SYNTHESIS)]);

        await expect(orchestrator.regenerateResponse(
            createSettings(),
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
        )).rejects.toThrow('Step synthesis_step does not support regeneration');
    });
});
