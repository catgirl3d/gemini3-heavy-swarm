import { useMemo } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { type Work, type AgentState } from '@/types';
import { type StepId, STEPS } from '@/types/steps';

/**
 * Hook to resolve agent state by checking both the live Zustand store 
 * and the historical snapshot in the work object.
 * 
 * This solves the "Dual State" problem by providing a unified source of truth for the UI.
 */
export function useResolvedAgentState(
  messageId: string | undefined,
  stepId: StepId,
  agentIndex: number,
  work: Work
): AgentState | undefined {
  const agents = useAgentStore(state => state.agents);
  
  return useMemo(() => {
    // 1. Try to find in live store (active session)
    const liveAgent = messageId 
      ? agents.find(a => 
          a.stepId === stepId && 
          a.agentIndex === agentIndex && 
          a.messageId === messageId
        )
      : undefined;
      
    if (liveAgent) return liveAgent;
    
    // 2. Fallback to saved states in work (historical record)
    if (work.agentStates) {
      return work.agentStates.find(a => 
        a.stepId === stepId && 
        a.agentIndex === agentIndex
      );
    }
    
    return undefined;
  }, [agents, messageId, stepId, agentIndex, work.agentStates]);
}

/**
 * Hook to resolve high-level swarm states (synthesizer status, refinement start, etc.)
 * by checking both live store and historical snapshot.
 */
export function useResolvedSwarmState(messageId: string | undefined, work: Work) {
  const agents = useAgentStore(state => state.agents);
  
  const synthesizerState = useMemo(() => {
    const live = messageId 
      ? agents.find(a => a.stepId === STEPS.SYNTHESIS && a.messageId === messageId) 
      : undefined;
    if (live) return live;
    return work.agentStates?.find(a => a.stepId === STEPS.SYNTHESIS);
  }, [agents, messageId, work.agentStates]);

  const refinementStarted = useMemo(() => {
    const live = messageId 
      ? agents.some(a => a.stepId === STEPS.REFINEMENT && a.messageId === messageId) 
      : false;
    if (live) return true;
    return work.agentStates?.some(a => a.stepId === STEPS.REFINEMENT) || false;
  }, [agents, messageId, work.agentStates]);

  const isEarlyStageWorking = useMemo(() => {
    // "Working" status is only relevant for live operations
    return messageId 
      ? agents.some(a => 
          a.messageId === messageId && 
          (a.stepId === STEPS.INITIAL || a.stepId === STEPS.REFINEMENT) && 
          a.status === 'working'
        ) 
      : false;
  }, [agents, messageId]);

  return {
    synthesizerState,
    refinementStarted,
    isEarlyStageWorking
  };
}
