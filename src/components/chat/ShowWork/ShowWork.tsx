import React, { FC, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ShowWorkProps, WorkModalData, DebugModalData, ThoughtModalData } from '@/components/chat/ShowWork/types';
import { StepId, STEPS } from '@/types/steps';
import { WorkModal } from '@/components/chat/ShowWork/components/WorkModal';
import { DebugModal } from '@/components/chat/ShowWork/components/DebugModal';
import { StatusAwareWorkCard } from '@/components/chat/ShowWork/components/StatusAwareWorkCard';
import { CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { ArrowDownIcon, TokenIcon } from '@/components/chat/ShowWork/icons';
import { getStepResults, getStepThoughts, getStepUsage, getSynthesisThought, getSynthesisUsage, getSynthesisResult, isSynthesisComplete } from '@/utils/swarm/workHelpers';
import { useResolvedSwarmState } from '@/hooks/swarm/useResolvedSwarmState';
import { getErroredAgents, isAnyAgentWorking, isErrorState, getContinueButtonText, handleContinueClick as handleContinueClickHelper } from '@/utils/swarm/continueHelpers';
import { useAgentStore } from '@/stores/agentStore';
import { StepDebugInfo } from '@/types/app-types';
import './ShowWork.css';

// Card metadata for stable callback resolution
interface CardMeta {
  step: StepId;
  index: number;
  title: string;
  agentName: string;
  content: string | null;
  thought: string | null | undefined;
  debugInfo: StepDebugInfo | undefined;
}

export const ShowWork: FC<ShowWorkProps> = ({ work, isLive = false, messageId, isPaused, onContinue, onRegenerate }) => {
  const [modalData, setModalData] = useState<WorkModalData | null>(null);
  const [debugModalData, setDebugModalData] = useState<DebugModalData | null>(null);
  const [thoughtModalData, setThoughtModalData] = useState<ThoughtModalData | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Get all agents for error checking
  const allAgents = useAgentStore(state => state.agents);
  
  // Resolve swarm states from either live store or historical snapshot
  const {
    synthesizerState,
    refinementStarted,
    isEarlyStageWorking
  } = useResolvedSwarmState(messageId, work);

  const synthesisResult = useMemo(() => getSynthesisResult(work), [work]);
  const initialResults = useMemo(() => getStepResults(work, STEPS.INITIAL), [work]);
  const refinedResults = useMemo(() => getStepResults(work, STEPS.REFINEMENT), [work]);

  // Cache helper results to avoid repeated calls in .map()
  const initialUsages = useMemo(() => getStepUsage(work, STEPS.INITIAL), [work]);
  const initialThoughts = useMemo(() => getStepThoughts(work, STEPS.INITIAL), [work]);
  const refinedUsages = useMemo(() => getStepUsage(work, STEPS.REFINEMENT), [work]);
  const refinedThoughts = useMemo(() => getStepThoughts(work, STEPS.REFINEMENT), [work]);
  const synthesisUsage = useMemo(() => getSynthesisUsage(work), [work]);
  const synthesisThought = useMemo(() => getSynthesisThought(work), [work]);

  const synthesisText: string | null =
    typeof synthesisResult === 'string'
      ? synthesisResult
      : synthesisResult?.text ?? null;

  // Auto-collapse when synthesis starts in live mode OR during synthesis regeneration
  useEffect(() => {
    const isWorking = synthesizerState?.status === 'working';
    const isOurMessage = synthesizerState?.messageId === messageId;
    
    // CRITICAL: Only collapse if we actually have some synthesis text (chunks arrived).
    // This prevents the "Synthesis Jump" from happening if an error occurs immediately
    // during regeneration, while still allowing the progress bar to move (working status).
    const hasContent = !!(synthesisText && synthesisText.length > 0);

    // Collapse cards when synthesizer is working AND has content
    if ((isLive || isOurMessage) && isWorking && !isEarlyStageWorking && hasContent) {
      if (detailsRef.current && detailsRef.current.open) {
        detailsRef.current.open = false;
      }
    }
  }, [isLive, messageId, synthesizerState?.status, synthesizerState?.messageId, isEarlyStageWorking, synthesisText]);

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
        agentName: name,
        content: resp,
        thought: initialThoughts[i],
        debugInfo: work.debugInfo?.[STEPS.INITIAL]?.[i]
      });
    });
    
    // Refinement step cards
    refinedResults.forEach((resp, i) => {
      const name = work.criticNames?.[i] || `Critic ${i + 1}`;
      map.set(`refined-${i}`, {
        step: STEPS.REFINEMENT,
        index: i,
        title: `${name} - Refined Response`,
        agentName: name,
        content: resp,
        thought: refinedThoughts[i],
        debugInfo: work.debugInfo?.[STEPS.REFINEMENT]?.[i]
      });
    });
    
    // Synthesis card
    map.set('synthesis', {
      step: STEPS.SYNTHESIS,
      index: 0,
      title: 'Synthesizer - Final Response',
      agentName: 'Synthesizer',
      content: synthesisText,
      thought: synthesisThought,
      debugInfo: work.debugInfo?.[STEPS.SYNTHESIS]
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
      case 'showThought': {
        if (meta.thought) {
          let thoughtTitle: string;
          
          if (meta.step === STEPS.SYNTHESIS) {
            thoughtTitle = 'Synthesizer - Thought Process';
          } else {
            const stepName = meta.step === STEPS.INITIAL ? 'Initial' : 'Refinement';
            thoughtTitle = `${meta.agentName} - ${stepName} Thought Process`;
          }
          
          setThoughtModalData({ title: thoughtTitle, content: meta.thought });
        }
        break;
      }
      case 'showDebug': {
        const debugTitle = meta.step === STEPS.SYNTHESIS
          ? 'Synthesizer - Debug Info'
          : `${meta.agentName} - ${meta.step === STEPS.INITIAL ? 'Initial' : 'Refinement'} Debug Info`;
        const modalData: DebugModalData = { title: debugTitle, debugInfo: meta.debugInfo };
        setDebugModalData(modalData);
        break;
      }
      case 'regenerate':
        onRegenerate?.(meta.step, meta.index);
        break;
    }
  }, [cardMetaMap, onRegenerate]);

  // Memoized total token calculation to avoid recomputation on every render
  // Note: totalTokens from API already includes prompt + candidates + thoughts + toolUse + cached
  const totalTokens = useMemo(() => {
    let total = 0;
    
    // Sum initial step usage (use cached values)
    initialUsages.forEach(u => total += u?.totalTokens || 0);
    
    // Sum refinement step usage (use cached values)
    refinedUsages.forEach(u => total += u?.totalTokens || 0);
    
    // Add synthesis usage
    if (synthesisUsage) total += synthesisUsage.totalTokens || 0;
    
    return total;
  }, [initialUsages, refinedUsages, synthesisUsage, messageId, isLive]);

  // Continue/Retry button logic using shared helpers
  const erroredAgents = useMemo(() => getErroredAgents(allAgents, messageId), [allAgents, messageId]);
  const isWorking = useMemo(() => isAnyAgentWorking(allAgents, messageId), [allAgents, messageId]);
  const isError = useMemo(() => isErrorState(allAgents, messageId), [allAgents, messageId]);
  const continueButtonText = getContinueButtonText(isError);
  
  const handleClick = useCallback(() => {
    handleContinueClickHelper(allAgents, messageId, onContinue, onRegenerate);
  }, [allAgents, messageId, onContinue, onRegenerate]);

  // Determine if the continue/retry button should be visible
  const showContinueButton = useMemo(() => {
    // 1. Don't show if agents are actively working
    if (isWorking) return false;
    
    // 2. Only show for live, paused messages
    if (!isLive || !isPaused) return false;

    // 3. CRITICAL: Don't show if synthesis is already done.
    // This prevents the "ghost" Continue button after full completion.
    const isSynthesisDone = isSynthesisComplete(work, []);
    if (isSynthesisDone) return false;
    
    // 4. Show if we can continue OR if there are errors and we can regenerate
    return onContinue !== undefined || (erroredAgents.length > 0 && onRegenerate !== undefined);
  }, [isPaused, isLive, isWorking, onContinue, erroredAgents.length, onRegenerate, work?.stepMetadata]);

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
            {initialResults.map((_, i) => {
              const cardId = `initial-${i}`;
              const meta = cardMetaMap.get(cardId);
              const name = work.agentNames?.[i] || `Agent ${i + 1}`;
              return (
                <StatusAwareWorkCard
                  key={cardId}
                  cardId={cardId}
                  work={work}
                  step={STEPS.INITIAL}
                  index={i}
                  messageId={messageId}
                  onCardAction={handleCardAction}
                  title={name}
                  content={meta?.content ?? null}
                  tokenUsage={initialUsages[i] ?? undefined}
                  thought={meta?.thought ?? undefined}
                  debugInfo={meta?.debugInfo}
                  downloadFilename={`${name.replace(/\s+/g, '-')}-Initial_Draft.md`}
                  allowRegenerate={!!onRegenerate}
                />
              );
            })}
          </div>
        </div>

        {/* Only show refinement section if step has started OR if we have historical data */}
        {(refinementStarted || refinedResults.some(r => r)) && (
          <div className="work-category">
            <h4 className="work-category-title">Critiques & Refinements</h4>
            <div className={`work-grid ${refinedResults.length === 1 ? 'single-column' : ''}`}>
              {refinedResults.map((_, i) => {
                const cardId = `refined-${i}`;
                const meta = cardMetaMap.get(cardId);
                const name = work.criticNames?.[i] || `Critic ${i + 1}`;
                return (
                  <StatusAwareWorkCard
                    key={cardId}
                    cardId={cardId}
                    work={work}
                    step={STEPS.REFINEMENT}
                    index={i}
                    messageId={messageId}
                    onCardAction={handleCardAction}
                    className="refinement-step"
                    title={name}
                    content={meta?.content ?? null}
                    tokenUsage={refinedUsages[i] ?? undefined}
                    thought={meta?.thought ?? undefined}
                    debugInfo={meta?.debugInfo}
                    downloadFilename={`${name.replace(/\s+/g, '-')}-Refined_Response.md`}
                    allowRegenerate={!!onRegenerate}
                  />
                );
              })}
            </div>
          </div>
        )}

        {(synthesizerState || synthesisText) && (
            <div className="work-category">
                <h4 className="work-category-title">Final Synthesis</h4>
                <StatusAwareWorkCard
                    cardId="synthesis"
                    work={work}
                    step={STEPS.SYNTHESIS}
                    index={0}
                    messageId={messageId}
                    onCardAction={handleCardAction}
                    className={STEPS.SYNTHESIS}
                    title="Synthesizer"
                    content={cardMetaMap.get('synthesis')?.content ?? null}
                    tokenUsage={synthesisUsage || undefined}
                    thought={cardMetaMap.get('synthesis')?.thought || undefined}
                    debugInfo={cardMetaMap.get('synthesis')?.debugInfo}
                    downloadFilename="Synthesis_Report.md"
                    allowRegenerate={!!onRegenerate}
                />
            </div>
        )}

        {showContinueButton && (
            <div className="show-work-continue-container">
                <button className="continue-button" onClick={handleClick}>
                    {continueButtonText}
                </button>
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
