import React, { FC, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Work, AgentState } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

const WorkModal: FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return createPortal(
    <div className="work-modal-overlay" onClick={onClose}>
      <div className="work-modal" onClick={e => e.stopPropagation()}>
        <div className="work-modal-header">
          <h3>{title}</h3>
          <button className="close-modal-button" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div className="work-modal-body">
            <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>,
    document.body
  );
};

export const ShowWork: FC<{
  work: Work,
  isLive?: boolean,
  liveAgentStates?: AgentState[],
  onRegenerate?: (stepId: string, agentIndex: number) => void
}> = ({ work, isLive = false, liveAgentStates, onRegenerate }) => {
  const [modalData, setModalData] = useState<{title: string, content: string} | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Determine if refinement has started by checking if any refined response is not null
  const isRefinementStarted = work.refinedResponses.some(r => r !== null);
  const effectiveAgentStates = (isLive && liveAgentStates ? liveAgentStates : work.agentStates);
  const synthesizerState = effectiveAgentStates?.find(a => a.id === 'synthesizer');
  const synthesisResult = work.results?.['synthesis'];
  const synthesisText: string | null =
    typeof synthesisResult === 'string'
      ? synthesisResult
      : synthesisResult?.text ?? null;
  
  const renderContent = (content: string | null) => {
    if (content === null) return <div className="pending-work">Waiting for agent output...</div>;
    if (content === '') return <div className="pending-work">Thinking...</div>;
    return <MarkdownRenderer content={content} />;
  };

  return (
    <>
    <details className="show-work-container" ref={detailsRef}>
      <summary className={`show-work-button ${!isLive ? 'completed' : ''}`}>
        <span>{isLive ? 'Show Agent Work (Live)' : 'View Full Agent Swarm Process'}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="work-arrow">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="work-details">
        <div className="work-category">
          <h4 className="work-category-title">Initial Drafts</h4>
          <div className={`work-grid ${work.initialResponses.length === 1 ? 'single-column' : ''}`}>
            {work.initialResponses.map((resp, i) => (
              <div key={`initial-${i}`} className={`work-card ${effectiveAgentStates?.[i]?.status === 'error' ? 'error' : ''}`}>
                <div className="work-card-header">
                    <div className="work-card-title-group">
                        {(() => {
                            const currentState = effectiveAgentStates?.[i];
                            const isWorkingOnInitial = currentState?.label === 'Drafting initial response...' || currentState?.label === 'Regenerating Draft...';
                            const hasInitialError = work.initialResponses[i]?.includes('[System: Agent failed to complete.');
                            const isInitialDone = !!work.initialResponses[i] && !hasInitialError;
                            
                            // Determine display state for Initial Card
                            let displayStatus: 'working' | 'done' | 'error' | 'waiting' = 'waiting';
                            let displayLabel = '';

                            if (isWorkingOnInitial) {
                                displayStatus = 'working';
                                displayLabel = currentState?.label || 'Drafting...';
                            } else if (hasInitialError) {
                                displayStatus = 'error';
                                displayLabel = 'Draft Failed';
                            } else if (isInitialDone) {
                                displayStatus = 'done';
                                displayLabel = 'Drafted';
                            } else {
                                displayStatus = 'waiting';
                                displayLabel = 'Waiting...';
                            }

                            return (
                                <>
                                <div className={`work-card-icon ${displayStatus}`}>
                                    {displayStatus === 'working' ? (
                                        <svg className="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : displayStatus === 'error' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                                        </svg>
                                    ) : displayStatus === 'done' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        i + 1
                                    )}
                                </div>
                                <div className="work-card-info">
                                    <span>{work.agentNames ? work.agentNames[i] : `Agent ${i + 1}`}</span>
                                    <span className={`work-card-status ${displayStatus === 'error' ? 'error' : ''}`}>
                                        {displayLabel}
                                    </span>
                                </div>
                                </>
                            );
                        })()}
                    </div>
                    {resp && (
                        <div className="work-card-actions">
                            {onRegenerate && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onRegenerate('initial', i);
                                    }}
                                    title="Regenerate Response"
                                    aria-label="Regenerate Response"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                                    </svg>
                                </button>
                            )}
                            <button
                                className="expand-work-button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setModalData({ title: `Agent ${i + 1} - Initial Draft`, content: resp });
                                }}
                                title="Expand Response"
                                aria-label="Expand Response"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
                <div className="work-card-body">
                    {renderContent(resp)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="work-category">
          <h4 className="work-category-title">Critiques & Refinements</h4>
           <div className={`work-grid ${work.refinedResponses.length === 1 ? 'single-column' : ''}`}>
            {work.refinedResponses.map((resp, i) => (
              <div key={`refined-${i}`} className={`work-card refined ${effectiveAgentStates?.[i]?.status === 'error' ? 'error' : ''}`}>
                 <div className="work-card-header">
                    <div className="work-card-title-group">
                        {(() => {
                            const currentState = effectiveAgentStates?.[i];
                            const isWorkingOnRefinement = currentState?.label === 'Critiquing & Refining...' || currentState?.label === 'Regenerating Critique...';
                            const hasRefinementError = work.refinedResponses[i]?.includes('[System: Agent failed to refine.');
                            const isRefinementDone = !!work.refinedResponses[i] && !hasRefinementError;
                            
                            // Determine display state for Refinement Card
                            let displayStatus: 'working' | 'done' | 'error' | 'waiting' = 'waiting';
                            let displayLabel = '';

                            if (isWorkingOnRefinement) {
                                displayStatus = 'working';
                                displayLabel = currentState?.label || 'Refining...';
                            } else if (hasRefinementError) {
                                displayStatus = 'error';
                                displayLabel = 'Refinement Failed';
                            } else if (isRefinementDone) {
                                displayStatus = 'done';
                                displayLabel = 'Refined';
                            } else {
                                displayStatus = 'waiting';
                                displayLabel = 'Waiting...';
                            }

                            return (
                                <>
                                <div className={`work-card-icon ${displayStatus}`}>
                                    {displayStatus === 'working' ? (
                                        <svg className="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : displayStatus === 'error' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                                        </svg>
                                    ) : displayStatus === 'done' ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        i + 1
                                    )}
                                </div>
                                <div className="work-card-info">
                                    <span>{`Agent ${i + 1}`}</span>
                                    <span className={`work-card-status ${displayStatus === 'error' ? 'error' : ''}`}>
                                        {displayLabel}
                                    </span>
                                </div>
                                </>
                            );
                        })()}
                    </div>
                    {resp && (
                        <div className="work-card-actions">
                            {onRegenerate && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onRegenerate('refined', i);
                                    }}
                                    title="Regenerate Response"
                                    aria-label="Regenerate Response"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                                    </svg>
                                </button>
                            )}
                            <button
                                className="expand-work-button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setModalData({ title: `Agent ${i + 1} - Refined Response`, content: resp });
                                }}
                                title="Expand Response"
                                aria-label="Expand Response"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                                </svg>
                            </button>
                        </div>
                    )}
                 </div>
                 <div className="work-card-body">
                    {renderContent(resp)}
                 </div>
              </div>
            ))}
          </div>
        </div>
        {synthesizerState && (
            <div className="work-category">
                <h4 className="work-category-title">Final Synthesis</h4>
                <div className={`work-card synthesizer ${synthesizerState.status === 'error' ? 'error' : ''}`}>
                    <div className="work-card-header">
                        <div className="work-card-title-group">
                            <div className={`work-card-icon ${synthesizerState.status === 'working' ? 'working' : synthesizerState.status === 'error' ? 'error' : 'done'}`}>
                                {synthesizerState.status === 'working' ? (
                                    <svg className="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : synthesizerState.status === 'error' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <div className="work-card-info">
                                <span>Synthesizer</span>
                                <span className={`work-card-status ${synthesizerState.status === 'error' ? 'error' : ''}`}>
                                    {synthesizerState.label}
                                </span>
                            </div>
                        </div>
                        {onRegenerate && (
                            <button
                                className={`expand-work-button work-card-retry-btn ${synthesizerState.status === 'error' ? 'error' : ''}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    onRegenerate('synthesis', 0);
                                }}
                                title={synthesizerState.status === 'error' ? 'Retry Synthesis' : 'Regenerate Synthesis'}
                                aria-label={synthesizerState.status === 'error' ? 'Retry Synthesis' : 'Regenerate Synthesis'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                                </svg>
                            </button>
                        )}
                    </div>
                    <div className="work-card-body">
                        {synthesizerState.status === 'error' ? (
                            <p className="synthesis-error-msg">Synthesis failed. Click the retry button to try again.</p>
                        ) : synthesisText ? (
                            renderContent(synthesisText)
                        ) : (
                            <p>Synthesizing final response...</p>
                        )}
                    </div>
                </div>
            </div>
        )}

        <button
          className={`show-work-button collapse-work-button ${!isLive ? 'completed' : ''}`}
          onClick={() => {
            if (detailsRef.current) {
              detailsRef.current.open = false;
            }
          }}
        >
          <span>Collapse Agent Work</span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="work-arrow collapse-arrow">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </details>
    {modalData && <WorkModal title={modalData.title} content={modalData.content} onClose={() => setModalData(null)} />}
    </>
  );
};