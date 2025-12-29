import { AppSettings, Work } from '@/types';
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
    (Array.isArray(initialResults) && initialResults.some(r => r && !r.includes('[System:'))) ||
    (Array.isArray(refinementResults) && refinementResults.some(r => r && !r.includes('[System:')))
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
  setLoadingStatus: (s: string) => void,
  setIsPaused: (p: boolean) => void,
  setIsLoading: (l: boolean) => void,
  setCurrentWork: (w: Work | undefined) => void,
  setError: (e: string) => void,
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
    setIsLoading(false);
    setLoadingStatus('Stopped by user');
    return true;
  }

  logger.error('Error in agentic workflow:', error);

  const errorMessage = getFriendlyErrorMessage(error);

  if (hasPartialWorkResults(latestWork)) {
    // Keep results visible and mark as paused so user can retry or see what failed
    logger.info('Partial results detected, pausing instead of unmounting', { 
        status: `Error: ${errorMessage}` 
    });
    setLoadingStatus(`Error: ${errorMessage}`);
    setIsPaused(true);
  } else {
    // Total failure, clean up UI
    logger.error('Total failure (no partial results), unmounting LoadingIndicator', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack'
    });
    setIsLoading(false);
    setCurrentWork(undefined);
    setError(errorMessage);
  }
  
  return false;
}
