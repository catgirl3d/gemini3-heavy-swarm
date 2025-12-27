import React, { FC } from 'react';
import { Work, AgentState, TokenUsage } from '@/types';
import { StepId } from '@/types/steps';
import { WorkCard, CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { useCardStatus } from '@/components/chat/ShowWork/hooks/useCardStatus';
import { PrecalculatedResults } from '@/components/chat/ShowWork/types';

interface StatusAwareWorkCardProps {
  // Card identification
  cardId: string;
  
  // Work and state data
  work: Work;
  step: StepId;
  index: number;
  effectiveAgentStates: AgentState[] | undefined;
  synthesizerState: AgentState | undefined;
  
  // Optimization: Pre-calculated results to avoid redundant work object parsing
  precalculatedResults?: PrecalculatedResults;
  
  // Card display props
  title: string;
  content: string | null;
  tokenUsage?: TokenUsage;
  thought?: string | null;
  debugInfo?: unknown;
  downloadFilename: string;
  className?: string;
  
  // Callbacks
  onCardAction: (cardId: string, action: CardActionType) => void;
}

/**
 * StatusAwareWorkCard - A wrapper component that handles the useCardStatus hook call
 * at the component level, avoiding Rules of Hooks violations.
 * 
 * This component isolates the hook logic from the parent's .map() loops,
 * ensuring hooks are always called at the top level of a component.
 */
export const StatusAwareWorkCard: FC<StatusAwareWorkCardProps> = ({
  cardId,
  work,
  step,
  index,
  effectiveAgentStates,
  synthesizerState,
  precalculatedResults,
  title,
  content,
  tokenUsage,
  thought,
  debugInfo,
  downloadFilename,
  className,
  onCardAction
}) => {
  // ✅ LEGAL: Hook called at the top level of a component
  const { status, label } = useCardStatus(
    work,
    step,
    index,
    effectiveAgentStates,
    synthesizerState,
    precalculatedResults
  );

  return (
    <WorkCard
      cardId={cardId}
      onCardAction={onCardAction}
      className={className}
      title={title}
      statusLabel={label}
      status={status}
      icon={status === 'waiting' ? <span>{index + 1}</span> : undefined}
      content={content}
      tokenUsage={tokenUsage}
      thought={thought}
      debugInfo={debugInfo}
      downloadFilename={downloadFilename}
    />
  );
};
