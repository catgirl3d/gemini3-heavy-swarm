import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthesisStep } from '@/services/swarm/steps/SynthesisStep';
import { STEPS } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';

// Mock dependencies
vi.mock('@/stores/agentStore', () => ({
  useAgentStore: {
    getState: vi.fn(() => ({
      updateAgent: vi.fn(),
      updateWorkResult: vi.fn(),
      setCurrentWork: vi.fn(),
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

/**
 * Integration tests for synthesis regeneration behavior.
 * 
 * These tests verify that the regeneration flow correctly:
 * 1. Clears old synthesis text before streaming starts
 * 2. Uses storageIndex = -1 (not agentIndex = 0) for store updates
 * 3. Maintains object structure {text, sources} (not array)
 * 4. Prevents premature card collapse by ensuring synthesisText is empty until first chunk
 */
describe('Synthesis Regeneration - Integration Tests', () => {
  let step: SynthesisStep;
  let mockContext: any;
  let updateWorkResultSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    updateWorkResultSpy = vi.fn();
    (useAgentStore.getState as any).mockReturnValue({
      updateAgent: vi.fn(),
      updateWorkResult: updateWorkResultSpy,
      setCurrentWork: vi.fn(),
      agents: []
    });

    step = new SynthesisStep();
    
    // DON'T mock handleStreamChunk - we want real implementation
    // Only mock high-level dependencies
    (step as any).createAgentStates = vi.fn(() => []);
    (step as any).updateAgentStateById = vi.fn((states) => states);
    (step as any).prepareSynthesis = vi.fn(() => ({
        systemInstruction: 'Test instruction',
        synthesizerTurn: { parts: [{ text: 'synthesize this' }] },
        mainChatHistory: []
    }));
    (step as any).extractSources = vi.fn(() => []);
    (step as any).getStepModel = vi.fn(() => 'test-model');

    // Mock ensureResults to actually initialize the results object
    (step as any).ensureResults = vi.fn((work) => {
      if (!work.results) work.results = {};
    });

    // Mock ensureStepUsage to initialize usage array
    (step as any).ensureStepUsage = vi.fn((work, stepId, numAgents) => {
      const key = `${stepId}_usage`;
      if (!work.results[key]) {
        work.results[key] = Array(numAgents).fill(null);
      }
      return work.results[key];
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
          // Old synthesis result with object structure
          synthesis_step: {
            text: 'Old synthesis text that should be cleared',
            sources: [{ uri: 'http://example.com', title: 'Example' }]
          }
        }
      },
      messageId: 'msg-integration-test',
      onMessageUpdate: vi.fn(),
      onSynthesisJump: vi.fn(),
      signal: new AbortController().signal
    };
  });

  it('should clear old synthesis text before regeneration and use storageIndex -1', async () => {
    let capturedOnChunk: any;
    
    // Mock runModelStream to capture onChunk and simulate streaming
    (step as any).runModelStream = vi.fn().mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ 
        text: 'New regenerated text', 
        groundingChunks: [],
        usage: { totalTokens: 100 }
      });
    });

    const agentStates: any[] = [];
    const regenPromise = step.regenerate(mockContext, 0, agentStates);
    
    // Wait for async setup
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check that old text was cleared BEFORE streaming starts
    // Note: This happens in runAgentRegeneration before runModelStream is called
    expect(mockContext.work.results.synthesis_step).toEqual({ 
      text: '',  // Text cleared
      sources: [{ uri: 'http://example.com', title: 'Example' }]  // Sources preserved
    });

    // Check that updateWorkResult was called to clear store with storageIndex = -1
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      STEPS.SYNTHESIS, 
      -1,  // CRITICAL: Must use -1, not 0
      { usage: null, text: '' }
    );

    // Now simulate streaming chunks
    expect(capturedOnChunk).toBeDefined();
    
    // First chunk: thought only (no text yet)
    capturedOnChunk('', 'Thinking about regeneration...', null);
    
    // Verify updateWorkResult was called with storageIndex = -1 for thought
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      -1,  // Must be -1 to maintain object structure
      expect.objectContaining({
        text: '',
        thought: 'Thinking about regeneration...'
      })
    );

    // Second chunk: text arrives
    capturedOnChunk('New regenerated text', '', { totalTokens: 50 });
    
    // Verify final updateWorkResult uses storageIndex = -1
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      -1,  // CRITICAL: storageIndex, not agentIndex
      expect.objectContaining({
        text: 'New regenerated text',
        usage: expect.objectContaining({ totalTokens: 50 })
      })
    );

    await regenPromise;

    // Verify final work.results structure is object, not array
    expect(mockContext.work.results.synthesis_step).toEqual(
      expect.objectContaining({
        text: expect.any(String)
      })
    );
    expect(Array.isArray(mockContext.work.results.synthesis_step)).toBe(false);
  });

  it('should maintain object structure even when regenerating from error state', async () => {
    // Simulate error state with partial text
    mockContext.work.results.synthesis_step = {
      text: 'Partial text before error',
      error: true,
      errorMessage: 'Service unavailable'
    };

    let capturedOnChunk: any;
    (step as any).runModelStream = vi.fn().mockImplementation((config: any, callbacks: any) => {
      capturedOnChunk = callbacks.onChunk;
      return Promise.resolve({ 
        text: 'Recovered text', 
        groundingChunks: [] 
      });
    });

    const regenPromise = step.regenerate(mockContext, 0, []);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Old text should be cleared, error flags preserved temporarily
    expect(mockContext.work.results.synthesis_step).toEqual({
      text: '',
      error: true,
      errorMessage: 'Service unavailable'
    });

    // Simulate successful regeneration
    capturedOnChunk('Recovered text', '', null);

    // Verify store update uses storageIndex = -1
    const lastCall = updateWorkResultSpy.mock.calls[updateWorkResultSpy.mock.calls.length - 1];
    expect(lastCall[0]).toBe(STEPS.SYNTHESIS);
    expect(lastCall[1]).toBe(-1);  // storageIndex
    expect(lastCall[2]).toMatchObject({ text: 'Recovered text' });

    await regenPromise;
  });

  it('should prevent premature card collapse by ensuring synthesisText is empty before first chunk', async () => {
    // This test verifies the fix for the bug where cards collapsed immediately
    // because old text wasn't cleared
    
    mockContext.work.results.synthesis_step = {
      text: 'Old text that triggers hasContent=true',
      sources: []
    };

    (step as any).runModelStream = vi.fn().mockImplementation(() => {
      // Simulate delay before first chunk (representing network/model processing)
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({ text: 'New text', groundingChunks: [] });
        }, 10);
      });
    });

    const regenPromise = step.regenerate(mockContext, 0, []);
    await new Promise(resolve => setTimeout(resolve, 0));

    // CRITICAL: At this point, before any chunks arrive:
    // 1. work.results.synthesis_step.text should be '' (cleared)
    // 2. This prevents hasContent=true in useAutoCollapse
    // 3. Cards stay open until first TEXT chunk
    
    expect(mockContext.work.results.synthesis_step.text).toBe('');
    
    // Verify store was also cleared
    expect(updateWorkResultSpy).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      -1,
      expect.objectContaining({ text: '' })
    );

    await regenPromise;
  });
});
