import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepRunner } from '@/services/swarm/StepRunner';
import { StepDescriptor, StepContext } from '@/types/steps';
import { Work, AppSettings } from '@/types';
import { useAgentStore } from '@/stores/agentStore';

// Mock getStepConfig to control labels and pause logic
vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn((id: string) => {
    if (id === 'pausable-step') {
      return { 
        allowPause: true, 
        pauseSettingKey: 'pauseAfterInitial',
        progressMsg: 'Pausable Progress'
      };
    }
    return {
      progressMsg: `Progress for ${id}`
    };
  }),
}));

// Mock Logger to avoid console noise
vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

// Mock AgentStore
vi.mock('@/stores/agentStore', () => ({
  useAgentStore: {
    getState: vi.fn(() => ({
      replaceSessionWork: vi.fn(),
      sessionsByMessageId: {},
    }))
  }
}));

describe('StepRunner', () => {
  let mockWork: Work;
  let mockSettings: AppSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockWork = {
      id: 'test-work',
      results: {},
      stepMetadata: [],
      agentStates: []
    } as unknown as Work;

    mockSettings = {
      debugMode: false,
      numAgents: 3,
      pauseAfterInitial: false,
    } as unknown as AppSettings;
  });

  it('should execute steps in sequence and store results', async () => {
    const step1: StepDescriptor = {
      id: 'step1' as any,
      name: 'Step 1',
      execute: vi.fn().mockResolvedValue('result1')
    };
    const step2: StepDescriptor = {
      id: 'step2' as any,
      name: 'Step 2',
      execute: vi.fn().mockResolvedValue('result2')
    };

    const runner = new StepRunner([step1, step2]);
    const context: StepContext = {
      work: mockWork,
      settings: mockSettings,
      onMessageUpdate: vi.fn(),
      signal: new AbortController().signal
    } as any;

    const { work: finalWork } = await runner.run(context);

    expect(step1.execute).toHaveBeenCalled();
    expect(step2.execute).toHaveBeenCalled();
    expect(finalWork.results).toEqual({
      step1: 'result1',
      step2: 'result2'
    });
    expect(finalWork.stepMetadata).toHaveLength(2);
    expect(finalWork.stepMetadata?.[0].status).toBe('done');
  });

  it('should notify UI status updates with correct labels', async () => {
    const step = {
      id: 'step1' as any,
      name: 'Step 1',
      execute: vi.fn().mockResolvedValue('done')
    };
    
    const onStatusUpdate = vi.fn();
    const runner = new StepRunner([step as any]);
    const context = { 
      work: mockWork, 
      settings: mockSettings, 
      signal: new AbortController().signal 
    } as any;

    await runner.run(context, undefined, onStatusUpdate);

    // Should call with progressMsg from config
    expect(onStatusUpdate).toHaveBeenCalledWith('Progress for step1');
  });

  it('should persist step completion into the owning session', async () => {
    const step = {
      id: 'step1' as any,
      name: 'Step 1',
      execute: vi.fn().mockResolvedValue('done')
    };
    
    const replaceSessionWorkMock = vi.fn();
    (useAgentStore.getState as any).mockReturnValue({
      replaceSessionWork: replaceSessionWorkMock,
      sessionsByMessageId: {},
    });

    const runner = new StepRunner([step as any]);
    const context = { 
      work: mockWork, 
      settings: mockSettings, 
      messageId: 'msg-1',
      signal: new AbortController().signal 
    } as any;

    await runner.run(context);

    expect(replaceSessionWorkMock).toHaveBeenCalled();
    const lastCallWork = replaceSessionWorkMock.mock.calls.at(-1)?.[1];
    expect(lastCallWork.results.step1).toBe('done');
  });

  it('should initialize and update stepMetadata correctly', async () => {
    const step = {
      id: 'step1' as any,
      name: 'Step 1',
      execute: vi.fn().mockResolvedValue('done')
    };
    
    // Test updating existing metadata (e.g. from a previous retry attempt)
    mockWork.stepMetadata = [{ id: 'step1' as any, status: 'error', label: 'Old' }];

    const runner = new StepRunner([step as any]);
    const context = { 
      work: mockWork, 
      settings: mockSettings, 
      signal: new AbortController().signal 
    } as any;

    const { work: finalWork } = await runner.run(context);

    expect(finalWork.stepMetadata).toHaveLength(1);
    expect(finalWork.stepMetadata?.[0].status).toBe('done');
    expect(finalWork.stepMetadata?.[0].id).toBe('step1');
  });

  it('should handle pause logic and trigger onPause callback', async () => {
    const pausableStep: StepDescriptor = {
      id: 'pausable-step' as any,
      name: 'Pausable Step',
      execute: vi.fn().mockResolvedValue('done')
    };
    
    mockSettings.pauseAfterInitial = true;
    const onPause = vi.fn();

    const runner = new StepRunner([pausableStep]);
    const context = {
      work: mockWork,
      settings: mockSettings,
      signal: new AbortController().signal
    } as any;

    const result = await runner.run(context, onPause);

    expect(onPause).toHaveBeenCalled();
    expect(result.paused).toBe(true);
    expect(result.work.results?.['pausable-step']).toBe('done');
  });

  it('should throw if a step fails', async () => {
    const failingStep: StepDescriptor = {
      id: 'fail' as any,
      name: 'Fail',
      execute: vi.fn().mockRejectedValue(new Error('Step failed'))
    };

    const runner = new StepRunner([failingStep]);
    const context: StepContext = {
      work: mockWork,
      settings: mockSettings,
      onMessageUpdate: vi.fn(),
      signal: new AbortController().signal
    } as any;

    await expect(runner.run(context)).rejects.toThrow('Step failed');
  });

  it('should skip steps that are already marked as done (Resume logic)', async () => {
    const step1: StepDescriptor = {
      id: 'step1' as any,
      name: 'Step 1',
      execute: vi.fn().mockResolvedValue('result1')
    };
    const step2: StepDescriptor = {
      id: 'step2' as any,
      name: 'Step 2',
      execute: vi.fn().mockResolvedValue('result2')
    };

    // Mark step1 as done in metadata
    mockWork.stepMetadata = [{ id: 'step1' as any, status: 'done', label: 'Step 1' }];
    mockWork.results = { step1: 'existing-result' };

    const runner = new StepRunner([step1, step2]);
    const context: StepContext = {
      work: mockWork,
      settings: mockSettings,
      onMessageUpdate: vi.fn(),
      signal: new AbortController().signal
    } as any;

    const { work: finalWork } = await runner.run(context);

    // Step 1 should NOT be executed
    expect(step1.execute).not.toHaveBeenCalled();
    // Step 2 SHOULD be executed
    expect(step2.execute).toHaveBeenCalled();

    expect(finalWork.results).toEqual({
      step1: 'existing-result',
      step2: 'result2'
    });
    expect(finalWork.stepMetadata).toHaveLength(2);
    expect(finalWork.stepMetadata?.find(m => m.id === 'step1')?.status).toBe('done');
    expect(finalWork.stepMetadata?.find(m => m.id === 'step2')?.status).toBe('done');
  });

  it('initializes missing work containers, falls back to step.name for status, and pauses without onPause callback', async () => {
    const step: StepDescriptor = {
      id: 'name-fallback-step' as any,
      name: 'Name Fallback Step',
      execute: vi.fn().mockResolvedValue('done')
    };
    const { getStepConfig } = await import('@/utils/swarm/stepConstants');
    vi.mocked(getStepConfig).mockImplementation((id: string) => {
      if (id === 'name-fallback-step') {
        return {
          allowPause: true,
          pauseSettingKey: 'pauseAfterInitial',
        } as any;
      }

      return {
        progressMsg: `Progress for ${id}`
      } as any;
    });

    const runner = new StepRunner([step]);
    const onStatusUpdate = vi.fn();
    const context = {
      work: { id: 'test-work' },
      settings: { ...mockSettings, pauseAfterInitial: true },
      signal: new AbortController().signal
    } as any;

    const result = await runner.run(context, undefined, onStatusUpdate);

    expect(onStatusUpdate).toHaveBeenCalledWith('Name Fallback Step');
    expect(result.paused).toBe(true);
    const finalWork = result.work;

    expect(finalWork.results).toEqual({ 'name-fallback-step': 'done' });
    expect(finalWork.stepMetadata).toEqual([
      { id: 'name-fallback-step', status: 'done', label: 'Name Fallback Step' }
    ]);
  });

  it('resumes from the latest persisted work snapshot on a new run after pause', async () => {
    const { getStepConfig } = await import('@/utils/swarm/stepConstants');
    vi.mocked(getStepConfig).mockImplementation((id: string) => {
      if (id === 'pausable-step') {
        return {
          allowPause: true,
          pauseSettingKey: 'pauseAfterInitial',
          progressMsg: 'Pausable Progress'
        } as any;
      }

      return {
        progressMsg: `Progress for ${id}`
      } as any;
    });

    const pausableStep: StepDescriptor = {
      id: 'pausable-step' as any,
      name: 'Pausable Step',
      execute: vi.fn().mockResolvedValue('done')
    };
    const step2: StepDescriptor = {
      id: 'step2' as any,
      name: 'Step 2',
      execute: vi.fn().mockImplementation(async (context: StepContext) => {
        return context.work.results?.regenerated;
      })
    };

    mockSettings.pauseAfterInitial = true;
    const liveStoreState = {
      replaceSessionWork: vi.fn(),
      sessionsByMessageId: {},
    };
    (useAgentStore.getState as any).mockImplementation(() => liveStoreState);

    const runner = new StepRunner([pausableStep, step2]);
    const context: StepContext = {
      work: mockWork,
      settings: mockSettings,
      messageId: 'msg-1',
      signal: new AbortController().signal,
    } as any;

    const firstRun = await runner.run(context);
    expect(firstRun.paused).toBe(true);

    liveStoreState.sessionsByMessageId = {
      'msg-1': {
        work: {
          ...mockWork,
          results: {
            ...mockWork.results,
            'pausable-step': 'done',
            regenerated: 'latest refinement',
          },
          stepMetadata: [{ id: 'pausable-step', status: 'done', label: 'Pausable Step' } as any],
        },
      },
    };

    const resumedContext: StepContext = {
      ...context,
      work: firstRun.work,
    };
    const { work: finalWork, paused } = await runner.run(resumedContext);

    expect(step2.execute).toHaveBeenCalledTimes(1);
    expect(paused).toBe(false);
    expect(finalWork.results).toEqual(expect.objectContaining({
      regenerated: 'latest refinement',
      step2: 'latest refinement',
    }));
  });
});
