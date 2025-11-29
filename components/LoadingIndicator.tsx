import React, { FC } from 'react';
import { AgentState, Work } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ShowWork } from './ShowWork';

export const LoadingIndicator: FC<{ status: string; time: number; agentStates: AgentState[]; currentWork?: Work; isPaused?: boolean; onContinue?: () => void }> = ({ status, time, agentStates, currentWork, isPaused, onContinue }) => (
  <div className="message-wrapper model loading-state">
    <AgentAvatar type="model" />
    <div className="loading-container-wrapper" style={{ width: '100%', maxWidth: '800px' }}>
        <div className="loading-animation">
        <div className="loading-header">
            <span className="loading-status">{status}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {isPaused && onContinue && (
                    <button className="continue-button" onClick={onContinue} style={{
                        padding: '0.25rem 0.75rem',
                        fontSize: '0.8rem',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}>
                        Continue
                    </button>
                )}
                <span className="timer-display">{(time / 1000).toFixed(1)}s</span>
            </div>
        </div>
        <div className="agent-progress-list">
            {agentStates.map((agent) => (
            <div key={agent.id} className="agent-progress-item">
                <div className={`agent-icon ${agent.status}`}>
                    {agent.id === 'synthesizer' ? (
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
            <div style={{ marginTop: '1rem' }}>
                <ShowWork work={currentWork} isLive={true} />
            </div>
        )}
    </div>
  </div>
);