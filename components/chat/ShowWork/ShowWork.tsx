import React, { FC, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ShowWorkProps, WorkModalData, DebugModalData, ThoughtModalData, DisplayStatus } from '@/components/chat/ShowWork/types';
import { StepId, STEPS } from '@/types/steps';
import { WorkModal } from '@/components/chat/ShowWork/components/WorkModal';
import { DebugModal } from '@/components/chat/ShowWork/components/DebugModal';
import { WorkCard, CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { ArrowDownIcon, TokenIcon } from '@/components/chat/ShowWork/icons';
import { getStepResults, getStepThoughts, getStepUsage, getSynthesisThought, getSynthesisUsage, getSynthesisResult } from '@/utils/workHelpers';
import { getStepConfig, hasStepContentError } from '@/utils/stepConfig';
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
  const prevSynthesizerStatusRef = useRef<string | undefined>(undefined);

  const effectiveAgentStates = (isLive && liveAgentStates ? liveAgentStates : work.agentStates);
  const synthesizerState = effectiveAgentStates?.find(a => a.id === 'synthesizer_agent');

  // Auto-collapse when synthesis starts in live mode
  useEffect(() => {
    if (isLive && synthesizerState?.status === 'working' && prevSynthesizerStatusRef.current !== 'working') {
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    }
    prevSynthesizerStatusRef.current = synthesizerState?.status;
  }, [isLive, synthesizerState?.status]);
  
  const synthesisResult = getSynthesisResult(work);
  
  const initialResults = getStepResults(work, STEPS.INITIAL);
  const refinedResults = getStepResults(work, STEPS.REFINEMENT);

  // Cache helper results to avoid repeated calls in .map()
  const initialUsages = getStepUsage(work, STEPS.INITIAL);
  const initialThoughts = getStepThoughts(work, STEPS.INITIAL);
  const refinedUsages = getStepUsage(work, STEPS.REFINEMENT);
  const refinedThoughts = getStepThoughts(work, STEPS.REFINEMENT);

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
        step: STEPS.INITIAL,
        index: i,
        title: `${name} - Initial Draft`,
        content: resp,
        thought: initialThoughts[i],
        debugInfo: work.debugInfo?.[STEPS.INITIAL]?.[i] as Record<string, unknown> | undefined
      });
    });
    
    // Refinement step cards
    refinedResults.forEach((resp, i) => {
      const name = work.criticNames?.[i] || `Critic ${i + 1}`;
      map.set(`refined-${i}`, {
        step: STEPS.REFINEMENT,
        index: i,
        title: `${name} - Refined Response`,
        content: resp,
        thought: refinedThoughts[i],
        debugInfo: work.debugInfo?.[STEPS.REFINEMENT]?.[i] as Record<string, unknown> | undefined
      });
    });
    
    // Synthesis card
    map.set('synthesis', {
      step: STEPS.SYNTHESIS,
      index: 0,
      title: 'Synthesizer - Final Response',
      content: synthesisText,
      thought: getSynthesisThought(work),
      debugInfo: work.debugInfo?.[STEPS.SYNTHESIS] as Record<string, unknown> | undefined
    });
    
    return map;
  }, [work, initialResults, refinedResults, synthesisText, initialThoughts, refinedThoughts]);

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
          const thoughtTitle = meta.step === STEPS.SYNTHESIS 
            ? 'Synthesizer - Thought Process'
            : meta.title.replace(/ - (Initial Draft|Refined Response)$/, ' - $1 Thought Process').replace('Initial Draft Thought Process', 'Initial Thought Process').replace('Refined Response Thought Process', 'Refinement Thought Process');
          setThoughtModalData({ title: thoughtTitle, content: meta.thought });
        }
        break;
      case 'showDebug':
        const debugTitle = meta.step === STEPS.SYNTHESIS
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
    const config = getStepConfig(step);
    
    // Get the appropriate agent state and results based on step type
    const currentState = step === STEPS.SYNTHESIS ? synthesizerState : effectiveAgentStates?.[index];
    const results = step === STEPS.INITIAL ? initialResults : step === STEPS.REFINEMENT ? refinedResults : null;
    const result = results?.[index];
    
    // Determine status using unified logic
    const isWorking = currentState?.status === 'working' && 
      (currentState?.stepId === step || (step === STEPS.INITIAL && currentState?.stepId === undefined));
    
    const hasContentError = step === STEPS.SYNTHESIS
      ? (typeof synthesisResult === 'object' && synthesisResult !== null && 'error' in synthesisResult && synthesisResult.error === true)
      : hasStepContentError(result, step);
    
    const hasStateError = currentState?.status === 'error' && currentState?.stepId === step;
    const hasError = hasContentError || hasStateError;
    
    const content = step === STEPS.SYNTHESIS ? synthesisText : result;
    const isDone = !!content && !hasError;

    if (isWorking) return { status: 'working', label: currentState?.label || config.labels.working };
    if (hasError) return { status: 'error', label: currentState?.label || config.labels.error };
    if (isDone) return { status: 'done', label: currentState?.label || config.labels.done };
    return { status: 'waiting', label: currentState?.label || config.labels.waiting };
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
              const { status, label } = getCardStatus(STEPS.INITIAL, i);
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
                  debugInfo={work.debugInfo?.[STEPS.INITIAL]?.[i]}
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
              const { status, label } = getCardStatus(STEPS.REFINEMENT, i);
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
                  debugInfo={work.debugInfo?.[STEPS.REFINEMENT]?.[i]}
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
                    const { status, label } = getCardStatus(STEPS.SYNTHESIS, 0);
                    return (
                        <WorkCard
                            cardId="synthesis"
                            onCardAction={handleCardAction}
                            className={STEPS.SYNTHESIS}
                            title="Synthesizer"
                            statusLabel={label}
                            status={status}
                            content={synthesisText}
                            tokenUsage={getSynthesisUsage(work) || undefined}
                            thought={getSynthesisThought(work) || undefined}
                            debugInfo={work.debugInfo?.[STEPS.SYNTHESIS]}
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
