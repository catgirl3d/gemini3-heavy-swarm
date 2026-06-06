import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StepRunner } from '@/services/swarm/StepRunner';
import { useAgentStore } from '@/stores/agentStore';
import { createMockSettings } from '@test/settingsMocks';
import type { AgentState, AppSettings, Message, Work } from '@/types';
import { AppError, ErrorCode } from '@/utils/errors/AppError';
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
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const createWork = (overrides: Partial<Work> = {}): Work => ({
  results: {},
  stepMetadata: [],
  agentStates: [],
  ...overrides,
});

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  numAgents: 2,
  pauseAfterInitial: false,
  pauseAfterRefinement: false,
  debugMode: false,
  ...overrides,
});

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'done',
  label: 'Drafted',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'message-1',
  ...overrides,
});

const createContext = ({
  work = createWork(),
  settings = createSettings(),
  messageId = 'message-1',
}: {
  work?: Work;
  settings?: AppSettings;
  messageId?: string;
} = {}): StepContext => ({
  ai: null,
  settings,
  history: [] as Message[],
  userInput: 'Test input',
  image: null,
  imageFile: null,
  work,
  onMessageUpdate: vi.fn(),
  signal: new AbortController().signal,
  messageId,
});

const createStep = (stepId: typeof STEPS.INITIAL | typeof STEPS.REFINEMENT | typeof STEPS.SYNTHESIS, execute: StepDescriptor['execute']): StepDescriptor => ({
  id: stepId,
  name: getStepConfig(stepId).name,
  description: getStepConfig(stepId).description,
  execute,
});

describe('StepRunner', () => {
  beforeEach(() => {
    resetAgentStore();
    vi.clearAllMocks();
  });

  it('stores step results, emits the real progress message, and marks the step metadata done', async () => {
    const initialStep = createStep(STEPS.INITIAL, vi.fn().mockResolvedValue(['draft 1', 'draft 2']));
    const onStatusUpdate = vi.fn();
    const runner = new StepRunner([initialStep]);
    const context = createContext();

    const { work, paused } = await runner.run(context, undefined, onStatusUpdate);

    expect(initialStep.execute).toHaveBeenCalledTimes(1);
    expect(onStatusUpdate).toHaveBeenCalledWith(getStepConfig(STEPS.INITIAL).progressMsg);
    expect(paused).toBe(false);
    expect(work.results?.[STEPS.INITIAL]).toEqual(['draft 1', 'draft 2']);
    expect(work.stepMetadata).toEqual([
      { id: STEPS.INITIAL, status: 'done', label: getStepConfig(STEPS.INITIAL).name },
    ]);
  });

  it('pauses after the real initial step when pauseAfterInitial is enabled and syncs session work to the store', async () => {
    const initialStep = createStep(STEPS.INITIAL, vi.fn().mockResolvedValue(['draft 1', 'draft 2']));
    const runner = new StepRunner([initialStep]);
    const context = createContext({
      settings: createSettings({ pauseAfterInitial: true }),
      work: createWork({
        results: {
          [STEPS.INITIAL]: ['', ''],
        },
      }),
    });
    const onPause = vi.fn();

    const result = await runner.run(context, onPause);

    expect(result.paused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(result.work.results?.[STEPS.INITIAL]).toEqual(['draft 1', 'draft 2']);

    const session = useAgentStore.getState().sessionsByMessageId[context.messageId];
    expect(session?.work.results?.[STEPS.INITIAL]).toEqual(['draft 1', 'draft 2']);
    expect(session?.work.stepMetadata).toEqual([
      { id: STEPS.INITIAL, status: 'done', label: getStepConfig(STEPS.INITIAL).name },
    ]);
  });

  it('resumes from the live session snapshot, skips completed steps, and gives downstream steps the latest work and agent states', async () => {
    const liveAgents: AgentState[] = [
      createAgent(),
      createAgent({ id: 'agent-2', name: 'Agent 2', agentIndex: 1, label: 'Drafted', messageId: 'message-1' }),
    ];
    const storeWork = createWork({
      results: {
        [STEPS.INITIAL]: ['store draft 1', 'store draft 2'],
      },
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done', label: getStepConfig(STEPS.INITIAL).name },
      ],
    });
    useAgentStore.getState().startSession('message-1', storeWork, { activate: false, phase: 'running' });
    useAgentStore.getState().replaceSessionAgents('message-1', liveAgents);

    const initialStep = createStep(STEPS.INITIAL, vi.fn().mockResolvedValue(['should not run']));
    const refinementStep = createStep(STEPS.REFINEMENT, vi.fn().mockImplementation(async (context) => {
      expect(context.work.results?.[STEPS.INITIAL]).toEqual(['store draft 1', 'store draft 2']);
      expect(context.work.agentStates).toEqual(liveAgents);
      return ['refined 1', 'refined 2'];
    }));
    const runner = new StepRunner([initialStep, refinementStep]);
    const staleContextWork = createWork({
      results: {
        [STEPS.INITIAL]: ['stale local draft'],
      },
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done', label: 'Stale Label' },
      ],
    });

    const { work, paused } = await runner.run(createContext({ work: staleContextWork }));

    expect(paused).toBe(false);
    expect(initialStep.execute).not.toHaveBeenCalled();
    expect(refinementStep.execute).toHaveBeenCalledTimes(1);
    expect(work.results?.[STEPS.INITIAL]).toEqual(['store draft 1', 'store draft 2']);
    expect(work.results?.[STEPS.REFINEMENT]).toEqual(['refined 1', 'refined 2']);
    expect(work.stepMetadata).toEqual([
      { id: STEPS.INITIAL, status: 'done', label: getStepConfig(STEPS.INITIAL).name },
      { id: STEPS.REFINEMENT, status: 'done', label: getStepConfig(STEPS.REFINEMENT).name },
    ]);
  });

  it('does not persist a failed step as done or leak its local mutations into the live session snapshot', async () => {
    const initialStep = createStep(STEPS.INITIAL, vi.fn().mockResolvedValue(['draft 1', 'draft 2']));
    const refinementError = new Error('Critic step failed');
    const refinementStep = createStep(STEPS.REFINEMENT, vi.fn().mockImplementation(async (context) => {
      if (!context.work.results) {
        context.work.results = {};
      }
      context.work.results[STEPS.REFINEMENT] = ['dirty refinement'];
      context.work.stepMetadata = [
        ...(context.work.stepMetadata ?? []),
        { id: STEPS.REFINEMENT, status: 'done', label: 'Dirty refinement' },
      ];
      throw refinementError;
    }));
    const runner = new StepRunner([initialStep, refinementStep]);
    const context = createContext();

    await expect(runner.run(context)).rejects.toBe(refinementError);

    expect(context.work.results?.[STEPS.INITIAL]).toEqual(['draft 1', 'draft 2']);
    expect(context.work.results?.[STEPS.REFINEMENT]).toEqual(['dirty refinement']);

    const session = useAgentStore.getState().sessionsByMessageId[context.messageId];
    expect(session?.work.results?.[STEPS.INITIAL]).toEqual(['draft 1', 'draft 2']);
    expect(session?.work.results?.[STEPS.REFINEMENT]).toBeUndefined();
    expect(session?.work.stepMetadata).toEqual([
      { id: STEPS.INITIAL, status: 'done', label: getStepConfig(STEPS.INITIAL).name },
    ]);
  });

  it('rethrows aborted step errors without leaving a false done status or dirty session work', async () => {
    const abortedError = new AppError('Aborted', ErrorCode.ABORTED);
    const initialStep = createStep(STEPS.INITIAL, vi.fn().mockImplementation(async (context) => {
      if (!context.work.results) {
        context.work.results = {};
      }
      context.work.results[STEPS.INITIAL] = ['partial draft'];
      context.work.stepMetadata = [{ id: STEPS.INITIAL, status: 'done', label: 'Incorrect done' }];
      throw abortedError;
    }));
    const runner = new StepRunner([initialStep]);
    const context = createContext({
      work: createWork({
        results: {
          [STEPS.INITIAL]: ['', ''],
        },
      }),
    });

    await expect(runner.run(context)).rejects.toBe(abortedError);

    const session = useAgentStore.getState().sessionsByMessageId[context.messageId];
    expect(session?.work.results?.[STEPS.INITIAL]).toEqual(['', '']);
    expect(session?.work.stepMetadata).toEqual([]);
  });
});
