import { type StepDescriptor, type StepContext } from '@/types/steps';
import { type Work, type AppSettings } from '@/types';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';
import { useAgentStore } from '@/stores/agentStore';

const getLogger = (settings: AppSettings) => new Logger('StepRunner', settings.debugMode);

export interface StepRunResult {
  work: Work;
  paused: boolean;
}

export class StepRunner {
  constructor(private steps: StepDescriptor[]) {}

  private syncContextWorkFromStore(context: StepContext): void {
    const messageId = context.messageId;
    if (!messageId) return;

    const store = useAgentStore.getState();
    const sessionWork = store.sessionsByMessageId[messageId]?.work;
    if (!sessionWork) return;

    context.work = sessionWork;
  }

  async run(
    context: StepContext,
    onPause?: () => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<StepRunResult> {
    const { settings } = context;

    if (context.messageId) {
      const store = useAgentStore.getState();
      const sessionWork = store.sessionsByMessageId[context.messageId]?.work;
      const hasSessionWork = !!sessionWork?.results && Object.keys(sessionWork.results).length > 0;
      if (!hasSessionWork) {
        store.replaceSessionWork(context.messageId, context.work);
      }
      useAgentStore.getState().setSessionStatus(context.messageId, 'running');
    }

    for (const [stepIndex, step] of this.steps.entries()) {
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

        // Persist step completion into the owning session.
        if (context.messageId) {
          useAgentStore.getState().replaceSessionWork(context.messageId, context.work);
          useAgentStore.getState().setSessionStatus(context.messageId, 'running');
        }
      } catch (error) {
        getLogger(settings).debug(`Error in step ${step.id}:`, error);
        if (context.messageId) {
          useAgentStore.getState().setSessionStatus(context.messageId, 'error');
        }
        throw error;
      }

      // 4. Handle Pause Logic
      if (this.shouldPauseAfter(step, settings)) {
        getLogger(settings).debug(`Pausing after step: ${step.id}`);
        if (context.messageId) {
          useAgentStore.getState().setSessionStatus(context.messageId, 'paused');
        }
        
        // Notify UI that we are entering pause state
        if (onPause) onPause();

        return {
          work: context.work,
          paused: true,
        };
      }
    }

    if (context.messageId) {
      useAgentStore.getState().setSessionStatus(context.messageId, 'done');
    }

    return {
      work: context.work,
      paused: false,
    };
  }

  private shouldPauseAfter(step: StepDescriptor, settings: AppSettings): boolean {
    const config = getStepConfig(step.id);
    if (!config?.allowPause || !config.pauseSettingKey) return false;

    return !!settings[config.pauseSettingKey];
  }
}
