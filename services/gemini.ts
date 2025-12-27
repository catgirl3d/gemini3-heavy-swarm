import { GoogleGenAI } from '@google/genai';
import { ProxyGenAI } from '@/services/ProxyGenAI';
import { IS_FORCED_PROXY } from '@/constants';
import { getDirectApiKey } from '@/services/proxyUtils';
import { AppSettings, Work, AgentState, Message, Source } from '@/types';
import type { MutableRefObject } from 'react';
import { StepRunner } from '@/services/StepRunner';
import { InitialStep } from '@/services/steps/InitialStep';
import { RefinementStep } from '@/services/steps/RefinementStep';
import { SynthesisStep } from '@/services/steps/SynthesisStep';
import { StepContext, StepDescriptor, StepId } from '@/types/steps';
import { getAgentRole } from '@/services/steps/utils/roleUtils';

const debug = (settings: AppSettings, ...args: unknown[]) => {
  if (settings.debugMode) {
    // Centralized debug hook for swarm internals
    console.debug('[GeminiSwarm]', ...args);
  }
};


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
    onMessageUpdate: (text: string, isFinal: boolean) => void,
    signal: AbortSignal,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>
  ): Promise<{ text: string; sources?: Source[]; work: Work }> {
    
    // Initialize AI client with user key if provided, otherwise fall back to env key
    // Initialize AI client with user key if provided, otherwise fall back to env key
    const apiKey = getDirectApiKey(settings.apiKey);
    if (apiKey) {
        console.log("Using direct API key from settings/env");
        this.ai = new GoogleGenAI({ apiKey });
    } else {
        // Fallback to proxy if no key is provided OR if IS_FORCED_PROXY is enabled
        console.log(`Using ProxyGenAI${IS_FORCED_PROXY ? " (FORCED)" : ""}`);
        this.ai = new ProxyGenAI();
    }

    const liveWork: Work = {
      results: {},
      stepMetadata: [],
      agentNames: Array.from({ length: settings.numAgents }, (_, i) => {
        const role = settings.dynamicAgentRoles ? getAgentRole(i, settings, 'roles').name : null;
        return role ? `Agent ${i + 1} (${role})` : `Agent ${i + 1}`;
      }),
      criticNames: Array.from({ length: settings.numAgents }, (_, i) => {
        const role = settings.dynamicAgentRoles ? getAgentRole(i, settings, 'criticRoles').name : null;
        return role ? `Critic ${i + 1} (${role})` : `Critic ${i + 1}`;
      })
    };

    debug(settings, 'runSwarm start', {
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
    const synthesisResult = finalWork.results?.['synthesis_step'] as { text?: string; sources?: Source[] } | undefined;
    
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
    // Ensure AI client is updated with the latest key from settings
    const apiKey = getDirectApiKey(settings.apiKey);
    if (apiKey) {
        console.log("Using direct API key from settings/env (regeneration)");
        this.ai = new GoogleGenAI({ apiKey });
    } else {
        console.log(`Using ProxyGenAI${IS_FORCED_PROXY ? " (FORCED)" : ""} (regeneration)`);
        this.ai = new ProxyGenAI();
    }

    // Find the step
    const step = this.steps.find(s => s.id === stepId);
    
    // Compatibility layer for legacy calls
    if (!step) {
        if (stepId === 'initial_step') {
            const initialStep = this.steps.find(s => s.id === 'initial_step');
            if (initialStep && initialStep.regenerate) {
                 return initialStep.regenerate({
                    ai: this.ai,
                    settings,
                    userInput,
                    image,
                    imageFile,
                    history,
                    work: workContext,
                    onProgress: () => {}, // No-op for regeneration
                    onMessageUpdate: (text, isFirstChunk) => onUpdate(text, isFirstChunk),
                    signal
                }, agentIndex) as Promise<string>;
            }
        } else if (stepId === 'refinement_step') {
             const refinedStep = this.steps.find(s => s.id === 'refinement_step');
             if (refinedStep && refinedStep.regenerate) {
                 return refinedStep.regenerate({
                    ai: this.ai,
                    settings,
                    userInput,
                    image,
                    imageFile,
                    history,
                    work: workContext,
                    onProgress: () => {}, // No-op for regeneration
                    onMessageUpdate: (text, isFirstChunk) => onUpdate(text, isFirstChunk),
                    signal
                }, agentIndex) as Promise<string>;
             }
        }
        throw new Error(`Step ${stepId} not found or does not support regeneration`);
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
}