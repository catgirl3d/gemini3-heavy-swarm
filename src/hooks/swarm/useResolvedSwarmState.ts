import { useMemo } from 'react';
import { createSessionAgentsSelector, useAgentStore } from '@/stores/agentStore';
import { type Work, type AgentState } from '@/types';
import { type StepId, STEPS } from '@/types/steps';

/**
 * Resolves one agent state from either the active session or a historical snapshot.
 * The caller decides whether live session state is allowed for this message.
 */
export function useResolvedAgentState(
  messageId: string | undefined,
  stepId: StepId,
  agentIndex: number,
  work: Work,
  preferLiveSession: boolean = false,
): AgentState | undefined {
  const sessionAgents = useAgentStore(createSessionAgentsSelector(preferLiveSession ? messageId : undefined));
  
  return useMemo(() => {
    if (preferLiveSession) {
      const liveSessionAgent = sessionAgents?.find(agent =>
        agent.stepId === stepId
        && agent.agentIndex === agentIndex
        && agent.messageId === messageId
      );

      if (liveSessionAgent) {
        return liveSessionAgent;
      }
    }

    if (work.agentStates) {
      return work.agentStates.find(a => 
        a.stepId === stepId && 
        a.agentIndex === agentIndex
      );
    }
    
    return undefined;
  }, [agentIndex, messageId, preferLiveSession, sessionAgents, stepId, work.agentStates]);
}

/**
 * Resolves high-level swarm state for either the active live session or a historical snapshot.
 */
export function useResolvedSwarmState(
  messageId: string | undefined,
  work: Work,
  preferLiveSession: boolean = false,
) {
  const sessionAgents = useAgentStore(createSessionAgentsSelector(preferLiveSession ? messageId : undefined));
  
  const synthesizerState = useMemo(() => {
    if (preferLiveSession) {
      const liveSession = sessionAgents?.find(agent => agent.stepId === STEPS.SYNTHESIS);
      if (liveSession) {
        return liveSession;
      }
    }

    return work.agentStates?.find(a => a.stepId === STEPS.SYNTHESIS);
  }, [preferLiveSession, sessionAgents, work.agentStates]);

  const refinementStarted = useMemo(() => {
    if (preferLiveSession && sessionAgents?.some(agent => agent.stepId === STEPS.REFINEMENT)) {
      return true;
    }

    return work.agentStates?.some(a => a.stepId === STEPS.REFINEMENT) || false;
  }, [preferLiveSession, sessionAgents, work.agentStates]);

  const isEarlyStageWorking = useMemo(() => {
    if (!preferLiveSession) {
      return false;
    }

    return sessionAgents?.some(agent =>
      (agent.stepId === STEPS.INITIAL || agent.stepId === STEPS.REFINEMENT)
      && agent.status === 'working'
    ) || false;
  }, [preferLiveSession, sessionAgents]);

  return {
    synthesizerState,
    refinementStarted,
    isEarlyStageWorking
  };
}
