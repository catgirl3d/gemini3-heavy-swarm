import React, { FC, useEffect } from 'react';
import { AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { AgentAvatar } from '@/components/chat';
import { TimerDisplay } from '@/components/ui/TimerDisplay';
import { Logger } from '@shared/utils/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import './LoadingIndicator.css';

const logger = new Logger('LoadingIndicator', true);

export const LoadingIndicator: FC<{
    status: string;
    agentStates: AgentState[];
    isPaused?: boolean;
    messageId?: string;
    onContinue?: () => void;
    onRegenerate?: (stepId: StepId, agentIndex: number) => void;
    noWrapper?: boolean;
}> = ({ status, agentStates, isPaused, messageId, onContinue, onRegenerate, noWrapper }) => {
  // Check for errors in any step to determine button state
  const erroredAgents = agentStates.filter(a => a.status === 'error' && (!messageId || a.messageId === messageId));
  const isWorking = agentStates.some(a => a.status === 'working' && (!messageId || a.messageId === messageId));
  const isError = !isWorking && (erroredAgents.length > 0 || (typeof status === 'string' && status.startsWith('Error')));

  const handleContinueClick = () => {
    // If we have specific agents in error, retry them individually using the proven regeneration logic
    // This is more reliable than full workflow resume ('onContinue') for step-specific failures
    if (erroredAgents.length > 0 && onRegenerate) {
        erroredAgents.forEach(agent => {
            onRegenerate(agent.stepId, agent.agentIndex);
        });
    } else if (onContinue) {
      // For generic pauses or states without specific agent errors, use Resume logic
      onContinue();
    }
  };

  // Determine button text based on context
  const continueButtonText = isError ? 'Retry' : 'Continue';

  // DYNAMIC STATUS DERIVATION:
  // If the global 'status' prop is generic/empty, OR if it's an error message but agents are working,
  // we derive a more useful status from the active agent states to tell the user what's actually happening.
  let displayStatus = status || 'Initializing...';
  
  const isStatusError = typeof status === 'string' && status.startsWith('Error');
  const shouldDeriveStatus = !status || status === 'Working...' || (isStatusError && isWorking);

  if (shouldDeriveStatus) {
      const activeState = agentStates.find(a => a.status === 'working' || (a.status === 'error' && !isWorking));
      if (activeState) {
          displayStatus = getStepConfig(activeState.stepId).progressMsg;
      } else if (agentStates.some(a => a.stepId === STEPS.INITIAL && a.status === 'waiting')) {
          displayStatus = 'Starting Swarm...';
      }
  }

  useEffect(() => {
    const agentDetails = agentStates.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      label: a.label,
      stepId: a.stepId,
      messageId: a.messageId,
      agentIndex: a.agentIndex
    }));
    
    logger.info('LoadingIndicator RENDER', { 
      status, 
      currentMessageId: messageId,
      agentStatesCount: agentStates.length,
      agents: agentDetails,
      agentsByMessage: agentDetails.reduce((acc, a) => {
        const key = a.messageId || 'no-message-id';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });
    
    return () => {
      logger.warn('LoadingIndicator UNMOUNTED', { 
        lastStatus: status, 
        messageId,
        isPaused, 
        agents: agentDetails
      });
    };
  }, []);

  // Filter agents to show only those belonging to the current generation/regeneration
  // This prevents showing agents from other messages that might be in the store
  const filteredAgents = messageId 
    ? agentStates.filter(agent => agent.messageId === messageId)
    : agentStates;

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
                    <span className="error-message">{displayStatus.replace(/^Error:\s*/i, '')}</span>
                </div>
            </div>
        )}

        <div className={`loading-header ${isError ? 'controls-only' : ''}`}>
            {!isError && <span className="loading-status">{displayStatus}</span>}
            <div className="loading-header-content">
                {isPaused && !isWorking && (onContinue || (erroredAgents.length > 0 && onRegenerate)) && (
                    <button className="continue-button" onClick={handleContinueClick}>
                        {continueButtonText}
                    </button>
                )}
                <TimerDisplay isActive={!isPaused || isWorking} />
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
      <AgentAvatar type="model" />
      {content}
    </div>
  );
};
