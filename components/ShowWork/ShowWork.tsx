import React, { FC, useState, useRef } from 'react';
import { ShowWorkProps, WorkModalData, DebugModalData, ThoughtModalData, DisplayStatus } from './types';
import { WorkModal } from './components/WorkModal';
import { DebugModal } from './components/DebugModal';
import { WorkCard } from './components/WorkCard';
import { ArrowDownIcon, TokenIcon } from './icons';
import './ShowWork.css';

export const ShowWork: FC<ShowWorkProps> = ({ work, isLive = false, liveAgentStates, onRegenerate }) => {
  const [modalData, setModalData] = useState<WorkModalData | null>(null);
  const [debugModalData, setDebugModalData] = useState<DebugModalData | null>(null);
  const [thoughtModalData, setThoughtModalData] = useState<ThoughtModalData | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const effectiveAgentStates = (isLive && liveAgentStates ? liveAgentStates : work.agentStates);
  const synthesizerState = effectiveAgentStates?.find(a => a.id === 'synthesizer');
  
  const synthesisResult = work.results?.['synthesis'];
  const synthesisText: string | null =
    typeof synthesisResult === 'string'
      ? synthesisResult
      : synthesisResult?.text ?? null;

  const calculateTotalTokens = () => {
    let total = 0;
    work.initialTokenUsage?.forEach(u => total += u?.totalTokens || 0);
    work.refinedTokenUsage?.forEach(u => total += u?.totalTokens || 0);
    if (work.synthesisTokenUsage) total += work.synthesisTokenUsage.totalTokens;
    return total;
  };

  const totalTokens = calculateTotalTokens();

  const getCardStatus = (step: 'initial' | 'refined' | 'synthesis', index: number): { status: DisplayStatus, label: string } => {
    const currentState = step === 'synthesis' ? synthesizerState : effectiveAgentStates?.[index];
    
    if (step === 'initial') {
        // Use status + stepId for robust working detection (not fragile label string matching)
        const isWorking = currentState?.status === 'working' && (currentState?.stepId === 'initial' || currentState?.stepId === undefined);
        const hasContentError = work.initialResponses[index]?.includes('[System: Agent failed to complete.');
        // Check if agentState has error status for THIS step
        const isInitialError = currentState?.status === 'error' && currentState?.stepId === 'initial';
        const hasError = hasContentError || isInitialError;
        const isDone = !!work.initialResponses[index] && !hasError;

        if (isWorking) return { status: 'working', label: currentState?.label || 'Drafting...' };
        if (hasError) return { status: 'error', label: currentState?.label || 'Draft Failed' };
        if (isDone) return { status: 'done', label: 'Drafted' };
        return { status: 'waiting', label: 'Waiting...' };
    }

    if (step === 'refined') {
        // Use status + stepId for robust working detection (not fragile label string matching)
        const isWorking = currentState?.status === 'working' && currentState?.stepId === 'refined';
        const hasContentError = work.refinedResponses[index]?.includes('[System: Agent failed to refine.');
        // Check if agentState has error status for THIS step
        const isRefinedError = currentState?.status === 'error' && currentState?.stepId === 'refined';
        const hasError = hasContentError || isRefinedError;
        const isDone = !!work.refinedResponses[index] && !hasError;

        if (isWorking) return { status: 'working', label: currentState?.label || 'Refining...' };
        if (hasError) return { status: 'error', label: currentState?.label || 'Refinement Failed' };
        if (isDone) return { status: 'done', label: 'Refined' };
        return { status: 'waiting', label: 'Waiting...' };
    }

    // Synthesis
    const isWorking = synthesizerState?.status === 'working';
    const hasError = synthesizerState?.status === 'error';
    const isDone = !!synthesisText && !hasError;

    if (isWorking) return { status: 'working', label: synthesizerState?.label || 'Synthesizing...' };
    if (hasError) return { status: 'error', label: synthesizerState?.label || 'Synthesis Failed' };
    if (isDone) return { status: 'done', label: synthesizerState?.label || 'Synthesized' };
    return { status: 'waiting', label: synthesizerState?.label || 'Waiting...' };
  };

  return (
    <>
    <details className="show-work-container" ref={detailsRef}>
      <summary className={`show-work-button ${!isLive ? 'completed' : ''}`}>
        <span>{isLive ? 'Show Agent Work (Live)' : 'View Full Agent Swarm Process'}</span>
        <ArrowDownIcon />
      </summary>
      <div className="work-details animate-fade-in">
        <div className="work-category">
          <h4 className="work-category-title">Initial Drafts</h4>
          <div className={`work-grid ${work.initialResponses.length === 1 ? 'single-column' : ''}`}>
            {work.initialResponses.map((resp, i) => {
              const { status, label } = getCardStatus('initial', i);
              return (
                <WorkCard
                  key={`initial-${i}`}
                  title={work.agentNames ? work.agentNames[i] : `Agent ${i + 1}`}
                  statusLabel={label}
                  status={status}
                  icon={status === 'waiting' ? <span>{i + 1}</span> : undefined}
                  content={resp}
                  tokenUsage={work.initialTokenUsage?.[i]}
                  thought={work.initialThoughts?.[i]}
                  debugInfo={work.debugInfo?.['initial']?.[i]}
                  onExpand={() => setModalData({ title: `Agent ${i + 1} - Initial Draft`, content: resp })}
                  onShowThought={() => setThoughtModalData({ title: `Agent ${i + 1} - Initial Thought Process`, content: work.initialThoughts![i]! })}
                  onShowDebug={() => setDebugModalData({ title: `Agent ${i + 1} - Initial Draft Debug Info`, debugInfo: work.debugInfo?.['initial']?.[i] })}
                  onRegenerate={onRegenerate ? () => onRegenerate('initial', i) : undefined}
                  downloadFilename={`Agent-${i + 1}-Initial_Draft.md`}
                />
              );
            })}
          </div>
        </div>

        <div className="work-category">
          <h4 className="work-category-title">Critiques & Refinements</h4>
          <div className={`work-grid ${work.refinedResponses.length === 1 ? 'single-column' : ''}`}>
            {work.refinedResponses.map((resp, i) => {
              const { status, label } = getCardStatus('refined', i);
              return (
                <WorkCard
                  key={`refined-${i}`}
                  className="refined"
                  title={work.criticNames?.[i] || `Critic ${i + 1}`}
                  statusLabel={label}
                  status={status}
                  icon={status === 'waiting' ? <span>{i + 1}</span> : undefined}
                  content={resp}
                  tokenUsage={work.refinedTokenUsage?.[i]}
                  thought={work.refinedThoughts?.[i]}
                  debugInfo={work.debugInfo?.['refined']?.[i]}
                  onExpand={() => setModalData({ title: `Agent ${i + 1} - Refined Response`, content: resp })}
                  onShowThought={() => setThoughtModalData({ title: `Agent ${i + 1} - Refinement Thought Process`, content: work.refinedThoughts![i]! })}
                  onShowDebug={() => setDebugModalData({ title: `Agent ${i + 1} - Refinement Debug Info`, debugInfo: work.debugInfo?.['refined']?.[i] })}
                  onRegenerate={onRegenerate ? () => onRegenerate('refined', i) : undefined}
                  downloadFilename={`Agent-${i + 1}-Refined_Response.md`}
                />
              );
            })}
          </div>
        </div>

        {synthesizerState && (
            <div className="work-category">
                <h4 className="work-category-title">Final Synthesis</h4>
                {(() => {
                    const { status, label } = getCardStatus('synthesis', 0);
                    return (
                        <WorkCard
                            className="synthesizer"
                            title="Synthesizer"
                            statusLabel={label}
                            status={status}
                            content={synthesisText}
                            tokenUsage={work.synthesisTokenUsage}
                            thought={work.synthesisThought}
                            debugInfo={work.debugInfo?.['synthesis']}
                            onExpand={() => setModalData({ title: `Synthesizer - Final Response`, content: synthesisText! })}
                            onShowThought={() => setThoughtModalData({ title: `Synthesizer - Thought Process`, content: work.synthesisThought! })}
                            onShowDebug={() => setDebugModalData({ title: `Synthesizer - Debug Info`, debugInfo: work.debugInfo?.['synthesis'] })}
                            onRegenerate={onRegenerate ? () => onRegenerate('synthesis', 0) : undefined}
                            downloadFilename="Synthesis_Report.md"
                        />
                    );
                })()}
            </div>
        )}

        <div className="show-work-footer">
            <button
              className={`show-work-button collapse-work-button ${!isLive ? 'completed' : ''}`}
              onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }}
            >
              <span>Collapse Agent Work</span>
              <ArrowDownIcon />
            </button>
            
            {totalTokens > 0 && (
                <div className="total-token-usage" title="Total tokens used across all agents">
                    <TokenIcon />
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
