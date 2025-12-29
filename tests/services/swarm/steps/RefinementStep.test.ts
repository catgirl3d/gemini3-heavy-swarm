import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefinementStep } from '@/services/swarm/steps/RefinementStep';

// Mock dependencies
vi.mock('@/services/swarm/contentUtils', () => ({
  prepareGeminiContent: vi.fn(() => ({
    history: [],
    baseApiParts: [{ text: 'user input' }]
  }))
}));

vi.mock('@/utils/chat/roleUtils', () => ({
  getAgentRole: vi.fn(() => ({ name: 'Critic', instruction: 'Review' }))
}));

vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn((id: string) => ({
    name: 'Refinement',
    description: 'Refine',
    labels: { working: 'Refining...', done: 'Refined', error: 'Error' },
    errorPattern: '[System: Initial Step Failed]'
  })),
  STEPS: { INITIAL: 'initial_step', REFINEMENT: 'refinement_step', SYNTHESIS: 'synthesis_step' },
  hasStepContentError: vi.fn((text) => text?.includes('[System: Initial Step Failed]'))
}));

vi.mock('@/utils/swarm/workHelpers', () => ({
  getStepResults: vi.fn((work, stepId) => {
    return work.results[stepId] || [];
  })
}));

describe('RefinementStep', () => {
  let step: RefinementStep;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    step = new RefinementStep();
    mockContext = {
      ai: {},
      settings: {
        numAgents: 2,
        profiles: [{ id: 'default', refinementInstruction: 'Refine this' }],
        activeProfileId: 'default',
        dynamicAgentRoles: true
      },
      work: {
        results: {
          initial_step: ['draft 1', 'draft 2']
        }
      },
      history: [],
      userInput: 'test query',
      signal: new AbortController().signal
    };
  });

  it('should correctly filter out peer drafts with errors', () => {
    // Agent 1's perspective (index 0)
    // Agent 2 (peer, index 1) has an error
    const drafts = [
      'draft 1', 
      '[System: Initial Step Failed]. Some error'
    ];

    const instruction = (step as any).prepareRefinement(mockContext, 0, drafts);
    
    const internalContext = instruction.userTurn.parts[instruction.userTurn.parts.length - 1].text;
    
    // The peer draft section should NOT contain agent_2
    expect(internalContext).not.toContain('<draft id="agent_2">');
    // But it doesn't contain agent_1 either because it's the current agent's draft
    expect(internalContext).not.toContain('<draft id="agent_1">');
  });

  it('should fallback to empty string if its own initial draft has an error', () => {
    // Agent 1's perspective, but agent 1 itself failed
    const drafts = [
      '[System: Initial Step Failed]. error',
      'draft 2'
    ];

    const instruction = (step as any).prepareRefinement(mockContext, 0, drafts);
    const internalContext = instruction.userTurn.parts[instruction.userTurn.parts.length - 1].text;
    
    // <my_draft> section should be empty
    expect(internalContext).toContain('<my_draft>\n\n</my_draft>');
    // Peer drafts should contain agent 2
    expect(internalContext).toContain('<draft id="agent_2">');
  });

  it('should include the original query in the prompt context', () => {
    mockContext.userInput = 'How to cook rice?';
    const drafts = ['draft 1', 'draft 2'];
    const instruction = (step as any).prepareRefinement(mockContext, 0, drafts);
    const internalContext = instruction.userTurn.parts[instruction.userTurn.parts.length - 1].text;

    expect(internalContext).toContain('<original_query>\nHow to cook rice?\n</original_query>');
  });

  it('should use correctly prepared instruction during regeneration', async () => {
    const runRegenSpy = vi.spyOn(step as any, 'runAgentRegeneration').mockResolvedValue('refined response');
    const agentStates: any[] = [];
    
    // Set drafts in mockContext - the getStepResults mock will pick them up
    mockContext.work.results['initial_step'] = ['initial 1', 'initial 2'];
    
    await step.regenerate(mockContext, 1, agentStates);
    
    expect(runRegenSpy).toHaveBeenCalled();
    const [_, indexArg, instructionArg] = runRegenSpy.mock.calls[0];
    
    expect(indexArg).toBe(1);
    const internalContext = instructionArg.userTurn.parts[instructionArg.userTurn.parts.length - 1].text;
    expect(internalContext).toContain('<my_draft>\ninitial 2\n</my_draft>');
  });
});
