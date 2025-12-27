import { useMemo } from 'react';
import { Work, AgentState } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { getStepConfig, hasStepContentError } from '@/utils/swarm/stepConstants';
import { getStepResults, getSynthesisResult } from '@/utils/swarm/workHelpers';
import { PrecalculatedResults } from '@/components/chat/ShowWork/types';

export type DisplayStatus = 'waiting' | 'working' | 'done' | 'error';

interface CardStatusResult {
  status: DisplayStatus;
  label: string;
}

/**
 * Hook to compute card status and label for a specific step and agent index.
 * Encapsulates complex logic for determining agent state from work data.
 * 
 * @param work - The work object containing results and states
 * @param step - The step identifier (INITIAL, REFINEMENT, or SYNTHESIS)
 * @param index - The agent index (0 for synthesis)
 * @param effectiveAgentStates - Current agent states (live or from work)
 * @param synthesizerState - Specific state for synthesizer agent
 * @param precalculatedResults - Optional pre-calculated results for optimization
 * @returns Object with status and label for the card
 */
export function useCardStatus(
  work: Work,
  step: StepId,
  index: number,
  effectiveAgentStates: AgentState[] | undefined,
  synthesizerState: AgentState | undefined,
  precalculatedResults?: PrecalculatedResults
): CardStatusResult {
  const config = getStepConfig(step);
  
  // Use pre-calculated results or fallback to calculation (fallback prevents breakage if called without)
  const initialResults = useMemo(() => 
    precalculatedResults?.initial ?? getStepResults(work, STEPS.INITIAL)
  , [work, precalculatedResults?.initial]);

  const refinedResults = useMemo(() => 
    precalculatedResults?.refined ?? getStepResults(work, STEPS.REFINEMENT)
  , [work, precalculatedResults?.refined]);

  const synthesisResult = useMemo(() => 
    precalculatedResults?.synthesis ?? getSynthesisResult(work)
  , [work, precalculatedResults?.synthesis]);
  
  return useMemo(() => {
    // Get the appropriate agent state based on step type
    let currentState: AgentState | undefined;
    
    if (step === STEPS.SYNTHESIS) {
      currentState = synthesizerState;
    } else {
      // For Initial and Refinement steps, only use the state if it matches this specific step
      const candidateState = effectiveAgentStates?.[index];
      // CRITICAL: Only use this state if it belongs to the current step we're rendering
      if (candidateState?.stepId === step) {
        currentState = candidateState;
      }
      // Otherwise currentState remains undefined, falling back to content-based detection
    }
    
    // Get results for this step
    const results = step === STEPS.INITIAL 
      ? initialResults 
      : step === STEPS.REFINEMENT 
        ? refinedResults 
        : null;
    const result = results?.[index];
    
    // Determine status using unified logic
    const isWorking = currentState?.status === 'working';
    
    const hasContentError = step === STEPS.SYNTHESIS
      ? (typeof synthesisResult === 'object' && synthesisResult !== null && 'error' in synthesisResult && synthesisResult.error === true)
      : hasStepContentError(result, step);
    
    const hasStateError = currentState?.status === 'error';
    const hasError = hasContentError || hasStateError;
    
    const synthesisText = typeof synthesisResult === 'string' 
      ? synthesisResult 
      : synthesisResult?.text ?? null;
    const content = step === STEPS.SYNTHESIS ? synthesisText : result;
    const isDone = !!content && !hasError;

    // Return appropriate status and label
    if (isWorking) return { status: 'working', label: currentState?.label || config.labels.working };
    if (hasError) return { status: 'error', label: currentState?.label || config.labels.error };
    if (isDone) return { status: 'done', label: currentState?.label || config.labels.done };
    return { status: 'waiting', label: currentState?.label || config.labels.waiting };
  }, [
    step, 
    index, 
    effectiveAgentStates, 
    synthesizerState, 
    config, 
    initialResults, 
    refinedResults, 
    synthesisResult
  ]);
}
