import { GoogleGenAI } from '@google/genai';
import { ProxyGenAI } from './ProxyGenAI';
import { AppSettings, Work, AgentState, Message } from '../types';
import type { MutableRefObject } from 'react';
import { StepRunner } from './StepRunner';
import { InitialStep } from './steps/InitialStep';
import { RefinementStep } from './steps/RefinementStep';
import { SynthesisStep } from './steps/SynthesisStep';
import { StepContext, StepDescriptor } from '../types/steps';

const debug = (settings: AppSettings, ...args: any[]) => {
  if (settings.debugMode) {
    // Centralized debug hook for swarm internals
    console.debug('[GeminiSwarm]', ...args);
  }
};

const getAgentPerspective = (index: number, settings: AppSettings): { name: string, instruction: string } => {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];
  const perspectives = activeRoleProfile?.roles || [];
  if (perspectives.length === 0) return { name: `Agent ${index + 1}`, instruction: '' };
  return perspectives[index % perspectives.length];
};

const getCriticPerspective = (index: number, settings: AppSettings): { name: string, instruction: string } => {
  const activeRoleProfile = settings.roleProfiles?.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles?.[0];
  const perspectives = activeRoleProfile?.criticRoles || [];
  if (perspectives.length === 0) return { name: `Critic ${index + 1}`, instruction: '' };
  return perspectives[index % perspectives.length];
};

export class GeminiService {
  private ai: GoogleGenAI | ProxyGenAI | null = null;
  private steps: StepDescriptor[];

  constructor() {
    // Initialize with default env key if available, but this can be overridden per-run
    if (process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
  ): Promise<{ text: string; sources?: any[]; work: Work }> {
    
    // FORCE PROXY FOR LOCAL TESTING (dev mode only):
    // This allows testing server.js logic (rate limits, security headers) locally
    // even if a GEMINI_API_KEY is defined in .env.local.
    // Can be disabled in dev by setting VITE_FORCE_PROXY_OFF=true
    const forceProxy = import.meta.env.DEV && import.meta.env.VITE_FORCE_PROXY_OFF !== 'true';

    // Initialize AI client with user key if provided, otherwise fall back to env key
    const apiKey = !forceProxy && (settings.apiKey || process.env.GEMINI_API_KEY);
    if (apiKey) {
        console.log("Using direct API key from settings/env");
        this.ai = new GoogleGenAI({ apiKey });
    } else {
        // Fallback to proxy if no key is provided OR if forceProxy is enabled
        console.log(`Using ProxyGenAI${forceProxy ? " (FORCED)" : ""}`);
        this.ai = new ProxyGenAI();
    }

    const liveWork: Work = {
      initialResponses: Array(settings.numAgents).fill(null),
      refinedResponses: Array(settings.numAgents).fill(null),
      initialThoughts: Array(settings.numAgents).fill(null),
      refinedThoughts: Array(settings.numAgents).fill(null),
      synthesisThought: null,
      initialTokenUsage: Array(settings.numAgents).fill(null),
      refinedTokenUsage: Array(settings.numAgents).fill(null),
      synthesisTokenUsage: null,
      results: {},
      stepMetadata: [],
      agentNames: Array.from({ length: settings.numAgents }, (_, i) => {
        const role = settings.dynamicAgentRoles ? getAgentPerspective(i, settings).name : null;
        return role ? `Agent ${i + 1} (${role})` : `Agent ${i + 1}`;
      }),
      criticNames: Array.from({ length: settings.numAgents }, (_, i) => {
        const role = settings.dynamicAgentRoles ? getCriticPerspective(i, settings).name : null;
        return role ? `Agent ${i + 1} (${role})` : `Critic ${i + 1}`;
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
    const synthesisResult = finalWork.results?.['synthesis'];
    
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
    stepId: string, // Changed from phase to stepId
    workContext: Work,
    onUpdate: (text: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    // FORCE PROXY FOR LOCAL TESTING - dev mode only (Regeneration)
    // Can be disabled in dev by setting VITE_FORCE_PROXY_OFF=true
    const forceProxy = import.meta.env.DEV && import.meta.env.VITE_FORCE_PROXY_OFF !== 'true';

    // Ensure AI client is updated with the latest key from settings
    const apiKey = !forceProxy && (settings.apiKey || process.env.GEMINI_API_KEY);
    if (apiKey) {
        console.log("Using direct API key from settings/env (regeneration)");
        this.ai = new GoogleGenAI({ apiKey });
    } else {
        console.log(`Using ProxyGenAI${forceProxy ? " (FORCED)" : ""} (regeneration)`);
        this.ai = new ProxyGenAI();
    }

    // Find the step
    const step = this.steps.find(s => s.id === stepId);
    
    // Compatibility layer for legacy calls
    if (!step) {
        if (stepId === 'initial') {
            const initialStep = this.steps.find(s => s.id === 'initial');
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
                    onMessageUpdate: (text) => onUpdate(text),
                    signal
                }, agentIndex);
            }
        } else if (stepId === 'refined') {
             const refinedStep = this.steps.find(s => s.id === 'refined');
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
                    onMessageUpdate: (text) => onUpdate(text),
                    signal
                }, agentIndex);
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
        onProgress: () => {},
        onMessageUpdate: (text) => onUpdate(text), // Map message update to the callback
        signal
    };

    return step.regenerate(context, agentIndex);
  }
}