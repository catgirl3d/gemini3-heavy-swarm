import React, { type FC, useEffect, useMemo, useRef } from 'react';
import { type AgentState, type Work, type ProviderType, type SwarmSessionPhase } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
import { AgentAvatar } from '@/components/chat';
import { TimerDisplay } from '@/components/ui/TimerDisplay';
import { Logger } from '@shared/utils/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { getContinueButtonState, getErroredAgents, isAnyAgentWorking, handleContinueClick } from '@/utils/swarm/continueHelpers';
import './LoadingIndicator.css';

const logger = new Logger('LoadingIndicator');

type LoadingIndicatorAgentDetail = {
  id: string;
  name: string;
  status: AgentState['status'];
  label: string;
  stepId: AgentState['stepId'];
  messageId: string | undefined;
  agentIndex: number | undefined;
};

type LoadingIndicatorLogSnapshot = {
  status: string;
  phase?: SwarmSessionPhase | null;
  messageId?: string;
  isPausedForAction?: boolean;
  agentDetails: LoadingIndicatorAgentDetail[];
};

const toAgentDetail = (agent: AgentState): LoadingIndicatorAgentDetail => ({
  id: agent.id,
  name: agent.name,
  status: agent.status,
  label: agent.label,
  stepId: agent.stepId,
  messageId: agent.messageId,
  agentIndex: agent.agentIndex
});

const getAgentsByMessage = (agentDetails: LoadingIndicatorAgentDetail[]): Record<string, number> => {
  return agentDetails.reduce<Record<string, number>>((acc, agent) => {
    const key = agent.messageId || 'no-message-id';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
};

const areAgentDetailsEqual = (
  previous: LoadingIndicatorAgentDetail[],
  next: LoadingIndicatorAgentDetail[]
): boolean => {
  return previous.length === next.length && previous.every((agent, index) => {
    const nextAgent = next[index];

    return agent.id === nextAgent.id
      && agent.name === nextAgent.name
      && agent.status === nextAgent.status
      && agent.label === nextAgent.label
      && agent.stepId === nextAgent.stepId
      && agent.messageId === nextAgent.messageId
      && agent.agentIndex === nextAgent.agentIndex;
  });
};

const areLogSnapshotsEqual = (
  previous: LoadingIndicatorLogSnapshot,
  next: LoadingIndicatorLogSnapshot
): boolean => {
  return previous.status === next.status
    && previous.phase === next.phase
    && previous.messageId === next.messageId
    && previous.isPausedForAction === next.isPausedForAction
    && areAgentDetailsEqual(previous.agentDetails, next.agentDetails);
};

export const LoadingIndicator: FC<{
    status: string;
    phase?: SwarmSessionPhase | null;
    progressStatusText?: string;
    agentStates: AgentState[];
    isPausedForAction?: boolean;
    isTimerActive?: boolean;
    inlineErrorMessage?: string | null;
    messageId?: string;
    onContinue?: () => void;
    onRegenerate?: (stepId: StepId, agentIndex: number) => void;
    noWrapper?: boolean;
  work?: Work;
  provider?: ProviderType;
  model?: string;
}> = ({ status, phase, progressStatusText, agentStates, isPausedForAction, isTimerActive, inlineErrorMessage, messageId, onContinue, onRegenerate, noWrapper, work, provider, model }) => {
  const latestLogStateRef = useRef<LoadingIndicatorLogSnapshot | null>(null);

  const filteredAgents = useMemo(() => {
    return messageId
      ? agentStates.filter(agent => agent.messageId === messageId)
      : agentStates;
  }, [agentStates, messageId]);

  const isWorking = isAnyAgentWorking(agentStates, messageId);
  const hasAgentError = !isWorking && getErroredAgents(agentStates, messageId).length > 0;
  const effectivePhase = phase ?? (isPausedForAction ? (hasAgentError ? 'recoverable-error' : 'awaiting-user') : 'running');
  const isError = effectivePhase === 'recoverable-error' || !!inlineErrorMessage;
  const continueButtonState = getContinueButtonState({
    phase: effectivePhase,
    agentStates,
    messageId,
    work,
    hasContinueCallback: !!onContinue,
    hasRegenerateCallback: !!onRegenerate,
  });
  
  const handleClick = () => {
    handleContinueClick(agentStates, messageId, onContinue, onRegenerate);
  };

  // DYNAMIC STATUS DERIVATION:
  // If the status text is generic/empty, or an inline error is being retried while agents are working,
  // we derive a more useful status from the active agent states to tell the user what's actually happening.
  let displayStatus = progressStatusText || status;
  
  const shouldDeriveStatus = !displayStatus || displayStatus === 'Working...' || (isError && isWorking);

  if (shouldDeriveStatus) {
      const activeState = filteredAgents.find(a => a.status === 'working' || (a.status === 'error' && !isWorking));
      if (activeState?.stepId) {
          displayStatus = getStepConfig(activeState.stepId).progressMsg;
      } else if (filteredAgents.some(a => a.stepId === STEPS.INITIAL && a.status === 'waiting')) {
          displayStatus = 'Starting Swarm...';
       }
    }

  if (!displayStatus) {
    displayStatus = 'Initializing...';
  }

  const agentDetails = useMemo(() => filteredAgents.map(toAgentDetail), [filteredAgents]);

  useEffect(() => {
    const nextLogSnapshot: LoadingIndicatorLogSnapshot = {
      status,
      phase: effectivePhase,
      messageId,
      isPausedForAction,
      agentDetails
    };

    const previousLogSnapshot = latestLogStateRef.current;
    latestLogStateRef.current = nextLogSnapshot;

    if (previousLogSnapshot && areLogSnapshotsEqual(previousLogSnapshot, nextLogSnapshot)) {
      return;
    }

    logger.debug('LoadingIndicator RENDER', { 
      status, 
      phase: effectivePhase,
      currentMessageId: messageId,
      agentStatesCount: agentDetails.length,
      agents: agentDetails,
      agentsByMessage: getAgentsByMessage(agentDetails)
    });
  }, [status, effectivePhase, messageId, isPausedForAction, agentDetails]);

  useEffect(() => {
    return () => {
      const lastSnapshot = latestLogStateRef.current;

      if (!lastSnapshot) {
        return;
      }

      logger.debug('LoadingIndicator UNMOUNTED', { 
        lastStatus: lastSnapshot.status,
        lastPhase: lastSnapshot.phase,
        messageId: lastSnapshot.messageId,
        isPausedForAction: lastSnapshot.isPausedForAction,
        agents: lastSnapshot.agentDetails
      });
    };
  }, []);

  const content = (
    <div className="loading-container-wrapper">
        <div className="loading-animation">
        
        {isError && (
            <div className="loading-error-banner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="error-icon-svg">
                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
                <div className="error-content">
                    <span className="error-title">Process Interrupted</span>
                    <span className="error-message">{inlineErrorMessage ?? displayStatus}</span>
                </div>
            </div>
        )}

        <div className={`loading-header ${isError ? 'controls-only' : ''}`}>
            {!isError && <span className="loading-status">{displayStatus}</span>}
            <div className="loading-header-content">
                {/* Continue/Retry visibility is derived from session phase and agent state. */}
                {continueButtonState.visible && (
                    <button className="continue-button" onClick={handleClick}>
                        {continueButtonState.label}
                    </button>
                )}
                <TimerDisplay isActive={isTimerActive ?? (effectivePhase === 'running' || effectivePhase === 'streaming-final')} />
            </div>
        </div>
        <div className="agent-progress-list">
            {filteredAgents.map((agent) => (
            <div key={agent.id} className="agent-progress-item">
                <div className={`agent-icon ${agent.status}`}>
                    {agent.stepId === STEPS.SYNTHESIS ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 2l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 6 6.5 9.5 3 12l3.5 2.5L9 18l2.5-3.5L15 12l-3.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
                        </svg>
                    ) : (
                        agent.name.split(' ')[1] || 'A'
                    )}
                </div>
                <div className="agent-details">
                    <div className="agent-header">
                        <span className="agent-name">{agent.name}</span>
                        <span className="agent-status-text">{agent.label}</span>
                    </div>
                    <div className="agent-progress-track">
                        <div className={`agent-progress-fill ${agent.status}`}></div>
                    </div>
                </div>
            </div>
            ))}
        </div>
        </div>
    </div>
  );

  if (noWrapper) return content;

  return (
    <div className="message-wrapper model loading-state">
      <AgentAvatar type="model" provider={provider} model={model} />
      {content}
    </div>
  );
};
