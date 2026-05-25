import { type AppSettings, type Work } from '@/types';
import { STEPS } from '@/types/steps';
import { getFriendlyErrorMessage } from '@/services/swarm/steps/utils/errorUtils';
import { Logger } from '@shared/utils/logger';

/**
 * Checks if a Work object contains any successful (non-system error) responses
 * in initial or refinement steps.
 */
export function hasPartialWorkResults(work: Work | undefined): boolean {
  if (!work) return false;
  
  const initialResults = work.results?.[STEPS.INITIAL];
  const refinementResults = work.results?.[STEPS.REFINEMENT];
  
  return (
    (Array.isArray(initialResults) && initialResults.some(r => r && r.length > 0)) ||
    (Array.isArray(refinementResults) && refinementResults.some(r => r && r.length > 0))
  );
}

/**
 * Handles error reporting and state updates for the swarm workflow.
 * Encapsulates the logic of pausing on partial results vs hiding UI on total failure.
 * 
 * @returns true if error was handled as user action (Aborted), false if real error occurred
 */
export function handleSendMessageError(
  error: unknown,
  latestWork: Work | undefined,
  handlers: {
    onAborted: () => void;
    onPartialFailure: (errorMessage: string) => void;
    onTotalFailure: (errorMessage: string) => void;
  },
  settings: AppSettings
): boolean {
  const logger = new Logger('Swarm', settings.debugMode);
  
  // Handle abort as a normal user action, not an error
  // Covers both Error('Aborted') and DOMException from AbortController
  if (
    (error instanceof Error && error.message === 'Aborted') ||
    (error instanceof DOMException && error.name === 'AbortError')
  ) {
    logger.info('Generation aborted by user - clearing loading state');
    handlers.onAborted();
    return true;
  }

  logger.error('Error in agentic workflow:', error);

  const errorMessage = getFriendlyErrorMessage(error);

  if (hasPartialWorkResults(latestWork)) {
    // Keep results visible. The orchestration layer marks this as recoverable-error
    // so phase-aware UI can show inline retry without using flag combinations.
    logger.info('Partial results detected, pausing instead of unmounting', { 
        status: `Error: ${errorMessage}` 
    });
    handlers.onPartialFailure(errorMessage);
  } else {
    // Total failure, clean up UI
    logger.error('Total failure (no partial results), unmounting LoadingIndicator', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack'
    });
    handlers.onTotalFailure(errorMessage);
  }
  
  return false;
}
