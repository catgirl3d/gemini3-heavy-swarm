import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { useAgentStore } from '@/stores/agentStore';
import { createMockSettings } from '@test/settingsMocks';
import type { AppSettings, Message, Work } from '@/types';
import type { AiProvider } from '@/types/ai-provider';
import { STEPS, type StepContext, type StepDescriptor } from '@/types/steps';
import { getStepConfig } from '@/utils/swarm/stepConstants';

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  }
}));

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.getState().clear();
};

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  numAgents: 2,
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  debugMode: false,
  devMode: false,
  ...overrides,
});

const createProvider = (effectiveSettings?: AppSettings): AiProvider => ({
  name: 'test-provider',
  capabilities: {
    search: false,
    vision: false,
    reasoning: false,
    codeExecution: false,
  },
  isProxy: false,
  getEffectiveSettings: vi.fn((settings: AppSettings) => effectiveSettings ?? settings),
  getDefaultModel: vi.fn(() => 'test-model'),
  models: {
    generateContentStream: vi.fn(),
  },
});

const createStep = (stepId: typeof STEPS.INITIAL | typeof STEPS.REFINEMENT | typeof STEPS.SYNTHESIS, execute: StepDescriptor['execute'], regenerate?: StepDescriptor['regenerate']): StepDescriptor => ({
  id: stepId,
  name: getStepConfig(stepId).name,
  description: getStepConfig(stepId).description,
  execute,
  regenerate,
});

const createExistingWork = (overrides: Partial<Work> = {}): Work => ({
  results: {
    [STEPS.INITIAL]: ['done draft 1', 'done draft 2'],
    [STEPS.REFINEMENT]: ['', ''],
    [STEPS.SYNTHESIS]: [''],
  },
  stepMetadata: [
    { id: STEPS.INITIAL, status: 'done', label: getStepConfig(STEPS.INITIAL).name },
    { id: STEPS.SYNTHESIS, status: 'pending', label: getStepConfig(STEPS.SYNTHESIS).name },
  ],
  agentNames: ['Saved Agent 1', 'Saved Agent 2'],
  criticNames: ['Saved Critic 1', 'Saved Critic 2'],
  ...overrides,
});

describe('SwarmOrchestrator runSwarm contract and regeneration guards', () => {
  beforeEach(() => {
    resetAgentStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetAgentStore();
  });

  it('seeds live work arrays and agent names, then passes effective settings into step execution', async () => {
    const originalSettings = createSettings({ numAgents: 2 });
    const effectiveSettings = createSettings({ numAgents: 4 });
    const provider = createProvider(effectiveSettings);
    const initialStep = createStep(STEPS.INITIAL, vi.fn(async (context: StepContext) => {
      expect(context.settings).toBe(effectiveSettings);
      expect(context.work.results?.[STEPS.INITIAL]).toEqual(['', '']);
      expect(context.work.results?.[STEPS.REFINEMENT]).toEqual(['', '']);
      expect(context.work.results?.[STEPS.SYNTHESIS]).toEqual(['']);
      expect(context.work.agentNames).toHaveLength(2);
      expect(context.work.criticNames).toHaveLength(2);
      return ['draft 1', 'draft 2'];
    }));
    const orchestrator = new SwarmOrchestrator(provider, [initialStep]);

    const result = await orchestrator.runSwarm(
      originalSettings,
      'input',
      null,
      null,
      [],
      'message-1',
      vi.fn(),
      new AbortController().signal,
    );

    expect(provider.getEffectiveSettings).toHaveBeenCalledWith(originalSettings);
    expect(initialStep.execute).toHaveBeenCalledTimes(1);
    expect(result.paused).toBe(false);
    expect(result.work.results?.[STEPS.INITIAL]).toEqual(['draft 1', 'draft 2']);
    expect(result.work.results?.[STEPS.REFINEMENT]).toEqual(['', '']);
    expect(result.work.results?.[STEPS.SYNTHESIS]).toEqual(['']);
  });

  it('reuses existing work and lets StepRunner skip completed real step ids', async () => {
    const provider = createProvider();
    const initialStep = createStep(STEPS.INITIAL, vi.fn().mockResolvedValue(['should not run']));
    const synthesisStep = createStep(STEPS.SYNTHESIS, vi.fn(async (context: StepContext) => {
      expect(context.work.agentNames).toEqual(['Saved Agent 1', 'Saved Agent 2']);
      expect(context.work.criticNames).toEqual(['Saved Critic 1', 'Saved Critic 2']);
      expect(context.work.results?.[STEPS.INITIAL]).toEqual(['done draft 1', 'done draft 2']);
      return ['resumed final'];
    }));
    const orchestrator = new SwarmOrchestrator(provider, [initialStep, synthesisStep]);
    const existingWork = createExistingWork();

    const result = await orchestrator.runSwarm(
      createSettings(),
      'input',
      null,
      null,
      [],
      'message-1',
      vi.fn(),
      new AbortController().signal,
      undefined,
      undefined,
      undefined,
      undefined,
      existingWork,
    );

    expect(initialStep.execute).not.toHaveBeenCalled();
    expect(synthesisStep.execute).toHaveBeenCalledTimes(1);
    expect(result.work.results?.[STEPS.SYNTHESIS]).toEqual(['resumed final']);
    expect(result.work.agentNames).toEqual(['Saved Agent 1', 'Saved Agent 2']);
    expect(result.work.criticNames).toEqual(['Saved Critic 1', 'Saved Critic 2']);
  });

  it('forwards message update, pause, status, retry, and synthesis callbacks into the runner context', async () => {
    const provider = createProvider();
    const onMessageUpdate = vi.fn();
    const onPause = vi.fn();
    const onStatusUpdate = vi.fn();
    const onSynthesisJump = vi.fn();
    const onRetryProgress = vi.fn();
    const signal = new AbortController().signal;
    const initialStep = createStep(STEPS.INITIAL, vi.fn(async (context: StepContext) => {
      expect(context.onMessageUpdate).toBe(onMessageUpdate);
      expect(context.onSynthesisJump).toBe(onSynthesisJump);
      expect(context.onRetryProgress).toBe(onRetryProgress);
      expect(context.signal).toBe(signal);
      context.onSynthesisJump?.();
      return ['draft 1', 'draft 2'];
    }));
    const orchestrator = new SwarmOrchestrator(provider, [initialStep]);

    const result = await orchestrator.runSwarm(
      createSettings({ pauseAfterInitial: true }),
      'input',
      null,
      null,
      [] as Message[],
      'message-1',
      onMessageUpdate,
      signal,
      onPause,
      onStatusUpdate,
      onSynthesisJump,
      onRetryProgress,
    );

    expect(result.paused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onStatusUpdate).toHaveBeenCalledWith(getStepConfig(STEPS.INITIAL).progressMsg);
    expect(onSynthesisJump).toHaveBeenCalledTimes(1);
  });

  it('rejects regeneration when the requested real step is missing or non-regenerable', async () => {
    const provider = createProvider();
    const work = createExistingWork();

    await expect(new SwarmOrchestrator(provider, [createStep(STEPS.INITIAL, vi.fn())]).regenerateResponse(
      createSettings(),
      'input',
      null,
      null,
      [],
      'message-1',
      0,
      STEPS.SYNTHESIS,
      work,
      [],
      vi.fn(),
      new AbortController().signal,
    )).rejects.toThrow(`Step ${STEPS.SYNTHESIS} not found`);

    await expect(new SwarmOrchestrator(provider, [createStep(STEPS.SYNTHESIS, vi.fn())]).regenerateResponse(
      createSettings(),
      'input',
      null,
      null,
      [],
      'message-1',
      0,
      STEPS.SYNTHESIS,
      work,
      [],
      vi.fn(),
      new AbortController().signal,
    )).rejects.toThrow(`Step ${STEPS.SYNTHESIS} does not support regeneration`);
  });
});
