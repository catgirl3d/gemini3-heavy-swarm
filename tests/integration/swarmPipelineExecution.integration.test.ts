import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwarmOrchestrator } from '@/services/swarm/SwarmOrchestrator';
import { useAgentStore } from '@/stores/agentStore';
import { ErrorCode } from '@/utils/errors/AppError';
import { createMockSettings } from '@test/settingsMocks';
import type { AppSettings, Message, TokenUsage, Work } from '@/types';
import type { AiProvider, ProviderStreamResult, StreamChunk } from '@/types/ai-provider';
import { ProviderType } from '@/types';
import { STEPS } from '@/types/steps';

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  }
}));

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.getState().clear();
};

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  numAgents: 2,
  provider: ProviderType.Gemini,
  geminiModel: 'gemini-2.5-flash',
  apiKey: 'test-key',
  temperature: 0.7,
  maxOutputTokens: 2048,
  debugMode: false,
  devMode: false,
  activeProfileId: 'default',
  profiles: [
    {
      id: 'default',
      name: 'Default',
      initialInstruction: 'Initial instruction',
      refinementInstruction: 'Refinement instruction',
      synthesizerInstruction: 'Synthesizer instruction',
    },
  ],
  activeRoleProfileId: 'default-role-profile',
  roleProfiles: [
    {
      id: 'default-role-profile',
      name: 'Default Role Set',
      roles: [
        { id: 'role-1', name: 'Role 1', instruction: 'Draft from angle 1' },
        { id: 'role-2', name: 'Role 2', instruction: 'Draft from angle 2' },
      ],
      criticRoles: [
        { id: 'critic-1', name: 'Critic 1', instruction: 'Critique draft 1' },
        { id: 'critic-2', name: 'Critic 2', instruction: 'Critique draft 2' },
      ],
    },
  ],
  dynamicAgentRoles: true,
  useSearchInInitial: false,
  useSearchInRefinement: false,
  useSearchInSynthesis: true,
  ...overrides,
});

const createStream = (...chunks: StreamChunk[]): ProviderStreamResult => {
  const stream = (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();

  return {
    stream,
    [Symbol.asyncIterator]() {
      return stream[Symbol.asyncIterator]();
    },
  };
};

const createUsage = (promptTokens: number, candidatesTokens: number): TokenUsage => ({
  promptTokens,
  candidatesTokens,
  totalTokens: promptTokens + candidatesTokens,
});

const createProvider = (): AiProvider => ({
  name: 'test-provider',
  capabilities: {
    search: true,
    vision: false,
    reasoning: true,
    codeExecution: false,
  },
  isProxy: false,
  getEffectiveSettings: vi.fn((settings: AppSettings) => settings),
  getDefaultModel: vi.fn(() => 'gemini-2.5-flash'),
  models: {
    generateContentStream: vi.fn(),
  },
});

describe('Swarm pipeline execution integration', () => {
  beforeEach(() => {
    resetAgentStore();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    resetAgentStore();
    vi.useRealTimers();
  });

  it('runs the full orchestrator pipeline and commits the real Work contract across initial, refinement, and synthesis', async () => {
    const provider = createProvider();
    vi.mocked(provider.models.generateContentStream)
      .mockResolvedValueOnce(createStream({ text: 'Initial response 1', thought: 'Draft thought 1', usage: createUsage(5, 7), groundingChunks: [] }))
      .mockResolvedValueOnce(createStream({ text: 'Initial response 2', thought: 'Draft thought 2', usage: createUsage(5, 8), groundingChunks: [] }))
      .mockResolvedValueOnce(createStream({ text: 'Refined response 1', thought: 'Critic thought 1', usage: createUsage(6, 9), groundingChunks: [] }))
      .mockResolvedValueOnce(createStream({ text: 'Refined response 2', thought: 'Critic thought 2', usage: createUsage(6, 10), groundingChunks: [] }))
      .mockResolvedValueOnce(createStream({
        text: 'Final synthesized answer',
        thought: 'Synthesis reasoning',
        usage: createUsage(9, 12),
        groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example Source' } }],
      }));

    const orchestrator = new SwarmOrchestrator(provider);
    const result = await orchestrator.runSwarm(
      createSettings(),
      'Test query',
      null,
      null,
      [] as Message[],
      'message-1',
      vi.fn(),
      new AbortController().signal,
    );

    const work = result.work as Work;

    expect(result.paused).toBe(false);
    expect(provider.models.generateContentStream).toHaveBeenCalledTimes(5);
    expect(work.results?.[STEPS.INITIAL]).toEqual(['Initial response 1', 'Initial response 2']);
    expect(work.results?.[`${STEPS.INITIAL}_thoughts`]).toEqual(['Draft thought 1', 'Draft thought 2']);
    expect(work.results?.[`${STEPS.INITIAL}_usage`]).toEqual([createUsage(5, 7), createUsage(5, 8)]);
    expect(work.results?.[STEPS.REFINEMENT]).toEqual(['Refined response 1', 'Refined response 2']);
    expect(work.results?.[`${STEPS.REFINEMENT}_thoughts`]).toEqual(['Critic thought 1', 'Critic thought 2']);
    expect(work.results?.[`${STEPS.REFINEMENT}_usage`]).toEqual([createUsage(6, 9), createUsage(6, 10)]);
    expect(work.results?.[STEPS.SYNTHESIS]).toEqual(['Final synthesized answer']);
    expect(work.results?.[`${STEPS.SYNTHESIS}_thoughts`]).toEqual(['Synthesis reasoning']);
    expect(work.results?.[`${STEPS.SYNTHESIS}_usage`]).toEqual([createUsage(9, 12)]);
    expect(work.results?.[`${STEPS.SYNTHESIS}_sources`]).toEqual([
      { uri: 'https://example.com', title: 'Example Source' },
    ]);
    expect(work.results?.[`${STEPS.SYNTHESIS}_error`]).toBeNull();
    expect(work.stepMetadata).toEqual([
      { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
      { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
      { id: STEPS.SYNTHESIS, status: 'done', label: 'Synthesis Step' },
    ]);
  });

  it('aborts a live orchestrator run before downstream steps start and surfaces the real aborted error contract', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();
    const provider = createProvider();
    vi.mocked(provider.models.generateContentStream).mockResolvedValueOnce({
      stream: (async function* () {
        yield { text: 'partial draft', thought: '', usage: createUsage(1, 1), groundingChunks: [] };
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield { text: 'after abort', thought: '', usage: createUsage(1, 2), groundingChunks: [] };
      })(),
      [Symbol.asyncIterator]() {
        return this.stream[Symbol.asyncIterator]();
      },
    });

    const orchestrator = new SwarmOrchestrator(provider);
    const runPromise = orchestrator.runSwarm(
      createSettings({ numAgents: 1 }),
      'Abort me',
      null,
      null,
      [] as Message[],
      'message-1',
      vi.fn(),
      abortController.signal,
    );
    const abortedRun = expect(runPromise).rejects.toMatchObject({
      code: ErrorCode.ABORTED,
      message: 'Aborted',
    });

    await Promise.resolve();
    abortController.abort();
    await vi.advanceTimersByTimeAsync(50);

    await abortedRun;
    expect(provider.models.generateContentStream).toHaveBeenCalledTimes(1);

    const session = useAgentStore.getState().sessionsByMessageId['message-1'];
    expect(session).toBeDefined();
    expect(session?.work.results?.[STEPS.INITIAL]).toEqual(['']);
    expect(session?.work.results?.[STEPS.REFINEMENT]).toEqual(['']);
    expect(session?.work.results?.[STEPS.SYNTHESIS]).toEqual(['']);
    expect(session?.work.stepMetadata).toEqual([]);
  });
});
