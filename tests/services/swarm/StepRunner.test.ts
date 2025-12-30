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
      setCurrentWork: vi.fn(),
      updateWorkResult: vi.fn(),
      setIsPaused: vi.fn(),
      setLoadingStatus: vi.fn(),
      setIsLoading: vi.fn()
    }))
  }
}));

describe('StepRunner', () => {
  let mockWork: Work;
  let mockSettings: AppSettings;
  let pauseResolverRef: { current: any };

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

    pauseResolverRef = { current: null };
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

    const finalWork = await runner.run(context, pauseResolverRef);

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

    await runner.run(context, pauseResolverRef, undefined, onStatusUpdate);

    // Should call with progressMsg from config
    expect(onStatusUpdate).toHaveBeenCalledWith('Progress for step1');
  });

  it('should update global store Work status after each step', async () => {
    const step = {
      id: 'step1' as any,
      name: 'Step 1',
      execute: vi.fn().mockResolvedValue('done')
    };
    
    const setCurrentWorkMock = vi.fn();
    (useAgentStore.getState as any).mockReturnValue({
      setCurrentWork: setCurrentWorkMock
    });

    const runner = new StepRunner([step as any]);
    const context = { 
      work: mockWork, 
      settings: mockSettings, 
      signal: new AbortController().signal 
    } as any;

    await runner.run(context, pauseResolverRef);

    // Verify SYNC call to store
    expect(setCurrentWorkMock).toHaveBeenCalled();
    // Ensure the work object passed to store has the results
    const lastCallWork = setCurrentWorkMock.mock.calls[0][0];
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

    const finalWork = await runner.run(context, pauseResolverRef);

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

    const runPromise = runner.run(context, pauseResolverRef, onPause);

    // Wait for internal async pause jump
    await new Promise(r => setTimeout(r, 0));

    expect(onPause).toHaveBeenCalled();
    expect(pauseResolverRef.current).toBeDefined();

    // Resume
    pauseResolverRef.current();
    await runPromise;

    expect(mockWork.results['pausable-step']).toBe('done');
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

    await expect(runner.run(context, pauseResolverRef)).rejects.toThrow('Step failed');
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

    const finalWork = await runner.run(context, pauseResolverRef);

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
});
