import { type AiProvider } from '@/types/ai-provider';
import { type AppSettings, type Work, type AgentState, type Message, type Source, type TokenUsage } from '@/types';
import type { MutableRefObject } from 'react';
import { StepRunner } from '@/services/swarm/StepRunner';
import { InitialStep } from '@/services/swarm/steps/InitialStep';
import { RefinementStep } from '@/services/swarm/steps/RefinementStep';
import { SynthesisStep } from '@/services/swarm/steps/SynthesisStep';
import { type StepContext, type StepDescriptor, STEPS, type StepId } from '@/types/steps';
import { getUpdatedAgentName } from '@/utils/swarm/agentHelpers';
import { Logger } from '@shared/utils/logger';

const getLogger = (settings: AppSettings) => new Logger('SwarmOrchestrator', settings.debugMode);

/**
 * SwarmOrchestrator - Orchestrates the multi-agent swarm workflow.
 * Uses Strategy Pattern via AiProvider for LLM communication.
 */
export class SwarmOrchestrator {
  constructor(
    private provider: AiProvider,
    private steps: StepDescriptor[] = [
      new InitialStep(),
      new RefinementStep(),
      new SynthesisStep()
    ]
  ) {}

  /**
   * Runs the complete swarm workflow.
   */
  async runSwarm(
    settings: AppSettings,
    userInput: string,
    image: string | null,
    imageFile: File | null,
    history: Message[],
    messageId: string,
    onMessageUpdate: (text: string, isFirstChunk: boolean, thought?: string, usage?: TokenUsage | null) => void,
    signal: AbortSignal,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>,
    onPause?: () => void,
    onStatusUpdate?: (status: string) => void,
    onSynthesisJump?: () => void,
    existingWork?: Work
  ): Promise<{ text: string; sources?: Source[]; work: Work }> {
    
    // Provider handles its own settings adjustments
    const effectiveSettings = this.provider.getEffectiveSettings(settings);

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
      provider: this.provider.name,
      model: this.provider.getDefaultModel(settings),
      numAgents: settings.numAgents,
      devMode: settings.devMode,
      pauseAfterInitial: settings.pauseAfterInitial
    });

    const context: StepContext = {
      ai: this.provider, // Now uses AiProvider interface
      settings: effectiveSettings,
      userInput,
      image,
      imageFile,
      history,
      work: liveWork,
      onMessageUpdate,
      onSynthesisJump,
      signal,
      messageId
    };

    const runner = new StepRunner(this.steps);
    const finalWork = await runner.run(context, pauseResolverRef, onPause, onStatusUpdate);

    // Extract final result from synthesis step
    const synthesisResult = finalWork.results?.[STEPS.SYNTHESIS] as { text?: string; sources?: Source[]; error?: boolean } | undefined;
    
    // If there was an error in synthesis, we don't want to show partial/error text as final result
    const finalText = synthesisResult?.error ? '' : (synthesisResult?.text || '');
    
    return {
      text: finalText,
      sources: synthesisResult?.sources,
      work: finalWork
    };
  }

  /**
   * Regenerates a specific agent result for a given step.
   */
  async regenerateResponse(
    settings: AppSettings,
    userInput: string,
    image: string | null,
    imageFile: File | null,
    history: Message[],
    messageId: string,
    agentIndex: number,
    stepId: StepId,
    workContext: Work,
    agentStates: AgentState[],
    onUpdate: (text: string, isFirstChunk: boolean, thought?: string, usage?: TokenUsage | null) => void,
    signal: AbortSignal,
    pauseResolverRef?: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>,
    onPause?: () => void,
    onSynthesisJump?: () => void
  ): Promise<{ text: string; sources?: Source[]; work: Work }> {
    
    // Provider handles its own settings adjustments
    const effectiveSettings = this.provider.getEffectiveSettings(settings);

    // Find the step
    const step = this.steps.find(s => s.id === stepId);
    
    if (!step) {
        throw new Error(`Step ${stepId} not found`);
    }

    if (!step.regenerate) {
        throw new Error(`Step ${stepId} does not support regeneration`);
    }

    // Execute regeneration
    const context: StepContext = {
        ai: this.provider, // Now uses AiProvider interface
        settings: effectiveSettings,
        userInput,
        image,
        imageFile,
        history,
        work: workContext,
        onMessageUpdate: (text, isFirstChunk, thought, usage) => onUpdate(text, isFirstChunk, thought, usage),
        onSynthesisJump,
        signal,
        messageId,
        pauseResolverRef,
        onPause
    };

    return step.regenerate(context, agentIndex, agentStates) as Promise<{ text: string; sources?: Source[]; work: Work }>;
  }
}
