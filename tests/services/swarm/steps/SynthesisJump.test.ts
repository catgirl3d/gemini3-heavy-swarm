import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthesisStep } from '@/services/swarm/steps/SynthesisStep';
import { useAgentStore } from '@/stores/agentStore';
import type { AgentState, Work } from '@/types';
import type { StepContext, StreamCallbacks, StreamConfig, StreamResult } from '@/types/steps';
import { AppError, ErrorCode } from '@/utils/errors/AppError';
import type { Content } from '@google/genai';

type SynthesisJumpPrivateApi = {
  createAgentStates: (...args: unknown[]) => AgentState[];
  ensureResults: (work: Work) => void;
  prepareSynthesis: (context: StepContext, drafts: (string | null)[]) => { systemInstruction: string; synthesizerTurn: Content; mainChatHistory: Content[] };
  extractSources: (...args: unknown[]) => unknown[];
  getStepModel: (context: StepContext) => string;
  handleStreamChunk: (...args: unknown[]) => void;
  runModelStream: (config: StreamConfig, callbacks: StreamCallbacks) => Promise<StreamResult>;
  handleRetryProgress: (...args: unknown[]) => AgentState[];
};

const getPrivateStep = (step: SynthesisStep): SynthesisJumpPrivateApi => step as unknown as SynthesisJumpPrivateApi;

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

describe('Synthesis Jump behavior', () => {
  let step: SynthesisStep;
  type TestWork = Work & { results: NonNullable<Work['results']> };
  type TestContext = StepContext & {
    work: TestWork;
    onSynthesisJump: ReturnType<typeof vi.fn>;
  };
  let mockContext: TestContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
     const store = useAgentStore.getState();
     vi.mocked(useAgentStore.getState).mockReturnValue(store);

    step = new SynthesisStep();
    
    // Create base mocks for internal methods
    const privateStep = getPrivateStep(step);
    privateStep.createAgentStates = vi.fn(() => []);
    privateStep.ensureResults = vi.fn();
    privateStep.prepareSynthesis = vi.fn(() => ({
        systemInstruction: '',
        synthesizerTurn: { parts: [{ text: '' }] },
        mainChatHistory: []
    }));
    privateStep.extractSources = vi.fn(() => []);
    privateStep.getStepModel = vi.fn(() => 'test-model');
    // Ensure handleStreamChunk is spied on but calls original implementation if possible,
    // or we mock it entirely if testing timing logic.
    privateStep.handleStreamChunk = vi.fn();

    // Mock runModelStream which is protected in BaseStep directly on the instance
    privateStep.runModelStream = vi.fn();

    // Mock handleRetryProgress to emulate BaseStep retry behavior
    // CRITICAL: Must return the states array, otherwise it sets currentAgentStates to undefined
    privateStep.handleRetryProgress = vi.fn().mockImplementation((_ctx: StepContext, _idx: number, _attempt: number, states: AgentState[]) => states);

    mockContext = {
      ai: {
        models: {
          generateContentStream: vi.fn()
        }
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
           refinement_step: ['refined 1', 'refined 2']
         }
       },
      messageId: 'msg-123',
      onMessageUpdate: vi.fn(),
      onSynthesisJump: vi.fn(),
      signal: new AbortController().signal
    } as unknown as TestContext;
  });

  it('should only trigger synthesis jump on the first TEXT chunk, even if thoughts come first', async () => {
    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'final text', thought: '', usage: null, groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedOnChunk).toBeDefined();
    const onChunk = capturedOnChunk;
    if (!onChunk) throw new Error('Expected stream chunk callback');

    // Thought only - NO JUMP
    onChunk('', 'Thinking...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();
    expect(getPrivateStep(step).handleStreamChunk).toHaveBeenCalledWith(
        mockContext, 0, '', 'Thinking...', null, expect.anything()
    );

    // Text chunk - JUMP
    onChunk('Hello', '', null);
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);

    // More text - NO JUMP
    onChunk(' world', '', null);
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);

    await runPromise;
  });

  it('should correctly handle the timing of onSynthesisJump relative to handleStreamChunk', async () => {
    const callOrder: string[] = [];
    (getPrivateStep(step).handleStreamChunk as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callOrder.push('handleStreamChunk');
    });
    mockContext.onSynthesisJump.mockImplementation(() => {
        callOrder.push('onSynthesisJump');
    });

    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'final text', thought: '', usage: null, groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    const onChunk = capturedOnChunk;
    if (!onChunk) throw new Error('Expected stream chunk callback');
    onChunk('First text', '', null);

    // handleStreamChunk MUST come before onSynthesisJump
    expect(callOrder).toEqual(['handleStreamChunk', 'onSynthesisJump']);
    
    await runPromise;
  });

  it('should reset logic after retry and trigger jump again on success', async () => {
    // This test simulates a failure and then a retry
    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    let capturedOnRetry: NonNullable<StreamCallbacks['onRetry']> | undefined;
    
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
       capturedOnRetry = callbacks.onRetry ?? ((_attempt, _error) => undefined);
      return Promise.resolve({ text: 'text', thought: '', usage: null, groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    const onChunk = capturedOnChunk;
    const onRetry = capturedOnRetry;
    if (!onChunk || !onRetry) throw new Error('Expected stream callbacks');

    // 1. First attempt starts, sends some thought
    onChunk('', 'Thinking...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();

    // 2. Simulate Retry (e.g. error happened)
       onRetry(1, new AppError('retry', ErrorCode.NETWORK_ERROR));
    
    // 3. New attempt starts (isFirstTextChunk should be reset to true)
    
    // 4. Send thought again
    onChunk('', 'Thinking 2...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();

    // 5. Send text on successful attempt
    onChunk('Hello retry', '', null);
    
    // Should trigger jump now
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);
    
    await runPromise;
  });

  it('should handle regeneration flow correctly', async () => {
    // For regeneration, BaseStep calls runAgentRegeneration.
    // We need to ensure we are testing the regeneration path.
    // Since we're not mocking BaseStep globally, we can call regenerate directly.
    
    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'regen text', thought: '', usage: null, groundingChunks: [] });
    });

    const agentStates: AgentState[] = [];
    const regenPromise = step.regenerate(mockContext, 0, agentStates);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedOnChunk).toBeDefined();
    const onChunk = capturedOnChunk;
    if (!onChunk) throw new Error('Expected stream chunk callback');

    // 1. Thought only
    onChunk('', 'Regen thinking...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();

    // 2. Text arrive
    onChunk('Regen text', '', null);
    
    // Jump should trigger
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);

    await regenPromise;
  });

  it('should trigger jump if chunk has BOTH text and thought', async () => {
    let capturedOnChunk: StreamCallbacks['onChunk'] | undefined;
    getPrivateStep(step).runModelStream = vi.fn().mockImplementation((_config: StreamConfig, callbacks: StreamCallbacks) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'text', thought: '', usage: null, groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    const onChunk = capturedOnChunk;
    if (!onChunk) throw new Error('Expected stream chunk callback');

    // Chunk with both thought and text
    onChunk('Mixed content', 'Thinking...', null);
    
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);
    expect(getPrivateStep(step).handleStreamChunk).toHaveBeenCalledWith(
        mockContext, 0, 'Mixed content', 'Thinking...', null, expect.anything()
    );

    await runPromise;
  });
});
