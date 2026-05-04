import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitialStep } from '@/services/swarm/steps/InitialStep';

// Mock dependencies
vi.mock('@/services/swarm/contentUtils', () => ({
  prepareGeminiContent: vi.fn(() => ({
    history: [],
    baseApiParts: [{ text: 'user input' }]
  }))
}));

vi.mock('@/utils/chat/roleUtils', () => ({
  getAgentRole: vi.fn((index) => ({ 
    name: `Agent ${index + 1} Role`, 
    instruction: `Agent ${index + 1} Instruction` 
  }))
}));

vi.mock('@/utils/swarm/stepConstants', () => ({
  getStepConfig: vi.fn((id: string) => ({
    name: 'Initial Step',
    description: 'Initial',
    labels: { working: 'Thinking...', done: 'Done', error: 'Error' }
  })),
  STEPS: { INITIAL: 'initial_step', REFINEMENT: 'refinement_step', SYNTHESIS: 'synthesis_step' }
}));

describe('InitialStep', () => {
  let step: InitialStep;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    step = new InitialStep();
    mockContext = {
      ai: {},
      settings: {
        numAgents: 2,
        profiles: [{ id: 'default', initialInstruction: 'Produce draft' }],
        activeProfileId: 'default',
        dynamicAgentRoles: true
      },
      work: {
        results: {},
        debugInfo: {}
      },
      history: [],
      userInput: 'main question',
      messageId: 'msg-1',
      signal: new AbortController().signal
    };
  });

  it('should prepare unique instructions for each agent based on dynamic roles', () => {
    // Correct method name is prepareInstruction
    const config = (step as any).prepareInstruction(mockContext, 0);
    const config2 = (step as any).prepareInstruction(mockContext, 1);

    expect(config.systemInstruction).toContain('Agent 1 Instruction');
    expect(config2.systemInstruction).toContain('Agent 2 Instruction');
    
    // Mission should be present
    expect(config.systemInstruction).toContain('<mission>');
  });

  it('should include the main question in the user turn', () => {
    mockContext.userInput = 'Find the capital of France';
    const config = (step as any).prepareInstruction(mockContext, 0);
    
    const userTurnText = config.userTurn.parts[0].text;
    expect(userTurnText).toContain('user input'); // From prepareGeminiContent mock
    
    // Check internal bit (it adds role reminder)
    const lastPart = config.userTurn.parts[config.userTurn.parts.length - 1].text;
    expect(lastPart).toContain('Agent 1 Role');
  });

  it('should use the same instruction during regeneration', async () => {
    const runRegenSpy = vi.spyOn(step as any, 'runAgentRegeneration').mockResolvedValue({ 
      text: 'new response', 
      work: mockContext.work 
    });
    const agentStates: any[] = [];
    
    mockContext.userInput = 'Regenerate this';
    
    await step.regenerate(mockContext, 0, agentStates);
    
    expect(runRegenSpy).toHaveBeenCalled();
    const [, indexArg, instructionArg] = runRegenSpy.mock.calls[0] as any[];
    
    expect(indexArg).toBe(0);
    expect(instructionArg.systemInstruction).toContain('Agent 1 Instruction');
    // Verify prepareGeminiContent was used to build base parts
    expect(instructionArg.userTurn.parts[0].text).toBe('user input');
  });

  it('delegates execute to executeMultiAgent with and without initial search tools', async () => {
    const executeMultiAgentSpy = vi.spyOn(step as any, 'executeMultiAgent').mockResolvedValue(['draft']);

    mockContext.settings.useSearchInInitial = true;
    await step.execute(mockContext);
    expect(executeMultiAgentSpy.mock.calls[0][1]).toMatchObject({
      tools: [{ googleSearch: {} }],
      simulateError: mockContext.settings.simulateInitialError,
      simulateErrorAttempts: mockContext.settings.simulateInitialErrorAttempts,
    });
    expect((executeMultiAgentSpy.mock.calls[0][1] as any).prepareAgent(0).systemInstruction).toContain('Agent 1 Instruction');

    mockContext.settings.useSearchInInitial = false;
    await step.execute(mockContext);
    expect(executeMultiAgentSpy.mock.calls[1][1]).toMatchObject({
      tools: undefined,
      simulateError: mockContext.settings.simulateInitialError,
      simulateErrorAttempts: mockContext.settings.simulateInitialErrorAttempts,
    });
  });

  it('falls back to the first prompt profile when activeProfileId is missing', () => {
    mockContext.settings.profiles = [
      { id: 'fallback', initialInstruction: 'Fallback instruction' },
      { id: 'other', initialInstruction: 'Other instruction' },
    ];
    mockContext.settings.activeProfileId = 'missing-profile';

    const config = (step as any).prepareInstruction(mockContext, 0);

    expect(config.systemInstruction).toContain('Fallback instruction');
  });

  it('passes initial search tools during regeneration when search is enabled', async () => {
    const runRegenSpy = vi.spyOn(step as any, 'runAgentRegeneration').mockResolvedValue({
      text: 'search-enabled response',
      work: mockContext.work
    });
    mockContext.settings.useSearchInInitial = true;

    await step.regenerate(mockContext, 0, []);

    expect(runRegenSpy.mock.calls[0][5]).toEqual([{ googleSearch: {} }]);
  });
});
