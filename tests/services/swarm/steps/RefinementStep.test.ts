import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefinementStep } from '@/services/swarm/steps/RefinementStep';
import type { AgentInstruction, MultiAgentConfig, StepContext } from '@/types/steps';
import type { AgentState, Work } from '@/types';
import type { Tool } from '@google/genai';

type RefinementPrivateApi = {
  prepareRefinement: (context: StepContext, index: number, drafts: string[]) => AgentInstruction;
  runAgentRegeneration: (...args: unknown[]) => Promise<{ text: string; work: Work }>;
  executeMultiAgent: (context: StepContext, config: MultiAgentConfig) => Promise<string[]>;
};

const getTextPart = (parts: AgentInstruction['userTurn']['parts'], index: number): string => {
  const part = parts?.[index];
  if (!part || typeof part.text !== 'string') {
    throw new Error(`Expected text part at index ${index}`);
  }
  return part.text;
};

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
  getStepConfig: vi.fn(() => ({
    name: 'Refinement',
    description: 'Refine',
    labels: { working: 'Refining...', done: 'Refined', error: 'Error' }
  })),
  STEPS: { INITIAL: 'initial_step', REFINEMENT: 'refinement_step', SYNTHESIS: 'synthesis_step' }
}));

vi.mock('@/utils/swarm/workHelpers', () => ({
  getStepResults: vi.fn((work, stepId) => {
    return work.results[stepId] || [];
  })
}));

describe('RefinementStep', () => {
  let step: RefinementStep;
  let mockContext: StepContext;

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
    } as unknown as StepContext;
  });

  it('should correctly filter out peer drafts with errors', () => {
    // Agent 1's perspective (index 0)
    // Agent 2 (peer, index 1) has an error
    const drafts = [
      'draft 1', 
      ''
    ];

    const instruction = (step as unknown as RefinementPrivateApi).prepareRefinement(mockContext, 0, drafts);
    
    // parts[0] = base content, parts[1] = internal context, parts[2] = role reminder
    const internalContext = getTextPart(instruction.userTurn.parts, 1);
    
    // The peer draft section should NOT contain agent_2
    expect(internalContext).not.toContain('<draft id="agent_2">');
    // But it doesn't contain agent_1 either because it's the current agent's draft
    expect(internalContext).not.toContain('<draft id="agent_1">');
  });

  it('should fallback to empty string if its own initial draft has an error', () => {
    // Agent 1's perspective, but agent 1 itself failed
    const drafts = [
      '',
      'draft 2'
    ];

    const instruction = (step as unknown as RefinementPrivateApi).prepareRefinement(mockContext, 0, drafts);
    // parts[0] = base content, parts[1] = internal context, parts[2] = role reminder
    const internalContext = getTextPart(instruction.userTurn.parts, 1);
    
    // <my_draft> section should be empty (it will have a blank line due to indentation)
    expect(internalContext).toContain('<my_draft>\n\n  </my_draft>');
    // Peer drafts should contain agent 2
    expect(internalContext).toContain('<draft id="agent_2">');
  });

  it('should include the original query in the prompt context', () => {
    mockContext.userInput = 'How to cook rice?';
    const drafts = ['draft 1', 'draft 2'];
    const instruction = (step as unknown as RefinementPrivateApi).prepareRefinement(mockContext, 0, drafts);
    // parts[0] = base content, parts[1] = internal context, parts[2] = role reminder
    const internalContext = getTextPart(instruction.userTurn.parts, 1);

    expect(internalContext).toContain('<original_query>\n    How to cook rice?\n  </original_query>');
    // Verify role reminder is also present
    const roleReminder = getTextPart(instruction.userTurn.parts, 2);
    expect(roleReminder).toContain('Remember your assigned role: Critic');
  });

  it('should use correctly prepared instruction during regeneration', async () => {
    const runRegenSpy = vi.spyOn(step as unknown as RefinementPrivateApi, 'runAgentRegeneration').mockResolvedValue({
      text: 'refined response', 
      work: mockContext.work 
    });
    const agentStates: AgentState[] = [];
    
    // Set drafts in mockContext - the getStepResults mock will pick them up
    if (!mockContext.work.results) mockContext.work.results = {};
    mockContext.work.results['initial_step'] = ['initial 1', 'initial 2'];
    
    await step.regenerate(mockContext, 1, agentStates);
    
    expect(runRegenSpy).toHaveBeenCalled();
    const [, indexArg, instructionArg] = runRegenSpy.mock.calls[0] as [StepContext, number, AgentInstruction];
    
    expect(indexArg).toBe(1);
    // parts[0] = base content, parts[1] = internal context, parts[2] = role reminder
    const internalContext = getTextPart(instructionArg.userTurn.parts, 1);
    expect(internalContext).toContain('<my_draft>\n    initial 2\n  </my_draft>');
    // Verify role reminder is also present
    const roleReminder = getTextPart(instructionArg.userTurn.parts, 2);
    expect(roleReminder).toContain('Remember your assigned role');
  });

  it('delegates execute to executeMultiAgent with and without refinement search tools', async () => {
    const executeMultiAgentSpy = vi.spyOn(step as unknown as RefinementPrivateApi, 'executeMultiAgent').mockResolvedValue(['refined']);

    mockContext.settings.useSearchInRefinement = true;
    await step.execute(mockContext);
    expect(executeMultiAgentSpy.mock.calls[0][1]).toMatchObject({
      tools: [{ googleSearch: {} }],
      simulateError: mockContext.settings.simulateRefinementError,
      simulateErrorAttempts: mockContext.settings.simulateRefinementErrorAttempts,
    });

    mockContext.settings.useSearchInRefinement = false;
    await step.execute(mockContext);
    expect(executeMultiAgentSpy.mock.calls[1][1]).toMatchObject({
      tools: undefined,
      simulateError: mockContext.settings.simulateRefinementError,
      simulateErrorAttempts: mockContext.settings.simulateRefinementErrorAttempts,
    });
  });

  it('throws when execute is asked to run without initial drafts', async () => {
    if (!mockContext.work.results) mockContext.work.results = {};
    mockContext.work.results.initial_step = [];

    await expect(step.execute(mockContext)).rejects.toThrow('Cannot run refinement step without initial drafts');
  });

  it('throws when regeneration is requested without initial drafts', async () => {
    if (!mockContext.work.results) mockContext.work.results = {};
    mockContext.work.results.initial_step = [];

    await expect(step.regenerate(mockContext, 0, [])).rejects.toThrow('Cannot regenerate refinement without initial drafts');
  });

  it('uses search tools during regeneration and falls back to the first prompt profile', async () => {
    const runRegenSpy = vi.spyOn(step as unknown as RefinementPrivateApi, 'runAgentRegeneration').mockResolvedValue({
      text: 'refined response',
      work: mockContext.work,
    });
    mockContext.settings.useSearchInRefinement = true;
    mockContext.settings.profiles = [
      { id: 'fallback', name: 'Fallback', initialInstruction: '', refinementInstruction: 'Fallback refine', synthesizerInstruction: '' },
      { id: 'other', name: 'Other', initialInstruction: '', refinementInstruction: 'Other refine', synthesizerInstruction: '' },
    ];
    mockContext.settings.activeProfileId = 'missing-profile';

    await step.regenerate(mockContext, 0, []);

    const [, , instructionArg, , , toolsArg] = runRegenSpy.mock.calls[0] as [StepContext, number, AgentInstruction, AgentState[], undefined, Tool[] | undefined];
    expect(instructionArg.systemInstruction).toContain('Fallback refine');
    expect(toolsArg).toEqual([{ googleSearch: {} }]);
  });

  it('falls back to an empty my_draft when the current agent draft is missing entirely', () => {
    const sparseDrafts = ['draft 1'];
    const instruction = (step as unknown as RefinementPrivateApi).prepareRefinement(mockContext, 1, sparseDrafts);
    const internalContext = getTextPart(instruction.userTurn.parts, 1);

    expect(internalContext).toContain('<my_draft>\n\n  </my_draft>');
  });
});
