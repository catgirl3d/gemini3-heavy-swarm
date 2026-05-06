import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthesisStep } from '@/services/swarm/steps/SynthesisStep';
import { useAgentStore } from '@/stores/agentStore';

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
    const configs: any = {
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
  let mockContext: any;
  let updateAgentMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    updateAgentMock = vi.fn();
    (useAgentStore.getState as any).mockReturnValue({
      updateSessionAgent: updateAgentMock,
      updateSessionWorkResult: vi.fn(),
      replaceSessionWork: vi.fn(),
      updateSessionRuntime: vi.fn(),
      agents: []
    });

    step = new SynthesisStep();
    
    // Create base mocks for internal methods
    (step as any).createAgentStates = vi.fn(() => []);
    (step as any).ensureResults = vi.fn();
    (step as any).prepareSynthesis = vi.fn(() => ({
        systemInstruction: '',
        synthesizerTurn: { parts: [{ text: '' }] },
        mainChatHistory: []
    }));
    (step as any).extractSources = vi.fn(() => []);
    (step as any).getStepModel = vi.fn(() => 'test-model');
    // Ensure handleStreamChunk is spied on but calls original implementation if possible,
    // or we mock it entirely if testing timing logic.
    (step as any).handleStreamChunk = vi.fn();

    // Mock runModelStream which is protected in BaseStep directly on the instance
    (step as any).runModelStream = vi.fn();

    // Mock handleRetryProgress to emulate BaseStep retry behavior
    // CRITICAL: Must return the states array, otherwise it sets currentAgentStates to undefined
    (step as any).handleRetryProgress = vi.fn().mockImplementation((ctx, idx, attempt, states) => states);

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
    };
  });

  it('should only trigger synthesis jump on the first TEXT chunk, even if thoughts come first', async () => {
    let capturedOnChunk: any;
    (step as any).runModelStream.mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'final text', thought: '', usage: null, groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedOnChunk).toBeDefined();

    // Thought only - NO JUMP
    capturedOnChunk('', 'Thinking...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();
    expect((step as any).handleStreamChunk).toHaveBeenCalledWith(
        mockContext, -1, '', 'Thinking...', null, expect.anything()
    );

    // Text chunk - JUMP
    capturedOnChunk('Hello', '', null);
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);

    // More text - NO JUMP
    capturedOnChunk(' world', '', null);
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);

    await runPromise;
  });

  it('should correctly handle the timing of onSynthesisJump relative to handleStreamChunk', async () => {
    const callOrder: string[] = [];
    (step as any).handleStreamChunk.mockImplementation(() => {
        callOrder.push('handleStreamChunk');
    });
    mockContext.onSynthesisJump.mockImplementation(() => {
        callOrder.push('onSynthesisJump');
    });

    let capturedOnChunk: any;
    (step as any).runModelStream.mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'final text', thought: '', usage: null, groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    capturedOnChunk('First text', '', null);

    // handleStreamChunk MUST come before onSynthesisJump
    expect(callOrder).toEqual(['handleStreamChunk', 'onSynthesisJump']);
    
    await runPromise;
  });

  it('should reset logic after retry and trigger jump again on success', async () => {
    // This test simulates a failure and then a retry
    let capturedOnChunk: any;
    let capturedOnRetry: any;
    
    (step as any).runModelStream.mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      capturedOnRetry = callbacks.onRetry;
      return Promise.resolve({ text: 'text', groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    // 1. First attempt starts, sends some thought
    capturedOnChunk('', 'Thinking...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();

    // 2. Simulate Retry (e.g. error happened)
    capturedOnRetry(1);
    
    // 3. New attempt starts (isFirstTextChunk should be reset to true)
    
    // 4. Send thought again
    capturedOnChunk('', 'Thinking 2...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();

    // 5. Send text on successful attempt
    capturedOnChunk('Hello retry', '', null);
    
    // Should trigger jump now
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);
    
    await runPromise;
  });

  it('should handle regeneration flow correctly', async () => {
    // For regeneration, BaseStep calls runAgentRegeneration.
    // We need to ensure we are testing the regeneration path.
    // Since we're not mocking BaseStep globally, we can call regenerate directly.
    
    let capturedOnChunk: any;
    (step as any).runModelStream.mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'regen text', groundingChunks: [] });
    });

    const agentStates: any[] = [];
    const regenPromise = step.regenerate(mockContext, 0, agentStates);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedOnChunk).toBeDefined();

    // 1. Thought only
    capturedOnChunk('', 'Regen thinking...', null);
    expect(mockContext.onSynthesisJump).not.toHaveBeenCalled();

    // 2. Text arrive
    capturedOnChunk('Regen text', '', null);
    
    // Jump should trigger
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);

    await regenPromise;
  });

  it('should trigger jump if chunk has BOTH text and thought', async () => {
    let capturedOnChunk: any;
    (step as any).runModelStream.mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ text: 'text', groundingChunks: [] });
    });

    const runPromise = step.execute(mockContext);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Chunk with both thought and text
    capturedOnChunk('Mixed content', 'Thinking...', null);
    
    expect(mockContext.onSynthesisJump).toHaveBeenCalledTimes(1);
    expect((step as any).handleStreamChunk).toHaveBeenCalledWith(
        mockContext, -1, 'Mixed content', 'Thinking...', null, expect.anything()
    );

    await runPromise;
  });
});
