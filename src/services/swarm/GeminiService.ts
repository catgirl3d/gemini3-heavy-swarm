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
    messageId: string,
    onMessageUpdate: (text: string, isFirstChunk: boolean) => void,
    signal: AbortSignal,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>,
    onPause?: () => void,
    onStatusUpdate?: (status: string) => void,
    existingWork?: Work
  ): Promise<{ text: string; sources?: Source[]; work: Work }> {
    
    // Initialize AI client with user key if provided, otherwise fall back to env key
    this.initAiClient(settings.apiKey);

    const liveWork: Work = existingWork || {
      results: {
        [STEPS.INITIAL]: new Array(settings.numAgents).fill(''),
        [STEPS.REFINEMENT]: new Array(settings.numAgents).fill(''),
        [STEPS.SYNTHESIS]: {}
      },
      stepMetadata: [],
      agentNames: Array.from({ length: settings.numAgents }, (_, i) =>
        getUpdatedAgentName(i, STEPS.INITIAL, settings)
      ),
      criticNames: Array.from({ length: settings.numAgents }, (_, i) =>
        getUpdatedAgentName(i, STEPS.REFINEMENT, settings)
      )
    };

    getLogger(settings).debug(existingWork ? 'resumeSwarm start' : 'runSwarm start', {
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
      onMessageUpdate,
      signal,
      messageId
    };

    const runner = new StepRunner(this.steps);
    const finalWork = await runner.run(context, pauseResolverRef, onPause, onStatusUpdate);

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
    messageId: string,
    agentIndex: number,
    stepId: StepId, // Use formal StepId type
    workContext: Work,
    agentStates: AgentState[],
    onUpdate: (text: string, isFirstChunk: boolean) => void,
    signal: AbortSignal,
    pauseResolverRef?: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>,
    onPause?: () => void
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
        onMessageUpdate: (text, isFirstChunk) => onUpdate(text, isFirstChunk), // Map message update to the callback
        signal,
        messageId,
        pauseResolverRef,
        onPause
    };

    return step.regenerate(context, agentIndex, agentStates) as Promise<string | { text: string; sources?: Source[] }>;
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
