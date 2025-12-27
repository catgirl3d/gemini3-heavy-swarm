import React, { FC } from 'react';
import { AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { AgentAvatar, ShowWork } from '@/components/chat';
import { TimerDisplay } from '@/components/ui/TimerDisplay';
import './LoadingIndicator.css';

export const LoadingIndicator: FC<{
    status: string;
    agentStates: AgentState[];
    currentWork?: Work;
    isPaused?: boolean;
    onContinue?: () => void;
    onRegenerate?: (stepId: StepId, agentIndex: number) => void;
}> = ({ status, agentStates, currentWork, isPaused, onContinue, onRegenerate }) => {
  // Check if synthesizer is in error state - if so, Continue should trigger regeneration
  const synthesizerState = agentStates.find(a => a.id === 'synthesizer_agent');
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

  return (
  <div className="message-wrapper model loading-state">
    <AgentAvatar type="model" />
    <div className="loading-container-wrapper">
        <div className="loading-animation">
        <div className="loading-header">
            <span className="loading-status">{status}</span>
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
            {agentStates.map((agent) => (
            <div key={agent.id} className="agent-progress-item">
                <div className={`agent-icon ${agent.status}`}>
                    {agent.id === 'synthesizer_agent' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 2l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 6 6.5 9.5 3 12l3.5 2.5L9 18l2.5-3.5L15 12l-3.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
                        </svg>
                    ) : (
                        agent.name.split(' ')[1]
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
        {currentWork && (
            <div className="show-work-wrapper">
                <ShowWork
                    work={currentWork}
                    isLive={true}
                    onRegenerate={isPaused ? onRegenerate : undefined}
                />
            </div>
        )}
    </div>
  </div>
);
};
