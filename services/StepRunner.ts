import { MutableRefObject } from 'react';
import { StepDescriptor, StepContext } from '../types/steps';
import { Work, AppSettings, AgentState } from '../types';

const debug = (settings: AppSettings, ...args: unknown[]) => {
  if (settings.debugMode) {
    console.debug('[StepRunner]', ...args);
  }
};

export class StepRunner {
  constructor(private steps: StepDescriptor[]) {}

  async run(
    context: StepContext,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>
  ): Promise<Work> {
    const { settings, onProgress: originalOnProgress } = context;
    let currentWork = context.work;

    // Wrap onProgress to keep currentWork.agentStates in sync
    const onProgress = (status: string, agents: AgentState[], work: Work, isPaused?: boolean) => {
      currentWork.agentStates = agents;
      originalOnProgress(status, agents, work, isPaused);
    };

    // Reconstruct context with wrapped onProgress
    const runnerContext = { ...context, onProgress };

    for (const step of this.steps) {
      debug(settings, `Starting step: ${step.id}`);

      // 1. Update Status
      // We need to construct a meaningful status update. 
      // Since we don't know the exact agent states at the start of a generic step,
      // we rely on the step implementation to call onProgress with detailed states.
      // However, we can send a high-level "Starting..." update.
      
      // 2. Execute Step
      try {
        const stepResult = await step.execute({
          ...runnerContext,
          work: currentWork // Pass the latest work
        });

        // 3. Store Results (Generic)
        // Note: `as any` is required here because StepRunner is generic and stepResult is unknown.
        // Type safety is ensured by step implementations returning correct types.
        if (!currentWork.results) currentWork.results = {};
        (currentWork.results as any)[step.id] = stepResult;

        // Update metadata
        if (!currentWork.stepMetadata) currentWork.stepMetadata = [];
        const existingMetaIndex = currentWork.stepMetadata.findIndex(m => m.id === step.id);
        if (existingMetaIndex >= 0) {
            currentWork.stepMetadata[existingMetaIndex].status = 'done';
        } else {
            currentWork.stepMetadata.push({ id: step.id, status: 'done', label: step.name });
        }

      } catch (error) {
        console.error(`Error in step ${step.id}:`, error);
        throw error;
      }

      // 4. Handle Pause Logic
      if (this.shouldPauseAfter(step, settings)) {
        debug(settings, `Pausing after step: ${step.id}`);
        
        // We need to reconstruct the current agent states for the pause UI
        // This is a bit tricky since the step just finished. 
        // We'll use the agentStates from the work object if available, or generate a default "Done" state.
        const pauseStates: AgentState[] = currentWork.agentStates || Array.from({ length: settings.numAgents }, (_, i) => ({
            id: `agent-${i}`,
            name: `Agent ${i + 1}`,
            status: 'done',
            label: 'Paused'
        }));

        onProgress('Paused. Waiting for user confirmation...', pauseStates, currentWork, true); // isPaused = true
        
        await new Promise<void>(resolve => {
          pauseResolverRef.current = resolve;
        });
        
        debug(settings, `Resumed after step: ${step.id}`);
      }
    }

    return currentWork;
  }

  private shouldPauseAfter(step: StepDescriptor, settings: AppSettings): boolean {
    // Map legacy settings to step IDs
    // In the future, this could be driven by a more generic configuration
    if (step.id === 'initial_step' && settings.pauseAfterInitial) return true;
    if (step.id === 'refinement_step' && settings.pauseAfterRefinement) return true;
    return false;
  }
}