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
      setCurrentWork: vi.fn()
    }))
  }
}));

vi.mock('@/services/swarm/contentUtils', () => ({
  prepareGeminiContent: vi.fn(() => ({
    history: [],
    baseApiParts: [{ text: 'user input' }]
  }))
}));

vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn((id: string) => {
    const configs: any = {
      initial_step: { name: 'Initial', labels: { done: 'Initial Done' } },
      refinement_step: { name: 'Refinement', labels: { done: 'Refined' }, errorPattern: '[System: Refinement Failed]' },
      synthesis_step: { 
          name: 'Synthesis',
          labels: { waiting: 'Waiting...', working: 'Synthesizing...', done: 'Done', error: 'Error' }, 
          progressMsg: 'Synthesis Progress' 
      }
    };
    return configs[id] || { labels: {} };
  }),
  STEPS: { INITIAL: 'initial_step', REFINEMENT: 'refinement_step', SYNTHESIS: 'synthesis_step' },
  hasStepContentError: vi.fn((text, stepId) => {
    if (stepId === 'refinement_step') return text?.includes('[System: Refinement Failed]');
    if (stepId === 'initial_step') return text?.includes('[System: Initial Step Failed]');
    return false;
  })
}));

vi.mock('@/utils/swarm/workHelpers', () => ({
  getStepResults: vi.fn((work, stepId) => {
    return work.results[stepId] || [];
  })
}));

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

describe('SynthesisStep', () => {
  let step: SynthesisStep;
  let mockContext: any;
  let updateAgentMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    updateAgentMock = vi.fn();
    (useAgentStore.getState as any).mockReturnValue({
      updateAgent: updateAgentMock,
      updateWorkResult: vi.fn(),
      setCurrentWork: vi.fn(),
      agents: []
    });

    step = new SynthesisStep();
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
        model: 'gemini-pro'
      },
      work: {
        results: {
          initial_step: ['initial 1', 'initial 2'],
          refinement_step: ['refined 1', 'refined 2']
        }
      },
      messageId: 'msg-123',
      onMessageUpdate: vi.fn(),
      signal: new AbortController().signal
    };
  });

  it('should fallback to initial draft if refinement failed for an agent', () => {
    const refinedWithFailure = [
      '[System: Refinement Failed]. error',
      'refined 2'
    ];

    const instruction = (step as any).prepareSynthesis(mockContext, refinedWithFailure);
    const internalContext = instruction.synthesizerTurn.parts[instruction.synthesizerTurn.parts.length - 1].text;
    
    expect(internalContext).toContain('<draft id="agent_1">\ninitial 1\n    </draft>');
    expect(internalContext).toContain('<draft id="agent_2">\nrefined 2\n    </draft>');
  });

  it('should trigger Synthesis Jump behavior on the first text chunk', async () => {
    // Calling handleStreamChunk directly as it would be from inside runModelStream
    (step as any).handleStreamChunk(mockContext, -1, 'First chunk', '', null, {
      isFirstChunk: true,
      agentStates: [],
      statusMsg: 'Synthesis Progress'
    });

    // Check if store updateAgent was called with the correct statusMsg passed in options
    expect(updateAgentMock).toHaveBeenCalledWith(
        'synthesis_step', 
        0, 
        'working',
        'Synthesis Progress',
        'msg-123',
        undefined
    );
  });

  it('should include the original query in the synthesizer context', () => {
    mockContext.userInput = 'Summarize climate change';
    const refined = ['refined 1', 'refined 2'];
    const instruction = (step as any).prepareSynthesis(mockContext, refined);
    const internalContext = instruction.synthesizerTurn.parts[instruction.synthesizerTurn.parts.length - 1].text;

    expect(internalContext).toContain('<original_query>\nSummarize climate change\n</original_query>');
  });

  it('should call runSynthesisRegeneration during regeneration', async () => {
    const runRegenSpy = vi.spyOn(step as any, 'runSynthesisRegeneration').mockResolvedValue({ 
      text: 'regen result', 
      work: mockContext.work,
      sources: []
    });
    const agentStates: any[] = [];
    
    const result = await step.regenerate(mockContext, 0, agentStates);
    
    expect(runRegenSpy).toHaveBeenCalled();
    expect(result.text).toBe('regen result');
  });

  it('should extract unique sources from grounding metadata', () => {
    const groundingChunks = [
      { web: { uri: 'http://test1.com', title: 'Title 1' } },
      { web: { uri: 'http://test1.com', title: 'Duplicate' } },
      { web: { uri: 'http://test2.com', title: 'Title 2' } }
    ];

    const sources = (step as any).extractSources(groundingChunks);

    expect(sources).toHaveLength(2);
    expect(sources[0].uri).toBe('http://test1.com');
    expect(sources[1].uri).toBe('http://test2.com');
  });
});
