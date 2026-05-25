import React, { type FC, useState, useRef, useCallback, useMemo } from 'react';
import { type ShowWorkProps, type WorkModalData, type DebugModalData } from '@/components/chat/ShowWork/types';
import { type StepId, STEPS } from '@/types/steps';
import { WorkModal } from '@/components/chat/ShowWork/components/WorkModal';
import { DebugModal } from '@/components/chat/ShowWork/components/DebugModal';
import { StatusAwareWorkCard } from '@/components/chat/ShowWork/components/StatusAwareWorkCard';
import { type CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { ArrowDownIcon, TokenIcon } from '@/components/chat/ShowWork/icons';
import { getStepResults, getStepThoughts, getStepUsage } from '@/utils/swarm/workHelpers';
import { useResolvedSwarmState } from '@/hooks/swarm/useResolvedSwarmState';
import { getContinueButtonState, handleContinueClick as handleContinueClickHelper } from '@/utils/swarm/continueHelpers';
import { createSessionAgentsSelector, selectActiveSessionMessageId, useAgentStore } from '@/stores/agentStore';
import { type AgentState, type StepDebugInfo, type TokenUsage } from '@/types/app-types';
import { useAutoCollapse } from '@/hooks/ui/useAutoCollapse';
import './ShowWork.css';

const EMPTY_AGENT_STATES: AgentState[] = [];

interface WorkCardViewModel {
  cardId: string;
  step: StepId;
  index: number;
  title: string;
  modalTitle: string;
  thoughtTitle: string;
  debugTitle: string;
  content: string | null;
  thought: string | null | undefined;
  debugInfo: StepDebugInfo | undefined;
  tokenUsage: TokenUsage | null;
  downloadFilename: string;
  className?: string;
}

export const ShowWork: FC<ShowWorkProps> = ({ work, isLive = false, messageId, phase, isPausedForAction, onContinue, onRegenerate }) => {
  const [contentModalData, setContentModalData] = useState<WorkModalData | null>(null);
  const [debugModalData, setDebugModalData] = useState<DebugModalData | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // MessageList already resolved live-vs-history work selection for this row.
  // ShowWork only renders the provided work prop and uses the store for live agent status UI.
  const sessionAgentStates = useAgentStore(createSessionAgentsSelector(messageId));
  const activeSessionMessageId = useAgentStore(selectActiveSessionMessageId);
  const isCurrentMessage = activeSessionMessageId === messageId;
  const effectiveAgentStates = useMemo(() => {
    return isCurrentMessage ? (sessionAgentStates ?? EMPTY_AGENT_STATES) : (work.agentStates ?? EMPTY_AGENT_STATES);
  }, [isCurrentMessage, sessionAgentStates, work.agentStates]);
  
  const {
    synthesizerState,
    refinementStarted,
    isEarlyStageWorking
  } = useResolvedSwarmState(messageId, work, isCurrentMessage);

  const initialResults = useMemo(() => getStepResults(work, STEPS.INITIAL), [work]);
  const refinementResults = useMemo(() => getStepResults(work, STEPS.REFINEMENT), [work]);
  const synthesisResults = useMemo(() => getStepResults(work, STEPS.SYNTHESIS), [work]);

  // Cache helper results to avoid repeated calls in .map()
  const initialUsages = useMemo(() => getStepUsage(work, STEPS.INITIAL), [work]);
  const initialThoughts = useMemo(() => getStepThoughts(work, STEPS.INITIAL), [work]);
  const refinementUsages = useMemo(() => getStepUsage(work, STEPS.REFINEMENT), [work]);
  const refinementThoughts = useMemo(() => getStepThoughts(work, STEPS.REFINEMENT), [work]);
  const synthesisUsages = useMemo(() => getStepUsage(work, STEPS.SYNTHESIS), [work]);
  const synthesisThoughts = useMemo(() => getStepThoughts(work, STEPS.SYNTHESIS), [work]);
  const synthesisText: string | null = synthesisResults[0] ?? null;

  // Manage automatic collapsing of agent work details via custom hook
  useAutoCollapse({
    detailsRef,
    isLive,
    isCurrentMessage,
    messageId,
    synthesizerState,
    isEarlyStageWorking,
    synthesisText
  });

  const initialCards = useMemo<WorkCardViewModel[]>(() => {
    return initialResults.map((resp, i) => {
      const name = work.agentNames?.[i] || `Agent ${i + 1}`;
      return {
        cardId: `initial-${i}`,
        step: STEPS.INITIAL,
        index: i,
        title: name,
        modalTitle: `${name} - Initial Draft`,
        thoughtTitle: `${name} - Initial Thought Process`,
        debugTitle: `${name} - Initial Debug Info`,
        content: resp,
        thought: initialThoughts[i],
        debugInfo: work.debugInfo?.[STEPS.INITIAL]?.[i],
        tokenUsage: initialUsages[i] ?? null,
        downloadFilename: `${name.replace(/\s+/g, '-')}-Initial_Draft.md`,
      };
    });
  }, [initialResults, initialThoughts, initialUsages, work]);

  const refinementCards = useMemo<WorkCardViewModel[]>(() => {
    return refinementResults.map((resp, i) => {
      const name = work.criticNames?.[i] || `Critic ${i + 1}`;
      return {
        cardId: `refined-${i}`,
        step: STEPS.REFINEMENT,
        index: i,
        title: name,
        modalTitle: `${name} - Refined Response`,
        thoughtTitle: `${name} - Refinement Thought Process`,
        debugTitle: `${name} - Refinement Debug Info`,
        content: resp,
        thought: refinementThoughts[i],
        debugInfo: work.debugInfo?.[STEPS.REFINEMENT]?.[i],
        tokenUsage: refinementUsages[i] ?? null,
        downloadFilename: `${name.replace(/\s+/g, '-')}-Refined_Response.md`,
        className: 'refinement-step',
      };
    });
  }, [refinementResults, refinementThoughts, refinementUsages, work]);

  const synthesisCard = useMemo<WorkCardViewModel>(() => ({
    cardId: 'synthesis',
    step: STEPS.SYNTHESIS,
    index: 0,
    title: 'Synthesizer',
    modalTitle: 'Synthesizer - Final Response',
    thoughtTitle: 'Synthesizer - Thought Process',
    debugTitle: 'Synthesizer - Debug Info',
    content: synthesisText,
    thought: synthesisThoughts[0],
    debugInfo: work.debugInfo?.[STEPS.SYNTHESIS],
    tokenUsage: synthesisUsages[0] ?? null,
    downloadFilename: 'Synthesis_Report.md',
    className: STEPS.SYNTHESIS,
  }), [synthesisText, synthesisThoughts, synthesisUsages, work]);

  const allCards = useMemo(() => {
    return [...initialCards, ...refinementCards, synthesisCard];
  }, [initialCards, refinementCards, synthesisCard]);

  const cardsById = useMemo(() => {
    const map = new Map<string, WorkCardViewModel>();
    allCards.forEach(card => map.set(card.cardId, card));
    return map;
  }, [allCards]);

  // Unified stable callback for all card actions
  const handleCardAction = useCallback((cardId: string, action: CardActionType) => {
    const card = cardsById.get(cardId);
    if (!card) return;

    switch (action) {
      case 'expand':
        if (card.content) {
          setContentModalData({ title: card.modalTitle, content: card.content });
        }
        break;
      case 'showThought': {
        if (card.thought) {
          setContentModalData({ title: card.thoughtTitle, content: card.thought });
        }
        break;
      }
      case 'showDebug': {
        const modalData: DebugModalData = { title: card.debugTitle, debugInfo: card.debugInfo };
        setDebugModalData(modalData);
        break;
      }
      case 'regenerate':
        onRegenerate?.(card.step, card.index);
        break;
    }
  }, [cardsById, onRegenerate]);

  // Note: totalTokens from API already includes prompt + candidates + thoughts + toolUse + cached
  const totalTokens = useMemo(() => {
    return allCards.reduce((total, card) => total + (card.tokenUsage?.totalTokens || 0), 0);
  }, [allCards]);

  const effectivePhase = phase ?? (isPausedForAction ? 'awaiting-user' : null);
  const continueButtonState = useMemo(() => getContinueButtonState({
    phase: isLive ? effectivePhase : null,
    agentStates: effectiveAgentStates,
    messageId,
    work,
    hasContinueCallback: !!onContinue,
    hasRegenerateCallback: !!onRegenerate,
  }), [effectiveAgentStates, effectivePhase, isLive, messageId, onContinue, onRegenerate, work]);
  
  const handleClick = useCallback(() => {
    handleContinueClickHelper(effectiveAgentStates, messageId, onContinue, onRegenerate);
  }, [effectiveAgentStates, messageId, onContinue, onRegenerate]);

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
              {initialCards.map(card => (
                <StatusAwareWorkCard
                  key={card.cardId}
                  cardId={card.cardId}
                  work={work}
                  step={card.step}
                  index={card.index}
                  messageId={messageId}
                  onCardAction={handleCardAction}
                  title={card.title}
                  content={card.content}
                  tokenUsage={card.tokenUsage ?? undefined}
                  thought={card.thought ?? undefined}
                  debugInfo={card.debugInfo}
                  downloadFilename={card.downloadFilename}
                  preferLiveSession={isCurrentMessage}
                  allowRegenerate={!!onRegenerate}
                />
              ))}
            </div>
          </div>

          {/* Only show refinement section if step has started OR if we have historical data */}
          {(refinementStarted || refinementResults.some(r => r)) && (
            <div className="work-category">
              <h4 className="work-category-title">Critiques & Refinements</h4>
              <div className={`work-grid ${refinementResults.length === 1 ? 'single-column' : ''}`}>
                {refinementCards.map(card => (
                  <StatusAwareWorkCard
                    key={card.cardId}
                    cardId={card.cardId}
                    work={work}
                    step={card.step}
                    index={card.index}
                    messageId={messageId}
                    onCardAction={handleCardAction}
                    className={card.className}
                    title={card.title}
                    content={card.content}
                    tokenUsage={card.tokenUsage ?? undefined}
                    thought={card.thought ?? undefined}
                    debugInfo={card.debugInfo}
                    downloadFilename={card.downloadFilename}
                    preferLiveSession={isCurrentMessage}
                    allowRegenerate={!!onRegenerate}
                  />
                ))}
              </div>
            </div>
          )}

          {(synthesizerState || synthesisText) && (
            <div className="work-category">
              <h4 className="work-category-title">Final Synthesis</h4>
              <StatusAwareWorkCard
                cardId={synthesisCard.cardId}
                work={work}
                step={synthesisCard.step}
                index={synthesisCard.index}
                messageId={messageId}
                onCardAction={handleCardAction}
                className={synthesisCard.className}
                title={synthesisCard.title}
                content={synthesisCard.content}
                tokenUsage={synthesisCard.tokenUsage ?? undefined}
                thought={synthesisCard.thought ?? undefined}
                debugInfo={synthesisCard.debugInfo}
                downloadFilename={synthesisCard.downloadFilename}
                preferLiveSession={isCurrentMessage}
                allowRegenerate={!!onRegenerate}
              />
            </div>
          )}

          {continueButtonState.visible && (
            <div className="show-work-continue-container">
              <button className="continue-button" onClick={handleClick}>
                {continueButtonState.label}
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
      {contentModalData && <WorkModal title={contentModalData.title} content={contentModalData.content} onClose={() => setContentModalData(null)} />}
      {debugModalData && <DebugModal title={debugModalData.title} debugInfo={debugModalData.debugInfo} onClose={() => setDebugModalData(null)} />}
    </>
  );
};
