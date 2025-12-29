import React, { FC, useEffect } from 'react';
import { AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { AgentAvatar } from '@/components/chat';
import { TimerDisplay } from '@/components/ui/TimerDisplay';
import { Logger } from '@shared/utils/logger';
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
  // Check if synthesizer is in error state - if so, Continue should trigger regeneration
  const synthesizerState = agentStates.find(a => 
    a.stepId === STEPS.SYNTHESIS && (!messageId || a.messageId === messageId)
  );
  const isSynthesizerError = synthesizerState?.status === 'error';

  const handleContinueClick = () => {
    if (isSynthesizerError && onRegenerate) {
      // Synthesizer errored - Continue should retry synthesis
      onRegenerate?.(STEPS.SYNTHESIS, 0);
    } else if (onContinue) {
      // Normal pause - continue the workflow
      onContinue();
    }
  };

  // Determine button text based on context
  const continueButtonText = isSynthesizerError ? 'Retry Synthesis' : 'Continue';

  // DYNAMIC STATUS DERIVATION:
  // If the global 'status' prop is generic/empty, we derive a more useful status 
  // from the active agent states to tell the user what's actually happening.
  let displayStatus = status || 'Initializing...';
  
  if (!status || status === 'Working...') {
      const activeState = agentStates.find(a => a.status === 'working' || a.status === 'error');
      if (activeState) {
          if (activeState.stepId === STEPS.INITIAL) displayStatus = 'Step 1/3: Initializing Agents...';
          else if (activeState.stepId === STEPS.REFINEMENT) displayStatus = 'Step 2/3: Refining Content...';
          else if (activeState.stepId === STEPS.SYNTHESIS) displayStatus = 'Step 3/3: Synthesizing Final Answer...';
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
        <div className="loading-header">
            <span className="loading-status">{displayStatus}</span>
            <div className="loading-header-content">
                {isPaused && (onContinue || (isSynthesizerError && onRegenerate)) && (
                    <button className="continue-button" onClick={handleContinueClick}>
                        {continueButtonText}
                    </button>
                )}
                <TimerDisplay isActive={!isPaused} />
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
