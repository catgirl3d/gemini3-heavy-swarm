import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const loggerSpies = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = loggerSpies.debug;
    info = loggerSpies.info;
    warn = loggerSpies.warn;
    error = loggerSpies.error;
  },
}));

import { BaseStep } from '@/services/swarm/steps/BaseStep';
import { StepId, STEPS, Work, AgentState, TokenUsage, Source } from '@/types';
import { AppSettings } from '@/types';
import { type StepContext, type StreamCallbacks, type StreamConfig, type StreamResult } from '@/types/steps';
import { GroundingChunk } from '@google/genai';
import { useAgentStore } from '@/stores/agentStore';
import { AppError, ErrorCode } from '@/utils/errors/AppError';

// Mock dependencies
vi.mock('@/stores/agentStore', () => {
  const mockState = {
    updateSessionRuntime: vi.fn(),
    updateSessionWorkResult: vi.fn(),
    replaceSessionWork: vi.fn(),
  };
  const useAgentStore = vi.fn(() => mockState);
  (useAgentStore as any).getState = vi.fn(() => mockState);
  return { useAgentStore };
});

vi.mock('@/utils/swarm/statusHelpers', () => ({
  updateAgentStatus: vi.fn(),
  updateAgentStatusIfChanged: vi.fn()
}));

vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn(() => ({
    name: 'Test Step',
    labels: {
      working: 'Working...',
      done: 'Done',
      error: 'Error'
    },
    progressMsg: 'In progress...'
  })),
  STEPS: {
    INITIAL: 'initial_step',
    REFINEMENT: 'refinement_step',
    SYNTHESIS: 'synthesis_step'
  }
}));

vi.mock('@/services/swarm/steps/utils/agentStateUtils', () => ({
  createAgentStates: vi.fn((num, settings, config) => Array(num).fill(0).map((_, i) => ({ 
    id: `${i}`, 
    name: `Agent ${i+1}`, 
    status: config.status,
    label: config.statusLabel,
    stepId: config.stepId,
    messageId: config.messageId
  }))),
  updateAgentState: vi.fn((states, index, updates) => {
    const newStates = [...states];
    if (newStates[index]) {
      newStates[index] = { ...newStates[index], ...updates };
    }
    return newStates;
  }),
  updateAgentStateById: vi.fn((states, id, updates) => {
    return states.map((s: any) => s.id === id ? { ...s, ...updates } : s);
  })
}));

/**
 * Concrete implementation of BaseStep for testing purposes
 */
class TestStep extends BaseStep {
  id: StepId = STEPS.INITIAL;
  name = 'Test Step';
  description = 'Test step for unit testing';
  ui = { visibleInModal: true };

  async execute(_context: StepContext): Promise<unknown> {
    return 'test result';
  }

  async regenerate(_context: StepContext, _agentIndex: number, _agentStates: AgentState[]): Promise<unknown> {
    return 'regenerated result';
  }

  public testGetRoleModel(context: StepContext, agentIndex: number, roleType: 'roles' | 'criticRoles'): string {
    return this.getRoleModel(context, agentIndex, roleType);
  }

  public testGetStepModel(context: StepContext): string {
    return this.getStepModel(context);
  }

  public testHandleStreamChunk(
    context: StepContext,
    index: number,
    text: string,
    thought: string,
    usage: TokenUsage | null,
    options: {
      statusMsg?: string;
      agentStates?: AgentState[];
      localResults?: string[];
      isFirstChunk?: boolean;
      streamToMessage?: boolean;
    }
  ): void {
    this.handleStreamChunk(context, index, text, thought, usage, options);
  }

  public testEnsureResults(work: StepContext['work']): void {
    this.ensureResults(work);
  }

  public testGetErrorCountKey(): string {
    return this.getErrorCountKey();
  }

  public testEnsureStepUsage(work: Work, stepId: StepId, numAgents: number): unknown[] {
    return this.ensureStepUsage(work, stepId, numAgents);
  }

  public testExtractSources(groundingChunks: GroundingChunk[]): Source[] | undefined {
    return this.extractSources(groundingChunks);
  }

  public testCreateAgentStates(numAgents: number, settings: AppSettings, config: any): AgentState[] {
    return this.createAgentStates(numAgents, settings, config);
  }

  public testUpdateAgentState(states: AgentState[], index: number, updates: Partial<AgentState>): AgentState[] {
    return this.updateAgentState(states, index, updates);
  }

  public testProcessSettledOutcomes(
    context: StepContext,
    outcomes: PromiseSettledResult<string>[],
    results: string[],
    agentStates: AgentState[]
  ): { updatedStates: AgentState[]; failures: unknown[] } {
    return this.processSettledOutcomes(context, outcomes, results, agentStates);
  }

  public async testRunModelStream(config: StreamConfig, callbacks: StreamCallbacks): Promise<StreamResult> {
    return this.runModelStream(config, callbacks);
  }

  public testHandleRetryProgress(context: StepContext, index: number, attempt: number, states: AgentState[]): AgentState[] {
    return this.handleRetryProgress(context, index, attempt, states);
  }

  public testFinalizeStep(context: StepContext, results: string[], agentStates: AgentState[], failures: unknown[]): string[] {
    return this.finalizeStep(context, results, agentStates, failures);
  }

  public testExecuteMultiAgent(context: StepContext, config: any): Promise<string[]> {
    return this.executeMultiAgent(context, config);
  }

  public testRunAgentRegeneration(
    context: StepContext,
    agentIndex: number,
    instruction: any,
    agentStates: AgentState[],
    roleType?: 'roles' | 'criticRoles',
    tools?: any[],
    onFirstTextChunk?: () => void,
    simulateError?: any,
    simulateErrorAttempts?: number
  ): Promise<{ text: string; work: Work; groundingChunks?: GroundingChunk[] }> {
    return this.runAgentRegeneration(
      context,
      agentIndex,
      instruction,
      agentStates,
      roleType,
      tools,
      onFirstTextChunk,
      simulateError,
      simulateErrorAttempts
    );
  }

}

class RetryCallbackStep extends TestStep {
  protected async runModelStream(_config: StreamConfig, callbacks: StreamCallbacks): Promise<StreamResult> {
    callbacks.onChunk('', '', null);
    callbacks.onRetry?.(2, new AppError('retry failed', ErrorCode.NETWORK_ERROR));
    callbacks.onChunk('retried text', '', null);
    return { text: 'retried text', thought: '', usage: null, groundingChunks: [] };
  }
}

describe('BaseStep', () => {
  let step: TestStep;

  beforeEach(() => {
    vi.clearAllMocks();
    step = new TestStep();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRoleModel', () => {
    it('should return role model when role has model defined (highest priority)', () => {
      const context = {
        settings: {
          model: 'global-model',
          initialModel: 'step-model',
          roleProfiles: [{
            id: 'profile-1',
            roles: [
              { name: 'Agent 1', model: 'role-specific-model' }
            ]
          }],
          activeRoleProfileId: 'profile-1'
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetRoleModel(context, 0, 'roles');

      expect(result).toBe('role-specific-model');
    });

    it('should return step model when role has no model defined', () => {
      const context = {
        settings: {
          model: 'global-model',
          initialModel: 'step-model',
          roleProfiles: [{
            id: 'profile-1',
            roles: [
              { name: 'Agent 1' } // no model
            ]
          }],
          activeRoleProfileId: 'profile-1'
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetRoleModel(context, 0, 'roles');

      expect(result).toBe('step-model');
    });

    it('should return global model when no step model and no role model defined', () => {
      const context = {
        settings: {
          model: 'global-model',
          roleProfiles: [{
            id: 'profile-1',
            roles: [
              { name: 'Agent 1' } // no model
            ]
          }],
          activeRoleProfileId: 'profile-1'
        } as AppSettings,
        ai: {
          getDefaultModel: (settings: AppSettings) => settings.model
        } as any
      } as StepContext;

      const result = step.testGetRoleModel(context, 0, 'roles');

      expect(result).toBe('global-model');
    });

    it('should return step model when no role profiles exist', () => {
      const context = {
        settings: {
          model: 'global-model',
          initialModel: 'step-model',
          roleProfiles: []
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetRoleModel(context, 0, 'roles');

      expect(result).toBe('step-model');
    });

    it('should use first profile when activeRoleProfileId does not match', () => {
      const context = {
        settings: {
          model: 'global-model',
          initialModel: 'step-model',
          roleProfiles: [
            {
              id: 'profile-1',
              roles: [{ name: 'Agent 1', model: 'fallback-model' }]
            }
          ],
          activeRoleProfileId: 'non-existent-id'
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetRoleModel(context, 0, 'roles');

      expect(result).toBe('fallback-model');
    });

    it('should handle criticRoles correctly', () => {
      const context = {
        settings: {
          model: 'global-model',
          refinementModel: 'refinement-step-model',
          roleProfiles: [{
            id: 'profile-1',
            criticRoles: [
              { name: 'Critic 1', model: 'critic-role-model' }
            ]
          }],
          activeRoleProfileId: 'profile-1'
        } as AppSettings,
        ai: null
      } as StepContext;

      step.id = STEPS.REFINEMENT; // Switch to refinement step

      const result = step.testGetRoleModel(context, 0, 'criticRoles');

      expect(result).toBe('critic-role-model');
    });

    it('should cycle role models when role index is out of bounds', () => {
      const context = {
        settings: {
          model: 'global-model',
          initialModel: 'step-model',
          roleProfiles: [{
            id: 'profile-1',
            roles: [
              { name: 'Agent 1', model: 'role-1-model' }
            ]
          }],
          activeRoleProfileId: 'profile-1'
        } as AppSettings,
        ai: null
      } as StepContext;

      // Request agent index 1, but only 1 role exists, so it cycles to index 0.
      const result = step.testGetRoleModel(context, 1, 'roles');

      expect(result).toBe('role-1-model');
    });
  });

  describe('getStepModel', () => {
    it('should return initialModel for INITIAL step', () => {
      step.id = STEPS.INITIAL;
      const context = {
        settings: {
          model: 'global-model',
          initialModel: 'initial-model'
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetStepModel(context);

      expect(result).toBe('initial-model');
    });

    it('should return refinementModel for REFINEMENT step', () => {
      step.id = STEPS.REFINEMENT;
      const context = {
        settings: {
          model: 'global-model',
          refinementModel: 'refinement-model'
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetStepModel(context);

      expect(result).toBe('refinement-model');
    });

    it('should return synthesisModel for SYNTHESIS step', () => {
      step.id = STEPS.SYNTHESIS;
      const context = {
        settings: {
          model: 'global-model',
          synthesisModel: 'synthesis-model'
        } as AppSettings,
        ai: null
      } as StepContext;

      const result = step.testGetStepModel(context);

      expect(result).toBe('synthesis-model');
    });

    it('should return global model when no step-specific model is set', () => {
      step.id = STEPS.INITIAL;
      const context = {
        settings: {
          model: 'global-model'
        } as AppSettings,
        ai: {
          getDefaultModel: (settings: AppSettings) => settings.model
        } as any
      } as StepContext;

      const result = step.testGetStepModel(context);

      expect(result).toBe('global-model');
    });
  });

  describe('handleStreamChunk', () => {
    it('should update results for multi-agent scenario', () => {
      const work: Work = {
        results: {}
      };

      const context = {
        work,
        settings: { numAgents: 3 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      const localResults = ['', '', ''];

      step.testHandleStreamChunk(context, 1, 'Agent 2 text', '', null, {
        localResults,
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(localResults[1]).toBe('Agent 2 text');
      expect(work.results[STEPS.INITIAL]).toEqual(['', 'Agent 2 text', '']);
    });

    it('should update thoughts correctly', () => {
      const work: Work = {
        results: {}
      };

      const context = {
        work,
        settings: { numAgents: 2 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      step.testHandleStreamChunk(context, 0, 'text', 'thinking...', null, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(work.results[`${STEPS.INITIAL}_thoughts`]).toEqual(['thinking...', '']);
    });

    it('should update token usage correctly', () => {
      const work: Work = {
        results: {}
      };

      const context = {
        work,
        settings: { numAgents: 2 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      const usage = {
        totalTokens: 100,
        promptTokens: 50,
        candidatesTokens: 50
      };

      step.testHandleStreamChunk(context, 0, 'text', '', usage, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(work.results[`${STEPS.INITIAL}_usage`]).toBeDefined();
      expect((work.results[`${STEPS.INITIAL}_usage`] as any[])[0]).toEqual(usage);
    });

    it('should handle synthesis (single agent) scenario', () => {
      step.id = STEPS.SYNTHESIS;
      const work: Work = {
        results: {}
      };

      const context = {
        work,
        settings: { numAgents: 1 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      step.testHandleStreamChunk(context, -1, 'synthesis text', '', null, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect((work.results[STEPS.SYNTHESIS] as any).text).toBe('synthesis text');
    });

    it('should call onMessageUpdate when streamToMessage is true', () => {
      const work: Work = {
        results: {}
      };

      const onMessageUpdate = vi.fn();

      const context = {
        work,
        settings: { numAgents: 1 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate
      } as any;

      const usage = { totalTokens: 10, promptTokens: 5, candidatesTokens: 5 };

      step.testHandleStreamChunk(context, 0, 'streaming text', 'thought', usage, {
        isFirstChunk: true,
        streamToMessage: true
      });

      expect(onMessageUpdate).toHaveBeenCalledWith('streaming text', true, 'thought', usage);
    });

    it('should call onMessageUpdate for thought or usage chunks even when text is empty', () => {
      vi.useFakeTimers();

      const work: Work = {
        results: {}
      };
      const usage = { totalTokens: 7, promptTokens: 3, candidatesTokens: 4 };
      const onMessageUpdate = vi.fn();

      const context = {
        work,
        settings: { numAgents: 2 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate
      } as any;

      step.testHandleStreamChunk(context, 0, '', 'reasoning first', usage, {
        isFirstChunk: false,
        streamToMessage: true
      });

      expect(work.results[STEPS.INITIAL]).toEqual(['', '']);
      expect(work.results[`${STEPS.INITIAL}_thoughts`]).toEqual(['reasoning first', '']);
      expect(work.results[`${STEPS.INITIAL}_usage`]).toEqual([usage, null]);
      expect(useAgentStore.getState().updateSessionWorkResult).not.toHaveBeenCalled();

      vi.advanceTimersByTime(75);

      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledWith(
         'msg-1',
         STEPS.INITIAL,
         0,
         { thought: 'reasoning first', usage }
       );
      expect(onMessageUpdate).toHaveBeenCalledWith('', false, 'reasoning first', usage);
    });

    it('should flush buffered reasoning immediately when the first text chunk arrives', () => {
      vi.useFakeTimers();

      const work: Work = {
        results: {}
      };
      const usage = { totalTokens: 7, promptTokens: 3, candidatesTokens: 4 };

      const context = {
        work,
        settings: { numAgents: 2 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      step.testHandleStreamChunk(context, 0, '', 'reasoning first', usage, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(useAgentStore.getState().updateSessionWorkResult).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      step.testHandleStreamChunk(context, 0, 'visible text', 'reasoning first', usage, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledTimes(1);
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledWith(
        'msg-1',
        STEPS.INITIAL,
        0,
        { text: 'visible text', thought: 'reasoning first', usage }
      );

      vi.advanceTimersByTime(100);
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledTimes(1);
    });

    it('should throttle subsequent visible text sync updates after the first flush', () => {
      vi.useFakeTimers();

      const context = {
        work: { results: {} },
        settings: { numAgents: 1 } as AppSettings,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      step.testHandleStreamChunk(context, 0, 'first chunk', '', null, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledTimes(1);
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenLastCalledWith(
        'msg-1',
        STEPS.INITIAL,
        0,
        { text: 'first chunk' }
      );

      step.testHandleStreamChunk(context, 0, 'first chunk plus more', '', null, {
        isFirstChunk: false,
        streamToMessage: false
      });

      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(74);
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledTimes(2);
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenLastCalledWith(
        'msg-1',
        STEPS.INITIAL,
        0,
        { text: 'first chunk plus more' }
      );
    });
  });

  describe('ensureResults', () => {
    it('should initialize results if not present', () => {
      const work: Work = {};

      step.testEnsureResults(work);

      expect(work.results).toBeDefined();
      expect(work.results).toEqual({});
    });

    it('should not overwrite existing results', () => {
      const work: Work = {
        results: { existing: 'data' }
      };

      step.testEnsureResults(work);

      expect(work.results).toEqual({ existing: 'data' });
    });
  });

  describe('getErrorCountKey', () => {
    it('should return consistent error count key for step', () => {
      step.id = STEPS.INITIAL;

      const key = step.testGetErrorCountKey();

      expect(key).toBe('initial_step_error_counts');
    });

    it('should use plural form for refinement step', () => {
      step.id = STEPS.REFINEMENT;

      const key = step.testGetErrorCountKey();

      expect(key).toBe('refinement_step_error_counts');
    });
  });

  describe('ensureStepUsage', () => {
    it('should initialize usage array for multi-agent', () => {
      const work: Work = {
        results: {}
      };

      const result = step.testEnsureStepUsage(work, STEPS.INITIAL, 3);

      expect(result).toEqual([null, null, null]);
      expect(work.results!['initial_step_usage']).toEqual([null, null, null]);
    });

    it('should not overwrite existing usage', () => {
      const existingUsage = [
        { totalTokens: 10, promptTokens: 5, candidatesTokens: 5 },
        { totalTokens: 20, promptTokens: 10, candidatesTokens: 10 }
      ];

      const work: Work = {
        results: {
          'initial_step_usage': existingUsage
        }
      };

      const result = step.testEnsureStepUsage(work, STEPS.INITIAL, 2);

      expect(result).toEqual(existingUsage);
    });
  });

  describe('extractSources', () => {
    it('should extract unique sources from grounding chunks', () => {
      const groundingChunks: GroundingChunk[] = [
        { web: { uri: 'https://example.com', title: 'Example' } },
        { web: { uri: 'https://test.com', title: 'Test' } }
      ];

      const sources = step.testExtractSources(groundingChunks);

      expect(sources).toHaveLength(2);
      expect(sources).toEqual([
        { uri: 'https://example.com', title: 'Example' },
        { uri: 'https://test.com', title: 'Test' }
      ]);
    });

    it('should deduplicate sources by URI', () => {
      const groundingChunks: GroundingChunk[] = [
        { web: { uri: 'https://example.com', title: 'Example 1' } },
        { web: { uri: 'https://example.com', title: 'Example 2' } }
      ];

      const sources = step.testExtractSources(groundingChunks);

      expect(sources).toHaveLength(1);
      // Should use the last occurrence's title
      expect(sources![0].title).toBe('Example 2');
    });

    it('should return undefined for empty grounding chunks', () => {
      const sources = step.testExtractSources([]);

      expect(sources).toBeUndefined();
    });

    it('should use URI as title if title is missing', () => {
      const groundingChunks: GroundingChunk[] = [
        { web: { uri: 'https://example.com' } }
      ];

      const sources = step.testExtractSources(groundingChunks);

      expect(sources).toHaveLength(1);
      expect(sources![0].title).toBe('https://example.com');
    });
  });

  describe('createAgentStates', () => {
    it('should create correct number of agent states', () => {
      const states = step.testCreateAgentStates(3, {} as AppSettings, {
        stepId: STEPS.INITIAL,
        status: 'working',
        statusLabel: 'Researching...'
      });

      expect(states).toHaveLength(3);
      states.forEach(state => {
        expect(state.status).toBe('working');
        expect(state.label).toBe('Researching...');
        expect(state.stepId).toBe(STEPS.INITIAL);
      });
    });
  });

  describe('updateAgentState', () => {
    it('should update agent state at specific index', () => {
      const states: AgentState[] = [
        { id: '1', name: 'Agent 1', stepId: STEPS.INITIAL, status: 'working', label: 'Working' },
        { id: '2', name: 'Agent 2', stepId: STEPS.INITIAL, status: 'working', label: 'Working' }
      ];

      const updated = step.testUpdateAgentState(states, 1, {
        status: 'done',
        label: 'Complete'
      });

      expect(updated[0].status).toBe('working');
      expect(updated[1].status).toBe('done');
      expect(updated[1].label).toBe('Complete');
    });

    it('should not mutate original array', () => {
      const states: AgentState[] = [
        { id: '1', name: 'Agent 1', stepId: STEPS.INITIAL, status: 'working', label: 'Working' }
      ];

      const updated = step.testUpdateAgentState(states, 0, { status: 'done' });

      expect(states[0].status).toBe('working');
      expect(updated[0].status).toBe('done');
      expect(updated).not.toBe(states);
    });
  });

  describe('processSettledOutcomes', () => {
    it('should identify failures and update states', () => {
      const outcomes: PromiseSettledResult<string>[] = [
        { status: 'fulfilled', value: 'success' },
        { status: 'rejected', reason: new Error('Test error') }
      ];

      const results = ['success', ''];
      const agentStates: AgentState[] = [
        { id: '1', name: 'Agent 1', stepId: STEPS.INITIAL, status: 'working', label: 'Working' },
        { id: '2', name: 'Agent 2', stepId: STEPS.INITIAL, status: 'working', label: 'Working' }
      ];

      const context = {
        settings: { debugMode: false } as AppSettings,
        messageId: 'msg-1'
      } as StepContext;

      const { updatedStates, failures } = step.testProcessSettledOutcomes(
        context,
        outcomes,
        results,
        agentStates
      );

      expect(failures).toHaveLength(1);
      expect(updatedStates[0].status).toBe('working'); // First agent still working
      expect(updatedStates[1].status).toBe('error'); // Second agent errored
      expect(failures[0]).toBeInstanceOf(Error);
    });
  });

  describe('handleRetryProgress', () => {
    it('should keep synthesis status stable while marking non-synthesis agents as working during retry', () => {
      const context = { messageId: 'msg-1' } as StepContext;
      const states: AgentState[] = [
        { id: '1', name: 'Agent 1', stepId: STEPS.INITIAL, status: 'error', label: 'Failed', messageId: 'msg-1' }
      ];

      const updated = step.testHandleRetryProgress(context, 0, 2, states);

      expect(updated[0]).toMatchObject({
        status: 'working',
        label: 'Retrying (Attempt 2)...',
        messageId: 'msg-1'
      });
      expect(useAgentStore.getState().updateSessionRuntime).toHaveBeenCalledWith('msg-1', { isLoading: true });

      step.id = STEPS.SYNTHESIS;
      const synthesisStates: AgentState[] = [
        { id: 'synth', name: 'Synthesizer', stepId: STEPS.SYNTHESIS, status: 'done', label: 'Synthesized', messageId: 'msg-1' }
      ];

      const synthesisUpdated = step.testHandleRetryProgress(context, 0, 3, synthesisStates);

      expect(synthesisUpdated[0]).toMatchObject({
        status: 'done',
        label: 'Retrying (Attempt 3)...'
      });
    });
  });

  describe('finalizeStep', () => {
    it('should persist results and rethrow when every agent fails with rate limit', () => {
      const rateLimitError = new AppError('rate limit', ErrorCode.RATE_LIMIT, null, 429);
      const work: Work = { results: {} };
      const context = {
        work,
        settings: { numAgents: 2 } as AppSettings,
        messageId: 'msg-1',
      } as StepContext;

      expect(() => step.testFinalizeStep(
        context,
        ['partial 1', 'partial 2'],
        [],
        [rateLimitError, rateLimitError]
      )).toThrow(rateLimitError);

      expect(work.results?.[STEPS.INITIAL]).toEqual(['partial 1', 'partial 2']);
      expect(useAgentStore.getState().replaceSessionWork).toHaveBeenCalledWith('msg-1', { ...work });
    });
  });

  describe('executeMultiAgent', () => {
    it('should initialize persistent simulated error counts before running agents', async () => {
      const work: Work = {};
      const context = {
        ai: null,
        settings: { debugMode: false, numAgents: 2, model: 'model' } as AppSettings,
        work,
        signal: new AbortController().signal,
        messageId: 'msg-1'
      } as StepContext;

      await expect(step.testExecuteMultiAgent(context, {
        simulateError: '503',
        simulateErrorAttempts: 1,
        prepareAgent: () => ({
          systemInstruction: 'system',
          userTurn: { role: 'user', parts: [{ text: 'prompt' }] },
          mainChatHistory: []
        })
      })).rejects.toMatchObject({ code: ErrorCode.SERVICE_OVERLOADED });

      expect(work.results?.[`${STEPS.INITIAL}_error_counts`]).toEqual([1, 1]);
    });
  });

  describe('runModelStream', () => {
    it('should use dev mode streaming without requiring an AI provider', async () => {
      const callbacks = {
        onChunk: vi.fn()
      };

      const result = await step.testRunModelStream({
        ai: null,
        settings: { debugMode: false, devMode: true } as AppSettings,
        model: 'unused-model',
        contents: [],
        systemInstruction: 'unused',
        signal: new AbortController().signal,
        agentIndex: 1,
        devModeDuration: 1,
        work: { results: {} }
      }, callbacks);

      expect(result.text).toContain('[DEV MODE] Initial draft from Agent 2');
      expect(result.thought).toBe('');
      expect(result.usage).toBeNull();
      expect(result.groundingChunks).toEqual([]);
      expect(callbacks.onChunk).toHaveBeenCalled();
      expect(callbacks.onChunk.mock.calls.at(-1)?.[0].trim()).toBe(result.text);
    });

    it('should successfully run model stream and return accumulated text', async () => {
      const mockAi = {
        getProvider: vi.fn(),
        create: vi.fn()
      };

      const mockProvider = {
        models: {
          generateContentStream: vi.fn()
        }
      };

      mockAi.getProvider.mockReturnValue(mockProvider);

      const mockStream = (async function* () {
        yield { text: 'Hello', thought: '', usage: { totalTokens: 5, promptTokens: 0, candidatesTokens: 5 } };
        yield { text: ' World', thought: '', usage: { totalTokens: 10, promptTokens: 0, candidatesTokens: 10 } };
      })();

      mockProvider.models.generateContentStream.mockResolvedValue({
        stream: mockStream
      });

      const context = {
        ai: mockProvider,
        settings: { debugMode: false } as AppSettings,
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal, // Required by runModelStream
        work: { results: {} }
      };

      const callbacks = {
        onChunk: vi.fn()
      };

      const result = await step.testRunModelStream(context as any, callbacks);

      expect(result.text).toBe('Hello World');
      expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, 'Hello', '', expect.anything());
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, 'Hello World', '', expect.anything());
    });

    it('should accumulate thought, final usage, and grounding chunks from streamed metadata', async () => {
      const usage1 = { totalTokens: 5, promptTokens: 2, candidatesTokens: 3 };
      const usage2 = { totalTokens: 9, promptTokens: 4, candidatesTokens: 5 };
      const groundingChunk1 = { web: { uri: 'https://first.test', title: 'First' } } as GroundingChunk;
      const groundingChunk2 = { web: { uri: 'https://second.test', title: 'Second' } } as GroundingChunk;
      const mockProvider = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: '', thought: 'Reason ', usage: usage1, groundingChunks: [groundingChunk1] };
              yield { text: 'Answer', thought: 'continues', usage: usage2, groundingChunks: [groundingChunk2] };
            })()
          })
        }
      };

      const callbacks = {
        onChunk: vi.fn()
      };

      const result = await step.testRunModelStream({
        ai: mockProvider,
        settings: { debugMode: false } as AppSettings,
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal,
        work: { results: {} }
      } as any, callbacks);

      expect(result).toEqual({
        text: 'Answer',
        thought: 'Reason continues',
        usage: usage2,
        groundingChunks: [groundingChunk1, groundingChunk2]
      });
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, '', 'Reason ', usage1);
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, 'Answer', 'Reason continues', usage2);
    });

    it('should log enriched completion summary with last chunk details', async () => {
      const usage = { totalTokens: 9, promptTokens: 4, candidatesTokens: 5 };
      const mockProvider = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: '', thought: 'Reason ', usage: null };
              yield { text: 'Answer', thought: 'continues', usage };
            })()
          })
        }
      };

      await step.testRunModelStream({
        ai: mockProvider,
        settings: { debugMode: true } as AppSettings,
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal,
        work: { results: {} }
      } as any, { onChunk: vi.fn() });

      expect(loggerSpies.debug).toHaveBeenCalledWith('Stream complete', expect.objectContaining({
        chunkCount: 2,
        textLength: 6,
        thoughtLength: 16,
        hadAnyText: true,
        hadAnyThought: true,
        hadAnyUsage: true,
        lastChunkTextLen: 6,
        lastChunkThoughtLen: 9,
        lastChunkHadText: true,
        lastChunkHadThought: true,
        lastChunkHadUsage: true,
      }));
    });

    it('should reinitialize malformed per-agent simulated error counts and persist the failed attempt', async () => {
      const work: Work = {
        results: {
          [`${STEPS.INITIAL}_error_counts`]: 2
        }
      };

      await expect(step.testRunModelStream({
        ai: null,
        settings: { debugMode: false, numAgents: 3 } as AppSettings,
        model: 'unused-model',
        contents: [],
        signal: new AbortController().signal,
        agentIndex: 1,
        simulateError: '503',
        simulateErrorAttempts: 1,
        messageId: 'msg-1',
        work
      } as any, { onChunk: vi.fn() })).rejects.toMatchObject({
        code: ErrorCode.SERVICE_OVERLOADED,
        status: 503
      } satisfies Partial<AppError>);

      expect(work.results?.[`${STEPS.INITIAL}_error_counts`]).toEqual([0, 1, 0]);
      expect(useAgentStore.getState().replaceSessionWork).toHaveBeenCalledWith('msg-1', expect.objectContaining({
        results: work.results
      }));
    });

    it('should stream normally after simulated error attempts are already exhausted', async () => {
      const work: Work = {
        results: {
          [`${STEPS.INITIAL}_error_counts`]: [1]
        }
      };
      const mockProvider = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: 'Recovered', thought: '', usage: null };
            })()
          })
        }
      };
      const callbacks = { onChunk: vi.fn() };

      const result = await step.testRunModelStream({
        ai: mockProvider,
        settings: { debugMode: false, numAgents: 1 } as AppSettings,
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal,
        agentIndex: 0,
        simulateError: '429',
        simulateErrorAttempts: 1,
        work
      } as any, callbacks);

      expect(result.text).toBe('Recovered');
      expect(work.results?.[`${STEPS.INITIAL}_error_counts`]).toEqual([1]);
      expect(mockProvider.models.generateContentStream).toHaveBeenCalledTimes(1);
      expect(callbacks.onChunk).toHaveBeenCalledWith('Recovered', '', null);
    });

    it('should throw invalid settings when direct streaming has no AI provider', async () => {
      await expect(step.testRunModelStream({
        ai: null,
        settings: { debugMode: false, devMode: false } as AppSettings,
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal,
        work: { results: {} }
      } as any, { onChunk: vi.fn() })).rejects.toMatchObject({
        code: ErrorCode.INVALID_SETTINGS
      });
    });

    it.each([
      ['429', ErrorCode.RATE_LIMIT, 429],
      ['500', ErrorCode.PROXY_ERROR, 500],
      ['timeout', ErrorCode.NETWORK_ERROR, undefined],
      ['custom', undefined, undefined],
    ])('should classify simulated %s errors before streaming', async (simulateError, code, status) => {
      const work: Work = { results: {} };

      const expectation = expect(step.testRunModelStream({
        ai: null,
        settings: { debugMode: false, numAgents: 1 } as AppSettings,
        model: 'unused-model',
        contents: [],
        signal: new AbortController().signal,
        simulateError,
        simulateErrorAttempts: 1,
        work
      } as any, { onChunk: vi.fn() })).rejects;

      if (code) {
        await expectation.toMatchObject({
          code,
          ...(status ? { status } : {})
        });
      } else {
        await expectation.toThrow('custom Simulated error');
      }

      expect(work.results?.[`${STEPS.INITIAL}_error_counts`]).toBe(1);
    });

    it('should abort active stream during processing', async () => {
      const mockAi = {
        getProvider: vi.fn()
      };
      
      const abortController = new AbortController();
      const signal = abortController.signal;

      const mockProvider = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: 'Start', thought: '', usage: null };
              
              // Simulate active abort during stream
              abortController.abort();
              
              // Yield next chunk which should be ignored or cause abort detection
              yield { text: 'Ignored Chunk' };
            })()
          })
        }
      };

      mockAi.getProvider.mockReturnValue(mockProvider);

      const context = {
        ai: mockProvider,
        settings: { debugMode: false },
        model: 'test-model',
        contents: [],
        signal,
        work: { results: {} }
      };

      const callbacks = {
        onChunk: vi.fn()
      };

      await expect(step.testRunModelStream(context as any, callbacks)).rejects.toThrow('Aborted');
      
      // Verify first chunk was processed
      expect(callbacks.onChunk).toHaveBeenCalledWith('Start', '', null);
      
      // Verify second chunk was NOT processed
      expect(callbacks.onChunk).toHaveBeenCalledTimes(1);
    });

    it('should accumulate text before error and throw with partial data', async () => {
      const mockProvider = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: 'Part 1', thought: '', usage: null };
              yield { text: ' Part 2', thought: '', usage: null };
              throw new Error('Stream interrupted');
            })()
          })
        }
      };

      const context = {
        ai: mockProvider,
        settings: { debugMode: false },
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal,
        work: { results: {} }
      };

      const callbacks = { onChunk: vi.fn() };

      await expect(
        step.testRunModelStream(context as any, callbacks)
      ).rejects.toThrow('Stream interrupted');

      // Verify that onChunk was called for successful chunks before error
      expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(1, 'Part 1', '', null);
      expect(callbacks.onChunk).toHaveBeenNthCalledWith(2, 'Part 1 Part 2', '', null);
    });

    it('should handle errors thrown during chunk iteration', async () => {
      let chunkCount = 0;
      const mockProvider = {
        models: {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: 'Chunk 1', thought: '', usage: { totalTokens: 5, promptTokens: 0, candidatesTokens: 5 } };
              chunkCount++;
              yield { text: ' Chunk 2', thought: '', usage: { totalTokens: 10, promptTokens: 0, candidatesTokens: 10 } };
              chunkCount++;
              throw new Error('Network error during streaming');
            })()
          })
        }
      };

      const context = {
        ai: mockProvider,
        settings: { debugMode: false },
        model: 'test-model',
        contents: [],
        signal: new AbortController().signal,
        work: { results: {} }
      };

      const callbacks = {
        onChunk: vi.fn()
      };

      await expect(
        step.testRunModelStream(context as any, callbacks)
      ).rejects.toThrow('Network error during streaming');

      // Both chunks should have been processed before the error
      expect(chunkCount).toBe(2);
      expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
    });

  });

  describe('runAgentRegeneration', () => {
    const createInstruction = () => ({
      systemInstruction: 'system',
      userTurn: { role: 'user', parts: [{ text: 'prompt' }] },
      mainChatHistory: []
    });

    const createProvider = (stream: AsyncGenerator<any>) => ({
      name: 'mock',
      isProxy: false,
      getDefaultModel: vi.fn(() => 'mock-model'),
      models: {
        generateContentStream: vi.fn().mockResolvedValue({ stream })
      }
    });

    it('should clear stale agent output, stream regenerated text, save final usage, and update metadata', async () => {
      const finalUsage = { totalTokens: 42, promptTokens: 20, candidatesTokens: 22 };
      const provider = createProvider((async function* () {
        yield { text: 'new agent text', thought: 'new thought', usage: finalUsage };
      })());
      const work: Work = {
        results: {
          [STEPS.INITIAL]: ['old agent 0', 'old agent 1'],
          [`${STEPS.INITIAL}_usage`]: [null, { totalTokens: 9, promptTokens: 4, candidatesTokens: 5 }]
        },
        stepMetadata: [{ id: STEPS.INITIAL, status: 'error', label: 'Initial Step' }]
      };
      const context = {
        ai: provider,
        settings: { debugMode: false, numAgents: 2, model: 'global-model' } as AppSettings,
        work,
        signal: new AbortController().signal,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      const result = await step.testRunAgentRegeneration(
        context,
        1,
        createInstruction(),
        [
          { id: 'a0', name: 'Agent 1', status: 'done', label: 'Done', messageId: 'msg-1' },
          { id: 'a1', name: 'Agent 2', status: 'error', label: 'Failed', messageId: 'msg-1' }
        ]
      );

      expect(result.text).toBe('new agent text');
      expect(work.results?.[STEPS.INITIAL]).toEqual(['old agent 0', 'new agent text']);
      expect(work.results?.[`${STEPS.INITIAL}_usage`]).toEqual([null, finalUsage]);
      expect(work.stepMetadata?.[0]).toMatchObject({ id: STEPS.INITIAL, status: 'done' });
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledWith(
        'msg-1',
        STEPS.INITIAL,
        1,
        { usage: null, text: '' }
      );
      expect(useAgentStore.getState().updateSessionWorkResult).toHaveBeenCalledWith(
        'msg-1',
        STEPS.INITIAL,
        1,
        { text: 'new agent text', thought: 'new thought', usage: finalUsage }
      );
    });

    it('should reject regeneration before mutating work when AI provider is missing', async () => {
      const work: Work = { results: { [STEPS.INITIAL]: ['old'] } };

      await expect(step.testRunAgentRegeneration(
        {
          ai: null,
          settings: { debugMode: false, numAgents: 1, model: 'global-model' } as AppSettings,
          work,
          signal: new AbortController().signal,
          messageId: 'msg-1'
        } as any,
        0,
        createInstruction(),
        []
      )).rejects.toMatchObject({ code: ErrorCode.INVALID_SETTINGS });

      expect(work.results?.[STEPS.INITIAL]).toEqual(['old']);
    });

    it('should mark the regenerated agent as failed and persist work when streaming fails', async () => {
      const provider = createProvider((async function* () {
        yield { text: 'partial', thought: '', usage: null };
        throw new Error('regeneration stream failed');
      })());
      const work: Work = { results: { [STEPS.INITIAL]: ['old agent 0', 'old agent 1'] } };
      const context = {
        ai: provider,
        settings: { debugMode: false, numAgents: 2, model: 'global-model' } as AppSettings,
        work,
        signal: new AbortController().signal,
        messageId: 'msg-1',
        onMessageUpdate: vi.fn()
      } as any;

      await expect(step.testRunAgentRegeneration(
        context,
        1,
        createInstruction(),
        []
      )).rejects.toThrow('regeneration stream failed');

      expect(work.results?.[STEPS.INITIAL]).toEqual(['old agent 0', 'partial']);
      expect(useAgentStore.getState().replaceSessionWork).toHaveBeenCalledWith('msg-1', { ...work });
    });

    it('should route retry callbacks through retry progress during regeneration', async () => {
      const retryStep = new RetryCallbackStep();
      const work: Work = { results: { [STEPS.INITIAL]: ['old'] } };

      const result = await retryStep.testRunAgentRegeneration(
        {
          ai: { name: 'mock', isProxy: false, getDefaultModel: vi.fn(() => 'mock-model'), models: {} },
          settings: { debugMode: false, numAgents: 1, model: 'global-model' } as AppSettings,
          work,
          signal: new AbortController().signal,
          messageId: 'msg-1',
          onMessageUpdate: vi.fn()
        } as any,
        0,
        createInstruction(),
        [{ id: 'a0', name: 'Agent 1', status: 'error', label: 'Failed', messageId: 'msg-1' }]
      );

      expect(result.text).toBe('retried text');
      expect(useAgentStore.getState().updateSessionRuntime).toHaveBeenCalledWith('msg-1', { isLoading: true });
    });
  });

});

