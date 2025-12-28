import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepRunner } from './StepRunner';
import { StepDescriptor, StepContext } from '@/types/steps';
import { Work, AppSettings, AgentState } from '@/types';

// Mock getStepConfig to control pause logic in tests
vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn((id: string) => {
    if (id === 'pausable-step') {
      return { allowPause: true, pauseSettingKey: 'pauseAfterInitial' };
    }
    return null;
  }),
}));

// Mock Logger to avoid console noise
vi.mock('@shared/utils/logger', () => {
  return {
    Logger: class {
      debug = vi.fn();
      info = vi.fn();
      warn = vi.fn();
      error = vi.fn();
    },
  };
});

describe('StepRunner', () => {
  let mockWork: Work;
  let mockSettings: AppSettings;
  let mockOnProgress: any;
  let pauseResolverRef: { current: any };

  beforeEach(() => {
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

    mockOnProgress = vi.fn();
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
      onProgress: mockOnProgress,
      abortController: new AbortController()
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

  it('should handle pause logic when enabled', async () => {
    const pausableStep: StepDescriptor = {
      id: 'pausable-step' as any,
      name: 'Pausable Step',
      execute: vi.fn().mockResolvedValue('done')
    };
    
    // Enable pause in settings
    mockSettings.pauseAfterInitial = true;

    const runner = new StepRunner([pausableStep]);
    const context: StepContext = {
      work: mockWork,
      settings: mockSettings,
      onProgress: mockOnProgress,
      abortController: new AbortController()
    } as any;

    // Start runner - it should hit the pause (awaiting promise)
    const runPromise = runner.run(context, pauseResolverRef);

    // Wait a bit to ensure it reached the pause point
    await new Promise(r => setTimeout(r, 10));

    expect(pauseResolverRef.current).toBeDefined();
    expect(mockOnProgress).toHaveBeenCalledWith(
      expect.stringContaining('Paused'),
      expect.any(Array),
      expect.any(Object),
      true // isPaused
    );

    // Resolve the pause
    pauseResolverRef.current();
    const finalWork = await runPromise;

    expect(finalWork.results['pausable-step']).toBe('done');
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
      onProgress: mockOnProgress,
      abortController: new AbortController()
    } as any;

    await expect(runner.run(context, pauseResolverRef)).rejects.toThrow('Step failed');
  });
});
