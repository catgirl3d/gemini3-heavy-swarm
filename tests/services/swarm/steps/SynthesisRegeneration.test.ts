import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SynthesisStep } from '@/services/swarm/steps/SynthesisStep';
import { STEPS, type StepId } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';
import type { AgentState, TokenUsage, Work } from '@/types';
import type { StepContext, StreamCallbacks, StreamConfig, StreamResult } from '@/types/steps';
import type { Content } from '@google/genai';

type SynthesisRegenerationPrivateApi = {
  createAgentStates: (...args: unknown[]) => AgentState[];
  updateAgentStateById: (states: AgentState[], id: string, updates: Partial<AgentState>) => AgentState[];
  prepareSynthesis: (...args: unknown[]) => { systemInstruction: string; synthesizerTurn: Content; mainChatHistory: Content[] };
  extractSources: (...args: unknown[]) => unknown[];
  getStepModel: (...args: unknown[]) => string;
  ensureResults: (work: Work) => void;
  ensureStepUsage: (work: Work, stepId: StepId, numAgents: number) => (TokenUsage | null)[];
  runModelStream: (config: StreamConfig, callbacks: StreamCallbacks) => Promise<StreamResult>;
};

const getPrivateStep = (step: SynthesisStep): SynthesisRegenerationPrivateApi => step as unknown as SynthesisRegenerationPrivateApi;

// Mock dependencies
vi.mock('@/stores/agentStore', () => ({
  useAgentStore: {
    getState: vi.fn(() => ({
      updateSessionAgent: vi.fn(),
      updateSessionWorkResult: vi.fn(),
      replaceSessionWork: vi.fn(),
      updateSessionRuntime: vi.fn(),
      agents: []
    }))
  }
}));

vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn((id: string) => {
    const configs: Record<string, unknown> = {
      synthesis_step: { 
          name: 'Synthesis',
          labels: { waiting: 'Waiting...', working: 'Synthesizing...', done: 'Done', error: 'Error' }, 
          progressMsg: 'Synthesis Progress' 
      }
    };
    return configs[id] || { labels: {} };
  }),
  STEPS: { INITIAL: 'initial_step', REFINEMENT: 'refinement_step', SYNTHESIS: 'synthesis_step' }
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

vi.mock('@/services/swarm/contentUtils', () => ({
  prepareGeminiContent: vi.fn(() => ({ history: [], baseApiParts: [] }))
}));

vi.mock('@/utils/swarm/statusHelpers', () => ({
  updateAgentStatus: vi.fn(),
  updateAgentStatusIfChanged: vi.fn()
}));

/**
 * Integration tests for synthesis regeneration behavior.
 * 
 * These tests verify that the regeneration flow correctly:
 * 1. Clears old synthesis text before streaming starts
 * 2. Uses synthesis slot 0 consistently for store updates
 * 3. Maintains array lane storage plus synthesis sidecars
 * 4. Prevents premature card collapse by ensuring synthesisText is empty until first chunk
 */
describe('Synthesis Regeneration - Integration Tests', () => {
  let step: SynthesisStep;
  type TestWork = Work & { results: NonNullable<Work['results']> };
  type TestContext = StepContext & { work: TestWork };
  let mockContext: TestContext;
  type StoreState = ReturnType<typeof useAgentStore.getState>;
  let updateWorkResultSpy: StoreState['updateSessionWorkResult'] & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    updateWorkResultSpy = vi.fn((
      _messageId: string,
      _stepId: StepId,
      _agentIndex: number,
      _updates: { text?: string; thought?: string; usage?: TokenUsage | null },
    ) => undefined);
    const store = useAgentStore.getState();
    store.updateSessionWorkResult = updateWorkResultSpy;
    vi.mocked(useAgentStore.getState).mockReturnValue(store);

    step = new SynthesisStep();
    
    // DON'T mock handleStreamChunk - we want real implementation
    // Only mock high-level dependencies
    const privateStep = getPrivateStep(step);
    privateStep.createAgentStates = vi.fn(() => []);
    privateStep.updateAgentStateById = vi.fn((states: AgentState[]) => states);
    privateStep.prepareSynthesis = vi.fn(() => ({
        systemInstruction: 'Test instruction',
        synthesizerTurn: { parts: [{ text: 'synthesize this' }] },
        mainChatHistory: []
    }));
    privateStep.extractSources = vi.fn(() => []);
    privateStep.getStepModel = vi.fn(() => 'test-model');

    // Mock ensureResults to actually initialize the results object
    privateStep.ensureResults = vi.fn((work: Work) => {
      if (!work.results) work.results = {};
    });

    // Mock ensureStepUsage to initialize usage array
    privateStep.ensureStepUsage = vi.fn((work: Work, stepId: StepId, numAgents: number): (TokenUsage | null)[] => {
      if (!work.results) work.results = {};
      const key = `${stepId}_usage`;
      if (!work.results[key]) {
        work.results[key] = Array(numAgents).fill(null);
      }
      return work.results[key] as (TokenUsage | null)[];
    });

    mockContext = {
      ai: {
        models: { generateContentStream: vi.fn() }
      },
      settings: {
        numAgents: 2,
        profiles: [{ id: 'default', synthesizerInstruction: 'Synthesize' }],
        activeProfileId: 'default',
        model: 'gemini-pro',
        roleProfiles: [{ id: 'default', roles: [], criticRoles: [] }]
      },
       work: {
         results: {
          initial_step: ['initial 1', 'initial 2'],
          refinement_step: ['refined 1', 'refined 2'],
          synthesis_step: ['Old synthesis text that should be cleared'],
          synthesis_step_sources: [{ uri: 'http://example.com', title: 'Example' }]
         }
      },
      messageId: 'msg-integration-test',
      onMessageUpdate: vi.fn(),
      onSynthesisJump: vi.fn(),
      signal: new AbortController().signal
    } as unknown as TestContext;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clear old synthesis text before regeneration and use slot 0', async () => {
    vi.useFakeTimers();

    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    let resolveStream: ((value: StreamResult) => void) | undefined;
    const finalUsage: TokenUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 100 };
    
    // Mock runModelStream to capture onChunk and simulate streaming
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
      return new Promise(resolve => {
        resolveStream = resolve;
      });
    });

    const agentStates: AgentState[] = [];
    const regenPromise = step.regenerate(mockContext, 0, agentStates);
    
    // Wait for async setup
    await vi.advanceTimersByTimeAsync(0);

    // Check that old text was cleared BEFORE streaming starts
    // Note: This happens in runAgentRegeneration before runModelStream is called
    expect(mockContext.work.results.synthesis_step).toEqual(['']);
    expect(mockContext.work.results.synthesis_step_sources).toEqual([
      { uri: 'http://example.com', title: 'Example' }
    ]);

    // Check that updateWorkResult was called to clear store with synthesis slot 0
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      'msg-integration-test',
      STEPS.SYNTHESIS, 
      0,
      { usage: null, thought: '', text: '' }
    );

    // Now simulate streaming chunks
    expect(capturedOnChunk).toBeDefined();
    const onChunk = capturedOnChunk;
    if (!onChunk) throw new Error('Expected stream chunk callback');
    
    // First chunk: thought only (no text yet)
    onChunk('', 'Thinking about regeneration...', null);

    expect(updateWorkResultSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(75);
     
    // Verify updateWorkResult was called with synthesis slot 0 for thought
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      'msg-integration-test',
      STEPS.SYNTHESIS,
      0,
      { thought: 'Thinking about regeneration...' }
    );

    // Second chunk: text arrives
    onChunk('New regenerated text', '', { promptTokens: 0, candidatesTokens: 0, totalTokens: 50 });
    
    // Verify final updateWorkResult uses synthesis slot 0
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      'msg-integration-test',
      STEPS.SYNTHESIS,
      0,
      expect.objectContaining({
        text: 'New regenerated text',
        usage: expect.objectContaining({ totalTokens: 50 })
      })
    );

    resolveStream?.({
      text: 'New regenerated text',
      thought: '',
      groundingChunks: [],
       usage: finalUsage,
    });

    await regenPromise;
    const callCountBeforeBufferWindow = updateWorkResultSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);

    expect(mockContext.work.results.synthesis_step).toEqual(['New regenerated text']);
    expect(mockContext.work.results[`${STEPS.SYNTHESIS}_usage`]).toEqual([finalUsage]);
    expect(mockContext.work.results[`${STEPS.SYNTHESIS}_sources`]).toBeUndefined();
    expect(updateWorkResultSpy.mock.calls).toHaveLength(callCountBeforeBufferWindow);
    expect(
      updateWorkResultSpy.mock.calls
        .filter(([, stepId]) => stepId === STEPS.SYNTHESIS)
        .map(([, , agentIndex]) => agentIndex)
    ).not.toContain(-1);
  });

  it('should preserve error sidecar while clearing the synthesis lane during regeneration', async () => {
    // Simulate error state with partial text
    mockContext.work.results.synthesis_step = ['Partial text before error'];
    mockContext.work.results[`${STEPS.SYNTHESIS}_error`] = {
      flag: true,
      message: 'Service unavailable'
    };

    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    let resolveStream: ((value: StreamResult) => void) | undefined;
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
      return new Promise(resolve => {
        resolveStream = resolve;
      });
    });

    const regenPromise = step.regenerate(mockContext, 0, []);
    await new Promise(resolve => setTimeout(resolve, 0));
    const onChunk = capturedOnChunk;
    if (!onChunk) throw new Error('Expected stream chunk callback');

    // Old text should be cleared, error sidecar preserved temporarily
    expect(mockContext.work.results.synthesis_step).toEqual(['']);
    expect(mockContext.work.results[`${STEPS.SYNTHESIS}_error`]).toEqual({
      flag: true,
      message: 'Service unavailable'
    });

    // Simulate successful regeneration
    onChunk('Recovered text', '', null);

    // Verify store update uses synthesis slot 0
    const lastCall = updateWorkResultSpy.mock.calls[updateWorkResultSpy.mock.calls.length - 1];
    expect(lastCall[0]).toBe('msg-integration-test');
    expect(lastCall[1]).toBe(STEPS.SYNTHESIS);
    expect(lastCall[2]).toBe(0);
    expect(lastCall[3]).toMatchObject({ text: 'Recovered text' });

    resolveStream?.({
      text: 'Recovered text',
      thought: '',
      groundingChunks: [],
      usage: null
    });
    await regenPromise;
  });

  it('should prevent premature card collapse by ensuring synthesisText is empty before first chunk', async () => {
    // This test verifies the fix for the bug where cards collapsed immediately
    // because old text wasn't cleared
    
    mockContext.work.results.synthesis_step = ['Old text that triggers hasContent=true'];
    mockContext.work.results.synthesis_step_sources = [];

    getPrivateStep(step).runModelStream = vi.fn().mockImplementation(() => {
      // Simulate delay before first chunk (representing network/model processing)
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({ text: 'New text', thought: '', usage: null, groundingChunks: [] });
        }, 10);
      });
    });

    const regenPromise = step.regenerate(mockContext, 0, []);
    await new Promise(resolve => setTimeout(resolve, 0));

    // CRITICAL: At this point, before any chunks arrive:
    // 1. work.results.synthesis_step[0] should be '' (cleared)
    // 2. This prevents hasContent=true in useAutoCollapse
    // 3. Cards stay open until first TEXT chunk
    
    expect(mockContext.work.results.synthesis_step[0]).toBe('');
    
    // Verify store was also cleared
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      'msg-integration-test',
      STEPS.SYNTHESIS,
      0,
      expect.objectContaining({ text: '' })
    );

    await regenPromise;
  });

  it('should clear stale synthesis sources when regeneration fails', async () => {
    const streamError = new Error('Regeneration failed');
    mockContext.work.results.synthesis_step = ['Partial regenerated text'];
    mockContext.work.results.synthesis_step_sources = [{ uri: 'http://stale.test', title: 'Stale Source' }];

    getPrivateStep(step).runModelStream = vi.fn().mockImplementation(async (_config: StreamConfig, callbacks: StreamCallbacks) => {
      callbacks.onChunk('Partial regenerated text', '', null);
      throw streamError;
    });

    await expect(step.regenerate(mockContext, 0, [])).rejects.toBe(streamError);

    expect(mockContext.work.results.synthesis_step).toEqual(['Partial regenerated text']);
    expect(mockContext.work.results[`${STEPS.SYNTHESIS}_sources`]).toBeUndefined();
    expect(mockContext.work.results[`${STEPS.SYNTHESIS}_error`]).toEqual({
      flag: true,
      message: expect.any(String)
    });
  });
});
