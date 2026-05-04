import { type MutableRefObject } from 'react';
import { type StepDescriptor, type StepContext } from '@/types/steps';
import { type Work, type AppSettings } from '@/types';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';

const getLogger = (settings: AppSettings) => new Logger('StepRunner', settings.debugMode);

export class StepRunner {
  constructor(private steps: StepDescriptor[]) {}

  async run(
    context: StepContext,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>,
    onPause?: () => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<Work> {
    const { settings, work } = context;

    for (const step of this.steps) {
      // Skip steps that are already completed (Resume logic)
      const isDone = work.stepMetadata?.find(m => m.id === step.id)?.status === 'done';
      if (isDone) {
        getLogger(settings).debug(`Skipping completed step: ${step.id}`);
        continue;
      }

      getLogger(settings).debug(`Starting step: ${step.id}`);
      
      // Update UI status
      const config = getStepConfig(step.id);
      if (onStatusUpdate) {
        onStatusUpdate(config.progressMsg || step.name);
      }
      
      try {
        const stepResult = await step.execute(context);

        // 3. Store Results (Generic)
        if (!work.results) work.results = {};
        (work.results as any)[step.id] = stepResult;

        // Update metadata
        if (!work.stepMetadata) work.stepMetadata = [];
        const existingMetaIndex = work.stepMetadata.findIndex(m => m.id === step.id);
        if (existingMetaIndex >= 0) {
            work.stepMetadata[existingMetaIndex].status = 'done';
        } else {
            work.stepMetadata.push({ id: step.id, status: 'done', label: step.name });
        }

        // SYNC: Update global work state to reflect 'done' status immediately (stops timer)
        useAgentStore.getState().setCurrentWork({ ...work });
      } catch (error) {
        getLogger(settings).debug(`Error in step ${step.id}:`, error);
        throw error;
      }

      // 4. Handle Pause Logic
      if (this.shouldPauseAfter(step, settings)) {
        getLogger(settings).debug(`Pausing after step: ${step.id}`);
        
        // Notify UI that we are entering pause state
        if (onPause) onPause();

        await new Promise<void>(resolve => {
          pauseResolverRef.current = resolve;
        });
        
        getLogger(settings).debug(`Resumed after step: ${step.id}`);
      }
    }

    return work;
  }

  private shouldPauseAfter(step: StepDescriptor, settings: AppSettings): boolean {
    const config = getStepConfig(step.id);
    if (!config?.allowPause || !config.pauseSettingKey) return false;

    return !!settings[config.pauseSettingKey];
  }
}