import { GoogleGenAI } from '@google/genai';
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

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private steps: StepDescriptor[];

  constructor() {
    if (process.env.API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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