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

const DebugModal: FC<{ title: string; debugInfo: any; onClose: () => void }> = ({ title, debugInfo, onClose }) => {
    const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

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

    const formatDebugInfo = (info: any) => {
        if (!info) return "No debug info available.";
        
        let output = "";
        
        if (info.systemInstruction) {
            output += `### System Instruction\n\n\`\`\`xml\n${info.systemInstruction.trim()}\n\`\`\`\n\n`;
        }

        if (info.history && Array.isArray(info.history)) {
            output += `### Chat History\n\n`;
            info.history.forEach((msg: any, i: number) => {
                output += `#### ${msg.role}\n`;
                if (msg.parts) {
                    msg.parts.forEach((part: any) => {
                        if (part.text) output += `\`\`\`\n${part.text.trim()}\n\`\`\`\n\n`;
                        if (part.inlineData) output += `*[Image Data]*\n\n`;
                    });
                }
            });
        }

        if (info.userTurn) {
            output += `### Current Turn\n\n`;
            output += `#### ${info.userTurn.role}\n`;
             if (info.userTurn.parts) {
                info.userTurn.parts.forEach((part: any) => {
                    if (part.text) output += `\`\`\`xml\n${part.text.trim()}\n\`\`\`\n\n`;
                    if (part.inlineData) output += `*[Image Data]*\n\n`;
                });
            }
        }

        return output;
    };

    return createPortal(
        <div className="work-modal-overlay" onClick={onClose}>
            <div className="work-modal" onClick={e => e.stopPropagation()}>
                <div className="work-modal-header">
                    <div className="header-content">
                        <h3>{title}</h3>
                        <div className="debug-view-toggle">
                            <button
                                className={`toggle-btn ${viewMode === 'formatted' ? 'active' : ''}`}
                                onClick={() => setViewMode('formatted')}
                            >
                                Formatted
                            </button>
                            <button
                                className={`toggle-btn ${viewMode === 'raw' ? 'active' : ''}`}
                                onClick={() => setViewMode('raw')}
                            >
                                Raw JSON
                            </button>
                        </div>
                    </div>
                    <button className="close-modal-button" onClick={onClose} aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div className="work-modal-body">
                    {viewMode === 'formatted' ? (
                        <MarkdownRenderer content={formatDebugInfo(debugInfo)} />
                    ) : (
                        <div className="raw-debug-container">
                            <button
                                className="copy-raw-button"
                                onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                                }}
                                title="Copy Raw JSON"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                </svg>
                                Copy
                            </button>
                            <pre className="raw-debug-view">
                                {JSON.stringify(debugInfo, null, 2)}
                            </pre>
                        </div>
                    )}
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
  const [debugModalData, setDebugModalData] = useState<{title: string, debugInfo: any} | null>(null);
  const [thoughtModalData, setThoughtModalData] = useState<{title: string, content: string} | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const downloadContent = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

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

  const renderTokenUsage = (usage: any) => {
    if (!usage) return null;
    return (
      <div className="token-usage" title={`Prompt: ${usage.promptTokens}, Output: ${usage.candidatesTokens}`}>
        <span className="token-count">{usage.totalTokens} tokens</span>
      </div>
    );
  };

  const calculateTotalTokens = () => {
    let total = 0;
    work.initialTokenUsage?.forEach(u => total += u?.totalTokens || 0);
    work.refinedTokenUsage?.forEach(u => total += u?.totalTokens || 0);
    if (work.synthesisTokenUsage) total += work.synthesisTokenUsage.totalTokens;
    return total;
  };

  const totalTokens = calculateTotalTokens();

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
                            {work.initialThoughts?.[i] && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setThoughtModalData({ title: `Agent ${i + 1} - Initial Thought Process`, content: work.initialThoughts![i]! });
                                    }}
                                    title="Show Thought Process"
                                    aria-label="Show Thought Process"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
                                    </svg>
                                </button>
                            )}
                            {work.debugInfo?.['initial']?.[i] && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setDebugModalData({ title: `Agent ${i + 1} - Initial Draft Debug Info`, debugInfo: work.debugInfo?.['initial']?.[i] });
                                    }}
                                    title="Debug Info"
                                    aria-label="Debug Info"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
                                    </svg>
                                </button>
                            )}
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
                                    downloadContent(`Agent-${i + 1}-Initial_Draft.md`, resp);
                                }}
                                title="Download Response"
                                aria-label="Download Response"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
                                </svg>
                            </button>
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
                {work.initialTokenUsage?.[i] && (
                    <div className="work-card-footer">
                        {renderTokenUsage(work.initialTokenUsage[i])}
                    </div>
                )}
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
                            {work.refinedThoughts?.[i] && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setThoughtModalData({ title: `Agent ${i + 1} - Refinement Thought Process`, content: work.refinedThoughts![i]! });
                                    }}
                                    title="Show Thought Process"
                                    aria-label="Show Thought Process"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
                                    </svg>
                                </button>
                            )}
                            {work.debugInfo?.['refined']?.[i] && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setDebugModalData({ title: `Agent ${i + 1} - Refinement Debug Info`, debugInfo: work.debugInfo?.['refined']?.[i] });
                                    }}
                                    title="Debug Info"
                                    aria-label="Debug Info"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
                                    </svg>
                                </button>
                            )}
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
                                    downloadContent(`Agent-${i + 1}-Refined_Response.md`, resp);
                                }}
                                title="Download Response"
                                aria-label="Download Response"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
                                </svg>
                            </button>
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
                 {work.refinedTokenUsage?.[i] && (
                    <div className="work-card-footer">
                        {renderTokenUsage(work.refinedTokenUsage[i])}
                    </div>
                )}
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
                        <div className="work-card-actions">
                            {work.synthesisThought && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setThoughtModalData({ title: `Synthesizer - Thought Process`, content: work.synthesisThought! });
                                    }}
                                    title="Show Thought Process"
                                    aria-label="Show Thought Process"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
                                    </svg>
                                </button>
                            )}
                            {work.debugInfo?.['synthesis'] && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setDebugModalData({ title: `Synthesizer - Debug Info`, debugInfo: work.debugInfo?.['synthesis'] });
                                    }}
                                    title="Debug Info"
                                    aria-label="Debug Info"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
                                    </svg>
                                </button>
                            )}
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
                            {synthesisText && (
                                <button
                                    className="expand-work-button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        downloadContent('Synthesis_Report.md', synthesisText);
                                    }}
                                    title="Download Synthesis"
                                    aria-label="Download Synthesis"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
                                    </svg>
                                </button>
                            )}
                        </div>
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
                    {work.synthesisTokenUsage && (
                        <div className="work-card-footer">
                            {renderTokenUsage(work.synthesisTokenUsage)}
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="show-work-footer">
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
            
            {totalTokens > 0 && (
                <div className="total-token-usage" title="Total tokens used across all agents">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="token-icon">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-1.07 3.97-2.1 5.39z"/>
                    </svg>
                    <span className="token-count">{totalTokens.toLocaleString()}</span>
                    <span className="token-label">tokens</span>
                </div>
            )}
        </div>
      </div>
    </details>
    {modalData && <WorkModal title={modalData.title} content={modalData.content} onClose={() => setModalData(null)} />}
    {debugModalData && <DebugModal title={debugModalData.title} debugInfo={debugModalData.debugInfo} onClose={() => setDebugModalData(null)} />}
    {thoughtModalData && <WorkModal title={thoughtModalData.title} content={thoughtModalData.content} onClose={() => setThoughtModalData(null)} />}
    </>
  );
};