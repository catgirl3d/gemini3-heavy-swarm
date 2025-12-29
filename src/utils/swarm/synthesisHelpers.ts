import { STEPS } from '@/types/steps';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('SynthesisJump', true);

/**
 * Shared logic for the "Synthesis Jump" behavior.
 * This hides loading indicators and unpauses the UI when the first chunk of synthesis arrives.
 * 
 * @param setIsLoading - State setter for loading status
 * @param setIsPaused - State setter for pause status
 * @param onJump - Optional callback for additional jump logic (e.g., updating agent status)
 */
export function handleSynthesisJump(
  setIsLoading: (b: boolean) => void,
  setIsPaused: (b: boolean) => void,
  onJump?: () => void
) {
  logger.info('SYNTHESIS JUMP - First chunk received, hiding LoadingIndicator');
  setIsLoading(false);
  setIsPaused(false);
  onJump?.();
}

/**
 * Returns the standard "working" label for the synthesis step.
 */
export function getSynthesisWorkingLabel(): string {
  return getStepConfig(STEPS.SYNTHESIS).labels.working;
}
