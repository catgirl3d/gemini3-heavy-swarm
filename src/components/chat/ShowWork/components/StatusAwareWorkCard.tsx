import React, { FC } from 'react';
import { Work, TokenUsage } from '@/types';
import { StepId } from '@/types/steps';
import { WorkCard, CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { useResolvedAgentState } from '@/hooks/swarm/useResolvedSwarmState';
import { getStepConfig, hasStepContentError } from '@/utils/swarm/stepConstants';

interface StatusAwareWorkCardProps {
  // Card identification
  cardId: string;
  
  // Work and state data
  work: Work;
  step: StepId;
  index: number;
  
  // Message ID for scoping
  messageId?: string;
  
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

export type DisplayStatus = 'waiting' | 'working' | 'done' | 'error';

// StatusAwareWorkCard - Simplified wrapper with inline Zustand-based status logic.
export const StatusAwareWorkCard: FC<StatusAwareWorkCardProps> = ({
  cardId,
  work,
  step,
  index,
  messageId,
  title,
  content,
  tokenUsage,
  thought,
  debugInfo,
  downloadFilename,
  className,
  onCardAction
}) => {
  const config = getStepConfig(step);
  
  // Resolve agent state from either live store or historical snapshot
  const agent = useResolvedAgentState(messageId, step, index, work);
  const hasError = hasStepContentError(content, step);
  const status: DisplayStatus = 
    agent ? (agent.status as DisplayStatus) :
    hasError ? 'error' :
    content ? 'done' :
    'waiting';
  
  const label = agent?.label || config.labels[status];

  // DEBUG: Log final status
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
