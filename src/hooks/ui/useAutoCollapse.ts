import { useEffect, useMemo, type RefObject } from 'react';
import { type AgentState } from '@/types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('useAutoCollapse');

interface AutoCollapseParams {
  detailsRef: RefObject<HTMLDetailsElement>;
  isLive: boolean;
  isCurrentMessage: boolean;
  messageId: string;
  synthesizerState: AgentState | undefined;
  isEarlyStageWorking: boolean;
  synthesisText: string | null;
}

/**
 * Hook to manage automatic collapsing of agent work details when synthesis starts.
 * 
 * It monitors the synthesizer state and content availability to decide 
 * when it's appropriate to hide the "Work" cards and focus on the final answer.
 */
export function useAutoCollapse({
  detailsRef,
  isLive,
  isCurrentMessage,
  messageId,
  synthesizerState,
  isEarlyStageWorking,
  synthesisText
}: AutoCollapseParams) {
  
  // Decide if we should collapse based on current orchestration state
  // We use useMemo to avoid re-calculating this on every render unless relevant state changes
  const shouldAutoCollapse = useMemo(() => {
    const isWorking = synthesizerState?.status === 'working';
    const isOurMessage = synthesizerState?.messageId === messageId;
    const hasContent = !!(synthesisText && synthesisText.length > 0);
    const isActiveSession = isLive || isCurrentMessage || isOurMessage;
    
    // Decisive condition for auto-collapse:
    // 1. Session must be active (streaming or being viewed as current)
    // 2. Synthesizer must be in 'working' status
    // 3. No early-stage agents (Initial/Refinement) should be working 
    //    (prevents flash-collapsing if synthesis starts while agents are still cleaning up)
    // 4. Actual text content must have arrived (Synthesis Jump)
    const conditionMet = isActiveSession && isWorking && !isEarlyStageWorking && hasContent;

    return conditionMet;
  }, [isLive, isCurrentMessage, messageId, synthesizerState, isEarlyStageWorking, synthesisText]);

  // Execute the collapse side-effect
  useEffect(() => {
    logger.debug('Collapse check', {
      shouldAutoCollapse,
      detailsOpen: detailsRef.current?.open,
      synthesizerStatus: synthesizerState?.status,
      synthesisTextLen: synthesisText?.length
    });

    // Only perform the imperative action if condition is met AND the element is actually open
    if (shouldAutoCollapse && detailsRef.current?.open) {
      logger.info('COLLAPSING CARDS');
      detailsRef.current.open = false;
    }
  }, [shouldAutoCollapse, detailsRef]);
}
