import { GoogleGenAI } from '@google/genai';
import { ProxyGenAI } from '@/services/proxy/ProxyGenAI';
import { IS_FORCED_PROXY } from '@/constants';
import { getDirectApiKey } from '@/services/proxy/proxyUtils';
import { AppSettings, Work, AgentState, Message, Source } from '@/types';
import type { MutableRefObject } from 'react';
import { StepRunner } from './StepRunner';
import { InitialStep } from './steps/InitialStep';
import { RefinementStep } from './steps/RefinementStep';
import { SynthesisStep } from './steps/SynthesisStep';
import { StepContext, StepDescriptor, StepId, STEPS } from '@/types/steps';
import { getUpdatedAgentName } from '@/utils/swarm/agentHelpers';
import { Logger } from '@shared/utils/logger';

const getLogger = (settings: AppSettings) => new Logger('GeminiSwarm', settings.debugMode);


export class GeminiService {
  private ai: GoogleGenAI | ProxyGenAI | null = null;
  private steps: StepDescriptor[];

  constructor() {
    // Initialize with default env key if available, but this can be overridden per-run
    const apiKey = getDirectApiKey();
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      this.ai = new ProxyGenAI();
    }
    // Initialize the default pipeline
    this.steps = [
      new InitialStep(),
      new RefinementStep(),
      new SynthesisStep()
    ];
  }

  async runSwarm(
    settings: AppSettings,
    userInput: string,
    image: string | null,
    imageFile: File | null,
    history: Message[],
    onProgress: (status: string, agents: AgentState[], work: Work, isPaused?: boolean) => void,
    onMessageUpdate: (text: string, isFirstChunk: boolean) => void,
    signal: AbortSignal,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>
  ): Promise<{ text: string; sources?: Source[]; work: Work }> {
    
    // Initialize AI client with user key if provided, otherwise fall back to env key
    this.initAiClient(settings.apiKey);

    const liveWork: Work = {
      results: {},
      stepMetadata: [],
      agentNames: Array.from({ length: settings.numAgents }, (_, i) => 
        getUpdatedAgentName(i, STEPS.INITIAL, settings)
      ),
      criticNames: Array.from({ length: settings.numAgents }, (_, i) => 
        getUpdatedAgentName(i, STEPS.REFINEMENT, settings)
      )
    };

    getLogger(settings).debug('runSwarm start', {
      model: settings.model,
      numAgents: settings.numAgents,
      devMode: settings.devMode,
      pauseAfterInitial: settings.pauseAfterInitial
    });

    const context: StepContext = {
      ai: this.ai,
      settings,
      userInput,
      image,
      imageFile,
      history,
      work: liveWork,
      onProgress,
      onMessageUpdate,
      signal
    };

    const runner = new StepRunner(this.steps);
    const finalWork = await runner.run(context, pauseResolverRef);

    // Extract final result from synthesis step
    const synthesisResult = finalWork.results?.[STEPS.SYNTHESIS] as { text?: string; sources?: Source[] } | undefined;
    
    return {
      text: synthesisResult?.text || '',
      sources: synthesisResult?.sources,
      work: finalWork
    };
  }

  async regenerateResponse(
    settings: AppSettings,
    userInput: string,
    image: string | null,
    imageFile: File | null,
    history: Message[],
    agentIndex: number,
    stepId: StepId, // Use formal StepId type
    workContext: Work,
    onUpdate: (text: string, isFirstChunk: boolean) => void,
    onProgress: (status: string, agents: AgentState[], work: Work) => void,
    signal: AbortSignal
  ): Promise<string | { text: string; sources?: Source[] }> {
    // Ensure AI client is updated with the latest key from settings
    this.initAiClient(settings.apiKey);

    // Find the step
    const step = this.steps.find(s => s.id === stepId);
    
    if (!step) {
        throw new Error(`Step ${stepId} not found`);
    }

    if (!step.regenerate) {
        throw new Error(`Step ${stepId} does not support regeneration`);
    }

    // Execute regeneration
    // Create a context that proxies onMessageUpdate to onUpdate for streaming
    const context: StepContext = {
        ai: this.ai,
        settings,
        userInput,
        image,
        imageFile,
        history,
        work: workContext,
        onProgress,
        onMessageUpdate: (text, isFirstChunk) => onUpdate(text, isFirstChunk), // Map message update to the callback
        signal
    };

    return step.regenerate(context, agentIndex) as Promise<string | { text: string; sources?: Source[] }>;
  }

  private initAiClient(providedKey?: string) {
    const apiKey = getDirectApiKey(providedKey);
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      this.ai = new ProxyGenAI();
    }
  }
}
