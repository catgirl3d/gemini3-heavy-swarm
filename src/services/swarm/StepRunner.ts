import { type MutableRefObject } from 'react';
import { type StepDescriptor, type StepContext } from '@/types/steps';
import { type Work, type AppSettings } from '@/types';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';

const getLogger = (settings: AppSettings) => new Logger('StepRunner', settings.debugMode);

export class StepRunner {
  constructor(private steps: StepDescriptor[]) {}

  private syncContextWorkFromStore(context: StepContext): void {
    const messageId = context.messageId;
    if (!messageId) return;

    const store = useAgentStore.getState();
    if (store.currentMessageId !== messageId || !store.currentWork) return;

    context.work = store.currentWork;
  }

  async run(
    context: StepContext,
    pauseResolverRef: MutableRefObject<((value: void | PromiseLike<void>) => void) | null>,
    onPause?: () => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<Work> {
    const { settings } = context;

    for (const step of this.steps) {
      this.syncContextWorkFromStore(context);

      // Skip steps that are already completed (Resume logic)
      const isDone = context.work.stepMetadata?.find(m => m.id === step.id)?.status === 'done';
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
        if (!context.work.results) context.work.results = {};
        const resultKey: string = step.id;
        context.work.results[resultKey] = stepResult;

        // Update metadata
        if (!context.work.stepMetadata) context.work.stepMetadata = [];
        const existingMetaIndex = context.work.stepMetadata.findIndex(m => m.id === step.id);
        if (existingMetaIndex >= 0) {
            context.work.stepMetadata[existingMetaIndex].status = 'done';
        } else {
            context.work.stepMetadata.push({ id: step.id, status: 'done', label: step.name });
        }

        // SYNC: Update global work state to reflect 'done' status immediately (stops timer)
        useAgentStore.getState().setCurrentWork({ ...context.work });
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

        this.syncContextWorkFromStore(context);
        
        getLogger(settings).debug(`Resumed after step: ${step.id}`);
      }
    }

    return context.work;
  }

  private shouldPauseAfter(step: StepDescriptor, settings: AppSettings): boolean {
    const config = getStepConfig(step.id);
    if (!config?.allowPause || !config.pauseSettingKey) return false;

    return !!settings[config.pauseSettingKey];
  }
}
