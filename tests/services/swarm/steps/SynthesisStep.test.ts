import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthesisStep } from '@/services/swarm/steps/SynthesisStep';
import { STEPS, StepContext, StreamConfig } from '@/types/steps';
import { useAgentStore } from '@/stores/agentStore';
import { prepareGeminiContent } from '@/services/swarm/contentUtils';
import { AppSettings, ProviderType, Work } from '@/types';
import { AiProvider } from '@/types/ai-provider';

// Mock dependencies
vi.mock('@/stores/agentStore', () => ({
  useAgentStore: {
    getState: vi.fn(() => ({
      updateSessionAgent: vi.fn(),
      updateSessionWorkResult: vi.fn(),
      replaceSessionWork: vi.fn(),
      updateSessionRuntime: vi.fn(),
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
      initial_step: {
        name: 'Initial',
        namePrefix: 'Agent',
        roleKey: 'roles',
        labels: { done: 'Initial Done', working: 'Initial Working', error: 'Initial Error' }
      },
      refinement_step: {
        name: 'Refinement',
        namePrefix: 'Critic',
        roleKey: 'criticRoles',
        labels: { done: 'Refined', working: 'Refining', error: 'Refinement Error' }
      },
      synthesis_step: { 
          name: 'Synthesis',
          namePrefix: 'Synthesizer Agent',
          labels: { waiting: 'Waiting...', working: 'Synthesizing...', done: 'Done', error: 'Error' }, 
          progressMsg: 'Synthesis Progress' 
      }
    };
    return configs[id] || { labels: {} };
  }),
  STEPS: { INITIAL: 'initial_step', REFINEMENT: 'refinement_step', SYNTHESIS: 'synthesis_step' }
}));

vi.mock('@/utils/swarm/workHelpers', () => ({
  getStepResults: vi.fn((work, stepId) => {
    const raw = work.results?.[stepId];
    return Array.isArray(raw) ? raw : [];
  }),
  getStepThoughts: vi.fn((work, stepId) => {
    const raw = work.results?.[`${stepId}_thoughts`];
    return Array.isArray(raw) ? raw : [];
  }),
  getSynthesisErrorState: vi.fn((work) => {
    const raw = work.results?.[`${STEPS.SYNTHESIS}_error`];
    return raw && typeof raw === 'object' && !Array.isArray(raw) && raw.flag === true ? raw : null;
  }),
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
  type TestWork = Work & { results: NonNullable<Work['results']> };
  type TestContext = StepContext & {
    ai: AiProvider;
    work: TestWork;
    onMessageUpdate: ReturnType<typeof vi.fn>;
    onSynthesisJump: ReturnType<typeof vi.fn>;
  };

  let mockContext: TestContext;
let updateAgentMock: any;
let updateWorkResultMock: any;
let setCurrentWorkMock: any;
let updateSessionRuntimeMock: any;

  const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
    provider: ProviderType.Gemini,
    numAgents: 2,
    apiKey: 'test-key',
    model: 'gemini-pro',
    openRouterModel: 'openrouter/model',
    activeProfileId: 'default',
    profiles: [
      {
        id: 'default',
        name: 'Default',
        initialInstruction: 'Draft an answer',
        refinementInstruction: 'Refine an answer',
        synthesizerInstruction: 'Synthesize default answer'
      },
      {
        id: 'expert',
        name: 'Expert',
        initialInstruction: 'Expert draft',
        refinementInstruction: 'Expert refine',
        synthesizerInstruction: 'Expert synthesis instruction'
      }
    ],
    devMode: false,
    debugMode: false,
    simulateInitialError: 'none',
    simulateRefinementError: 'none',
    simulateSynthesisError: 'none',
    simulateInitialErrorAttempts: 1,
    simulateRefinementErrorAttempts: 1,
    simulateSynthesisErrorAttempts: 1,
    pauseAfterInitial: false,
    pauseAfterRefinement: false,
    useSearchInInitial: false,
    useSearchInRefinement: false,
    useSearchInSynthesis: false,
    temperature: 0.7,
    maxOutputTokens: 1024,
    dynamicAgentRoles: false,
    activeRoleProfileId: 'roles-default',
    roleProfiles: [],
    savedInstructions: [],
    savedRoles: [],
    ...overrides,
  } as AppSettings);

  const createWork = (results: Record<string, any> = {}): TestWork => ({
    results: {
      [STEPS.INITIAL]: ['initial 1', 'initial 2'],
      [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
      ...results,
    },
  } as TestWork);

  const createAiProvider = (settings: AppSettings): AiProvider => ({
    name: ProviderType.Gemini,
    capabilities: {
      search: true,
      vision: true,
      reasoning: true,
      codeExecution: false,
    },
    isProxy: false,
    getEffectiveSettings: vi.fn((providerSettings: AppSettings) => providerSettings),
    getDefaultModel: vi.fn(() => settings.model),
    models: {
      generateContentStream: vi.fn() as AiProvider['models']['generateContentStream'],
    },
  });

  const createContext = (overrides: Record<string, any> = {}): TestContext => {
    const settings = createSettings(overrides.settings);
    const work = overrides.work ?? createWork();
    const { settings: _settingsOverride, work: _workOverride, ...restOverrides } = overrides;

    return {
      ai: createAiProvider(settings),
      history: [{ id: 'history-1', role: 'user', parts: [{ text: 'previous question' }] }],
      userInput: 'Summarize climate change',
      image: null,
      imageFile: null,
      messageId: 'msg-123',
      onMessageUpdate: vi.fn(),
      onSynthesisJump: vi.fn(),
      signal: new AbortController().signal,
      ...restOverrides,
      settings,
      work,
    } as TestContext;
  };

  const getInternalContext = (instruction: any) => {
    const parts = instruction.synthesizerTurn.parts;
    return parts[parts.length - 1].text;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (prepareGeminiContent as any).mockReturnValue({
      history: [{ role: 'model', parts: [{ text: 'previous answer' }] }],
      baseApiParts: [{ text: 'user input' }]
    });
    
    updateAgentMock = vi.fn();
    updateWorkResultMock = vi.fn();
    setCurrentWorkMock = vi.fn();
    updateSessionRuntimeMock = vi.fn();
    (useAgentStore.getState as any).mockReturnValue({
      updateSessionAgent: updateAgentMock,
      updateSessionWorkResult: updateWorkResultMock,
      replaceSessionWork: setCurrentWorkMock,
      updateSessionRuntime: updateSessionRuntimeMock,
      agents: [],
      sessionsByMessageId: {}
    });

    step = new SynthesisStep();
    mockContext = createContext();
  });

  it('should fallback to initial draft if refinement failed for an agent', () => {
    const refinedWithFailure = [
      '',
      'refined 2'
    ];

    const instruction = (step as any).prepareSynthesis(mockContext, refinedWithFailure);
    const internalContext = instruction.synthesizerTurn.parts[instruction.synthesizerTurn.parts.length - 1].text;
    
    expect(internalContext).toContain('<draft id="agent_1">\n      initial 1\n    </draft>');
    expect(internalContext).toContain('<draft id="agent_2">\n      refined 2\n    </draft>');
  });

  it('should trigger Synthesis Jump behavior on the first text chunk', async () => {
    // Calling handleStreamChunk directly as it would be from inside runModelStream
    (step as any).handleStreamChunk(mockContext, 0, 'First chunk', '', null, {
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

    expect(internalContext).toContain('<original_query>\n    Summarize climate change\n  </original_query>');
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
    expect(runRegenSpy.mock.calls[0][3]).toEqual([]);
    expect(result.text).toBe('regen result');
  });

  it('should pass search tools during regeneration when synthesis search is enabled', async () => {
    const runRegenSpy = vi.spyOn(step as any, 'runSynthesisRegeneration').mockResolvedValue({
      text: 'regen search result',
      work: mockContext.work,
      sources: []
    });
    const context = createContext({
      settings: { useSearchInSynthesis: true }
    });

    await step.regenerate(context, 0, []);

    expect(runRegenSpy.mock.calls[0][3]).toEqual([{ googleSearch: {} }]);
  });

  it('should attach extracted sources and trigger synthesis jump on first text chunk during synthesis regeneration', async () => {
    const source = { web: { uri: 'https://source.test', title: 'Source' } };
    const context = createContext({
      work: createWork({
        [STEPS.SYNTHESIS]: ['old final'],
      }),
    });
    const stream = (async function* () {
      yield { text: 'final answer', thought: '', usage: null, groundingChunks: [source] };
    })();

    ((context.ai.models.generateContentStream as unknown) as ReturnType<typeof vi.fn>).mockResolvedValue({ stream });

    const result = await (step as any).runSynthesisRegeneration(
      context,
      {
        systemInstruction: 'system',
        userTurn: { role: 'user', parts: [{ text: 'prompt' }] },
        mainChatHistory: [],
      },
      [{ id: 'synth', name: 'Synthesizer', status: 'done', label: 'Done', messageId: 'msg-123' }],
    );

    expect(result).toMatchObject({
      text: 'final answer',
      sources: [{ uri: 'https://source.test', title: 'Source' }],
    });
    expect(context.work.results[STEPS.SYNTHESIS]).toEqual(['final answer']);
    expect(context.work.results[`${STEPS.SYNTHESIS}_sources`]).toEqual([
      { uri: 'https://source.test', title: 'Source' },
    ]);
    expect(context.onSynthesisJump).toHaveBeenCalledTimes(1);
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

  it('should reject execute when there are no refined drafts', async () => {
    const runModelStreamSpy = vi.spyOn(step as any, 'runModelStream').mockResolvedValue({
      text: 'unused',
      thought: '',
      usage: null,
      groundingChunks: []
    });
    const context = createContext({
      work: createWork({ [STEPS.REFINEMENT]: [] })
    });

    await expect(step.execute(context)).rejects.toThrow('Cannot run synthesis step without refined drafts');

    expect(runModelStreamSpy).not.toHaveBeenCalled();
    expect(context.work.results[STEPS.SYNTHESIS]).toBeUndefined();
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it('should execute synthesis and persist final text with deduplicated sources', async () => {
    const mainChatHistory = [{ role: 'model', parts: [{ text: 'previous answer' }] }];
    (prepareGeminiContent as any).mockReturnValue({
      history: mainChatHistory,
      baseApiParts: [{ text: 'base user part' }]
    });
    const context = createContext({
      settings: { synthesisModel: 'synthesis-specific-model' }
    });
    const groundingChunks = [
      { web: { uri: 'https://a.test', title: 'A' } },
      { web: { uri: 'https://a.test', title: 'Duplicate A' } },
      { web: { uri: 'https://b.test', title: 'B' } }
    ];
    const runModelStreamSpy = vi.spyOn(step as any, 'runModelStream').mockResolvedValue({
      text: 'final answer',
      thought: '',
      usage: null,
      groundingChunks
    });

    const result = await step.execute(context);

    expect(prepareGeminiContent).toHaveBeenCalledWith(
      context.history,
      context.userInput,
      context.image,
      context.imageFile
    );
    expect(runModelStreamSpy).toHaveBeenCalledTimes(1);
    const streamConfig = runModelStreamSpy.mock.calls[0][0] as StreamConfig;
    expect(streamConfig).toMatchObject({
      ai: context.ai,
      settings: context.settings,
      model: 'synthesis-specific-model',
      systemInstruction: expect.stringContaining('Synthesize default answer'),
      agentIndex: 0,
      signal: context.signal,
      simulateError: 'none',
      simulateErrorAttempts: 1,
      work: context.work
    });
    expect(streamConfig.tools).toBeUndefined();
    expect(streamConfig.contents).toHaveLength(2);
    expect(streamConfig.contents[0]).toBe(mainChatHistory[0]);
    expect(streamConfig.contents[1].parts[0]).toEqual({ text: 'base user part' });
    expect(getInternalContext({ synthesizerTurn: streamConfig.contents[1] })).toContain('refined 1');
    expect(result).toEqual(['final answer']);
    expect(context.work.results[STEPS.SYNTHESIS]).toEqual(['final answer']);
    expect(context.work.results[`${STEPS.SYNTHESIS}_sources`]).toEqual([
      { uri: 'https://a.test', title: 'Duplicate A' },
      { uri: 'https://b.test', title: 'B' }
    ]);
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'done',
      'Done',
      'msg-123',
      undefined
    );
  });

  it('should enable search tools and include search guidance when synthesis search is enabled', async () => {
    const context = createContext({
      settings: { useSearchInSynthesis: true }
    });
    const runModelStreamSpy = vi.spyOn(step as any, 'runModelStream').mockResolvedValue({
      text: 'final answer',
      thought: '',
      usage: null,
      groundingChunks: []
    });

    await step.execute(context);

    const streamConfig = runModelStreamSpy.mock.calls[0][0] as StreamConfig;
    expect(streamConfig.tools).toEqual([{ googleSearch: {} }]);
    expect(getInternalContext({ synthesizerTurn: streamConfig.contents[streamConfig.contents.length - 1] }))
      .toContain('<search_instruction>');
  });

  it('should execute debug-mode synthesis with mixed draft states and non-text content parts', async () => {
    (prepareGeminiContent as any).mockReturnValue({
      history: [{ role: 'model', parts: [{ text: 'previous answer' }] }],
      baseApiParts: [
        { inlineData: { mimeType: 'image/png', data: 'abc' } },
        { text: 'base user part' }
      ]
    });
    const context = createContext({
      settings: { numAgents: 3, debugMode: true },
      work: createWork({
        [STEPS.INITIAL]: ['initial 1', '', 'initial 3'],
        [STEPS.REFINEMENT]: [null, '', 'refined 3'],
        [STEPS.SYNTHESIS]: ['old successful answer'],
        [`${STEPS.SYNTHESIS}_error_counts`]: [0]
      })
    });
    const runModelStreamSpy = vi.spyOn(step as any, 'runModelStream').mockResolvedValue({
      text: 'final debug answer',
      thought: '',
      usage: null,
      groundingChunks: []
    });

    const result = await step.execute(context);

    const streamConfig = runModelStreamSpy.mock.calls[0][0] as StreamConfig;
    expect(result).toEqual(['final debug answer']);
    expect(streamConfig.contents[1].parts[0]).toEqual({ inlineData: { mimeType: 'image/png', data: 'abc' } });
    expect(streamConfig.contents[1].parts[1]).toEqual({ text: 'base user part' });
    expect(getInternalContext({ synthesizerTurn: streamConfig.contents[1] })).toContain('initial 1');
    expect(getInternalContext({ synthesizerTurn: streamConfig.contents[1] })).toContain('refined 3');
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'working',
      'Synthesizing...',
      'msg-123',
      'Synthesizer Agent'
    );
    expect(updateAgentMock).not.toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'error',
      'Retrying synthesis...',
      'msg-123',
      'Synthesizer Agent'
    );
  });

  it('should preserve partial synthesis text, clear stale sources, and sync store when execute fails', async () => {
    const usage = { promptTokens: 3, candidatesTokens: 4, totalTokens: 7 };
    const streamError = new Error('Model exploded');
    const context = createContext({
      work: createWork({
        [STEPS.SYNTHESIS]: ['old text'],
        [`${STEPS.SYNTHESIS}_sources`]: [{ uri: 'https://stale.test', title: 'Stale Source' }],
      }),
    });
    vi.spyOn(step as any, 'runModelStream').mockImplementation(async (_config: any, callbacks: any) => {
      callbacks.onChunk('partial text', 'partial thought', usage);
      throw streamError;
    });

    await expect(step.execute(context)).rejects.toBe(streamError);

    expect(updateWorkResultMock).toHaveBeenCalledWith(
      'msg-123',
      STEPS.SYNTHESIS,
      0,
      { text: 'partial text', thought: 'partial thought', usage }
    );
    expect(context.work.results[STEPS.SYNTHESIS]).toEqual(['partial text']);
    expect(context.work.results[`${STEPS.SYNTHESIS}_sources`]).toBeUndefined();
    expect(context.work.results[`${STEPS.SYNTHESIS}_error`]).toEqual({
      flag: true,
      message: expect.any(String)
    });
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'error',
      expect.any(String),
      'msg-123',
      undefined
    );
    expect(setCurrentWorkMock).toHaveBeenCalledWith('msg-123', { ...context.work });
  });

  it('should preserve an empty synthesis shell when execute fails with a non-Error value', async () => {
    const context = createContext();
    vi.spyOn(step as any, 'runModelStream').mockImplementation(async () => {
      throw 'stream exploded';
    });

    await expect(step.execute(context)).rejects.toBe('stream exploded');

    expect(updateWorkResultMock).not.toHaveBeenCalled();
    expect(context.work.results[STEPS.SYNTHESIS]).toEqual(['']);
    expect(context.work.results[`${STEPS.SYNTHESIS}_error`]).toEqual({
      flag: true,
      message: expect.any(String)
    });
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'error',
      expect.any(String),
      'msg-123',
      undefined
    );
    expect(setCurrentWorkMock).toHaveBeenCalledWith('msg-123', { ...context.work });
  });

  it('should initialize synthesis as retrying when previous synthesis ended with an error', async () => {
    const context = createContext({
      work: createWork({
        [STEPS.SYNTHESIS]: ['partial'],
        [`${STEPS.SYNTHESIS}_error`]: {
          flag: true,
          message: 'Previous failure'
        }
      })
    });
    vi.spyOn(step as any, 'runModelStream').mockResolvedValue({
      text: 'recovered answer',
      thought: '',
      usage: null,
      groundingChunks: []
    });

    await step.execute(context);

    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'error',
      'Retrying synthesis...',
      'msg-123',
      'Synthesizer Agent'
    );
  });

  it('should initialize synthesis as retrying when simulated error attempts remain', async () => {
    const context = createContext({
      settings: {
        simulateSynthesisError: '500',
        simulateSynthesisErrorAttempts: 2
      },
      work: createWork({
        [`${STEPS.SYNTHESIS}_error_counts`]: [1]
      })
    });
    vi.spyOn(step as any, 'runModelStream').mockResolvedValue({
      text: 'eventual answer',
      thought: '',
      usage: null,
      groundingChunks: []
    });

    await step.execute(context);

    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'error',
      'Retrying synthesis...',
      'msg-123',
      'Synthesizer Agent'
    );
  });

  it('should update synthesis work before firing the first text jump and only jump once', async () => {
    const context = createContext({
      work: createWork({
        [STEPS.SYNTHESIS]: ['old partial'],
        [`${STEPS.SYNTHESIS}_error`]: {
          flag: true,
          message: 'Previous failure'
        }
      })
    });
    const callOrder: string[] = [];
    const usage = { promptTokens: 1, candidatesTokens: 2, totalTokens: 3 };
    let capturedCallbacks: any;
    let resolveStream!: (value: any) => void;

    updateWorkResultMock.mockImplementation((_messageId: string, _stepId: string, _agentIndex: number, updates: any) => {
      if (updates.text === 'First visible text') {
        callOrder.push('updateWorkResult');
      }
    });
    context.onSynthesisJump.mockImplementation(() => {
      callOrder.push('onSynthesisJump');
    });
    vi.spyOn(step as any, 'runModelStream').mockImplementation((_config: any, callbacks: any) => {
      capturedCallbacks = callbacks;
      return new Promise(resolve => {
        resolveStream = resolve;
      });
    });

    const executePromise = step.execute(context);
    await Promise.resolve();

    expect(capturedCallbacks).toBeDefined();
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'error',
      'Retrying synthesis...',
      'msg-123',
      'Synthesizer Agent'
    );

    capturedCallbacks.onChunk('', 'thought only', usage);
    expect(context.onSynthesisJump).not.toHaveBeenCalled();
    expect(context.work.results[`${STEPS.SYNTHESIS}_thoughts`]).toEqual(['thought only']);

    capturedCallbacks.onChunk('First visible text', 'thought only', usage);
    expect(callOrder).toEqual(['updateWorkResult', 'onSynthesisJump']);
    expect(context.onSynthesisJump).toHaveBeenCalledTimes(1);
    expect(context.work.results[STEPS.SYNTHESIS]).toEqual(['First visible text']);
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'working',
      'Synthesizing...',
      'msg-123',
      undefined
    );

    capturedCallbacks.onChunk('Second visible text', '', null);
    expect(context.onSynthesisJump).toHaveBeenCalledTimes(1);

    resolveStream({
      text: 'Final answer',
      thought: '',
      usage: null,
      groundingChunks: []
    });
    await expect(executePromise).resolves.toEqual(['Final answer']);
  });

  it('should re-arm the first-text jump after a retry callback', async () => {
    const context = createContext();
    let capturedCallbacks: any;
    let resolveStream!: (value: any) => void;

    vi.spyOn(step as any, 'runModelStream').mockImplementation((_config: any, callbacks: any) => {
      capturedCallbacks = callbacks;
      return new Promise(resolve => {
        resolveStream = resolve;
      });
    });

    const executePromise = step.execute(context);
    await Promise.resolve();

    capturedCallbacks.onChunk('First attempt text', '', null);
    expect(context.onSynthesisJump).toHaveBeenCalledTimes(1);

    capturedCallbacks.onRetry(2);
    expect(updateSessionRuntimeMock).toHaveBeenCalledWith('msg-123', { isLoading: true });
    expect(updateAgentMock).toHaveBeenCalledWith(
      STEPS.SYNTHESIS,
      0,
      'done',
      'Retrying (Attempt 2)...',
      'msg-123',
      undefined
    );

    capturedCallbacks.onChunk('Retried text', '', null);
    expect(context.onSynthesisJump).toHaveBeenCalledTimes(2);

    resolveStream({
      text: 'Recovered answer',
      thought: '',
      usage: null,
      groundingChunks: []
    });

    await expect(executePromise).resolves.toEqual(['Recovered answer']);
  });

  it('should capture synthesis debug info with system instruction, history, and user turn', () => {
    const mainChatHistory = [{ role: 'model', parts: [{ text: 'history from helper' }] }];
    (prepareGeminiContent as any).mockReturnValue({
      history: mainChatHistory,
      baseApiParts: [{ text: 'base helper part' }]
    });
    const context = createContext({
      settings: { debugMode: true }
    });

    const instruction = (step as any).prepareSynthesis(context, ['refined 1', 'refined 2']);

    expect(context.work.debugInfo[STEPS.SYNTHESIS]).toEqual({
      systemInstruction: instruction.systemInstruction,
      history: mainChatHistory,
      userTurn: instruction.synthesizerTurn
    });
  });

  it('should use the active synthesis profile and fall back to the first profile when missing', () => {
    const expertContext = createContext({
      settings: { activeProfileId: 'expert' }
    });
    const expertInstruction = (step as any).prepareSynthesis(expertContext, ['refined 1']);

    expect(expertInstruction.systemInstruction).toContain('Expert synthesis instruction');

    const fallbackContext = createContext({
      settings: { activeProfileId: 'missing-profile' }
    });
    const fallbackInstruction = (step as any).prepareSynthesis(fallbackContext, ['refined 1']);

    expect(fallbackInstruction.systemInstruction).toContain('Synthesize default answer');
  });

  it('should use attached-content fallback text when user input is empty', () => {
    const context = createContext({ userInput: '' });

    const instruction = (step as any).prepareSynthesis(context, ['refined 1']);

    expect(getInternalContext(instruction)).toContain('<original_query>\n    (See attached image/content)\n  </original_query>');
  });

  it('should safely build synthesis context even when both refined and initial drafts are empty', () => {
    const context = createContext({
      work: createWork({
        [STEPS.INITIAL]: ['', ''],
        [STEPS.REFINEMENT]: ['', '']
      })
    });

    const instruction = (step as any).prepareSynthesis(context, ['', '']);
    const internalContext = getInternalContext(instruction);

    expect(internalContext).toContain('<agent_drafts>');
    expect(internalContext).toContain('</agent_drafts>');
    expect(internalContext).toContain('<original_query>\n    Summarize climate change\n  </original_query>');
  });
});
