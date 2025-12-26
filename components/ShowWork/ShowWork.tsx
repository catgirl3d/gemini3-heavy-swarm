import React, { FC, useState, useRef, useCallback, useMemo } from 'react';
import { ShowWorkProps, WorkModalData, DebugModalData, ThoughtModalData, DisplayStatus } from './types';
import { StepId } from '../../types/steps';
import { WorkModal } from './components/WorkModal';
import { DebugModal } from './components/DebugModal';
import { WorkCard, CardActionType } from './components/WorkCard';
import { ArrowDownIcon, TokenIcon } from './icons';
import { getStepResults, getStepThoughts, getStepUsage, getSynthesisThought, getSynthesisUsage, getSynthesisResult } from '../../utils/workHelpers';
import './ShowWork.css';

// Card metadata for stable callback resolution
interface CardMeta {
  step: StepId;
  index: number;
  title: string;
  content: string | null;
  thought: string | null | undefined;
  debugInfo: Record<string, unknown> | undefined;
}

export const ShowWork: FC<ShowWorkProps> = ({ work, isLive = false, liveAgentStates, onRegenerate }) => {
  const [modalData, setModalData] = useState<WorkModalData | null>(null);
  const [debugModalData, setDebugModalData] = useState<DebugModalData | null>(null);
  const [thoughtModalData, setThoughtModalData] = useState<ThoughtModalData | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const effectiveAgentStates = (isLive && liveAgentStates ? liveAgentStates : work.agentStates);
  const synthesizerState = effectiveAgentStates?.find(a => a.id === 'synthesizer_agent');
  
  const synthesisResult = getSynthesisResult(work);
  
  const initialResults = getStepResults(work, 'initial_step');
  const refinedResults = getStepResults(work, 'refinement_step');

  // Cache helper results to avoid repeated calls in .map()
  const initialUsages = getStepUsage(work, 'initial_step');
  const initialThoughts = getStepThoughts(work, 'initial_step');
  const refinedUsages = getStepUsage(work, 'refinement_step');
  const refinedThoughts = getStepThoughts(work, 'refinement_step');

  const synthesisText: string | null =
    typeof synthesisResult === 'string'
      ? synthesisResult
      : synthesisResult?.text ?? null;

  // Build card metadata map for stable action resolution
  const cardMetaMap = useMemo(() => {
    const map = new Map<string, CardMeta>();
    
    // Initial step cards
    initialResults.forEach((resp, i) => {
      const name = work.agentNames?.[i] || `Agent ${i + 1}`;
      map.set(`initial-${i}`, {
        step: 'initial_step',
        index: i,
        title: `${name} - Initial Draft`,
        content: resp,
        thought: getStepThoughts(work, 'initial_step')[i],
        debugInfo: work.debugInfo?.['initial_step']?.[i] as Record<string, unknown> | undefined
      });
    });
    
    // Refinement step cards
    refinedResults.forEach((resp, i) => {
      const name = work.criticNames?.[i] || `Critic ${i + 1}`;
      map.set(`refined-${i}`, {
        step: 'refinement_step',
        index: i,
        title: `${name} - Refined Response`,
        content: resp,
        thought: getStepThoughts(work, 'refinement_step')[i],
        debugInfo: work.debugInfo?.['refinement_step']?.[i] as Record<string, unknown> | undefined
      });
    });
    
    // Synthesis card
    map.set('synthesis', {
      step: 'synthesis_step',
      index: 0,
      title: 'Synthesizer - Final Response',
      content: synthesisText,
      thought: getSynthesisThought(work),
      debugInfo: work.debugInfo?.['synthesis_step'] as Record<string, unknown> | undefined
    });
    
    return map;
  }, [work, initialResults, refinedResults, synthesisText]);

  // Unified stable callback for all card actions
  const handleCardAction = useCallback((cardId: string, action: CardActionType) => {
    const meta = cardMetaMap.get(cardId);
    if (!meta) return;

    switch (action) {
      case 'expand':
        if (meta.content) {
          setModalData({ title: meta.title, content: meta.content });
        }
        break;
      case 'showThought':
        if (meta.thought) {
          const thoughtTitle = meta.step === 'synthesis_step' 
            ? 'Synthesizer - Thought Process'
            : meta.title.replace(/ - (Initial Draft|Refined Response)$/, ' - $1 Thought Process').replace('Initial Draft Thought Process', 'Initial Thought Process').replace('Refined Response Thought Process', 'Refinement Thought Process');
          setThoughtModalData({ title: thoughtTitle, content: meta.thought });
        }
        break;
      case 'showDebug':
        const debugTitle = meta.step === 'synthesis_step'
          ? 'Synthesizer - Debug Info'
          : meta.title.replace(/ - (Initial Draft|Refined Response)$/, ' - $1 Debug Info');
        setDebugModalData({ title: debugTitle, debugInfo: meta.debugInfo });
        break;
      case 'regenerate':
        onRegenerate?.(meta.step, meta.index);
        break;
    }
  }, [cardMetaMap, onRegenerate]);

  // Memoized total token calculation to avoid recomputation on every render
  const totalTokens = useMemo(() => {
    let total = 0;
    
    // Sum initial step usage (use cached values)
    initialUsages.forEach(u => total += u?.totalTokens || 0);
    
    // Sum refinement step usage (use cached values)
    refinedUsages.forEach(u => total += u?.totalTokens || 0);
    
    // Add synthesis usage
    const synthesisUsage = getSynthesisUsage(work);
    if (synthesisUsage) total += synthesisUsage.totalTokens || 0;
    
    return total;
  }, [initialUsages, refinedUsages, work]);

  const getCardStatus = (step: StepId, index: number): { status: DisplayStatus, label: string } => {
    const currentState = step === 'synthesis_step' ? synthesizerState : effectiveAgentStates?.[index];
    
    if (step === 'initial_step') {
        // Use status + stepId for robust working detection (not fragile label string matching)
        const isWorking = currentState?.status === 'working' && (currentState?.stepId === 'initial_step' || currentState?.stepId === undefined);
        const hasContentError = initialResults[index]?.includes('[System: Agent failed to complete.');
        // Check if agentState has error status for THIS step
        const isInitialError = currentState?.status === 'error' && currentState?.stepId === 'initial_step';
        const hasError = hasContentError || isInitialError;
        const isDone = !!initialResults[index] && !hasError;

        if (isWorking) return { status: 'working', label: currentState?.label || 'Drafting...' };
        if (hasError) return { status: 'error', label: currentState?.label || 'Draft Failed' };
        if (isDone) return { status: 'done', label: 'Drafted' };
        return { status: 'waiting', label: 'Waiting...' };
    }

    if (step === 'refinement_step') {
        // Use status + stepId for robust working detection (not fragile label string matching)
        const isWorking = currentState?.status === 'working' && currentState?.stepId === 'refinement_step';
        const hasContentError = refinedResults[index]?.includes('[System: Agent failed to refine.');
        // Check if agentState has error status for THIS step
        const isRefinedError = currentState?.status === 'error' && currentState?.stepId === 'refinement_step';
        const hasError = hasContentError || isRefinedError;
        const isDone = !!refinedResults[index] && !hasError;

        if (isWorking) return { status: 'working', label: currentState?.label || 'Refining...' };
        if (hasError) return { status: 'error', label: currentState?.label || 'Refinement Failed' };
        if (isDone) return { status: 'done', label: 'Refined' };
        return { status: 'waiting', label: 'Waiting...' };
    }

    // Synthesis
    const isWorking = synthesizerState?.status === 'working';
    const hasContentError = typeof synthesisResult === 'object' && synthesisResult !== null && 'error' in synthesisResult && synthesisResult.error === true;
    const hasStateError = synthesizerState?.status === 'error';
    const hasError = hasContentError || hasStateError;
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
          <div className={`work-grid ${initialResults.length === 1 ? 'single-column' : ''}`}>
            {initialResults.map((resp, i) => {
              const { status, label } = getCardStatus('initial_step', i);
              const name = work.agentNames?.[i] || `Agent ${i + 1}`;
              const cardId = `initial-${i}`;
              return (
                <WorkCard
                  key={cardId}
                  cardId={cardId}
                  onCardAction={handleCardAction}
                  title={name}
                  statusLabel={label}
                  status={status}
                  icon={status === 'waiting' ? <span>{i + 1}</span> : undefined}
                  content={resp}
                  tokenUsage={initialUsages[i] ?? undefined}
                  thought={initialThoughts[i] ?? undefined}
                  debugInfo={work.debugInfo?.['initial_step']?.[i]}
                  downloadFilename={`${name.replace(/\s+/g, '-')}-Initial_Draft.md`}
                />
              );
            })}
          </div>
        </div>

        <div className="work-category">
          <h4 className="work-category-title">Critiques & Refinements</h4>
          <div className={`work-grid ${refinedResults.length === 1 ? 'single-column' : ''}`}>
            {refinedResults.map((resp, i) => {
              const { status, label } = getCardStatus('refinement_step', i);
              const name = work.criticNames?.[i] || `Critic ${i + 1}`;
              const cardId = `refined-${i}`;
              return (
                <WorkCard
                  key={cardId}
                  cardId={cardId}
                  onCardAction={handleCardAction}
                  className="refinement-step"
                  title={name}
                  statusLabel={label}
                  status={status}
                  icon={status === 'waiting' ? <span>{i + 1}</span> : undefined}
                  content={resp}
                  tokenUsage={refinedUsages[i] ?? undefined}
                  thought={refinedThoughts[i] ?? undefined}
                  debugInfo={work.debugInfo?.['refinement_step']?.[i]}
                  downloadFilename={`${name.replace(/\s+/g, '-')}-Refined_Response.md`}
                />
              );
            })}
          </div>
        </div>

        {synthesizerState && (
            <div className="work-category">
                <h4 className="work-category-title">Final Synthesis</h4>
                {(() => {
                    const { status, label } = getCardStatus('synthesis_step', 0);
                    return (
                        <WorkCard
                            cardId="synthesis"
                            onCardAction={handleCardAction}
                            className="synthesis_step"
                            title="Synthesizer"
                            statusLabel={label}
                            status={status}
                            content={synthesisText}
                            tokenUsage={getSynthesisUsage(work) || undefined}
                            thought={getSynthesisThought(work) || undefined}
                            debugInfo={work.debugInfo?.['synthesis_step']}
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
