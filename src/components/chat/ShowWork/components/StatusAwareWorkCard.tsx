import React, { FC, useEffect, useRef } from 'react';
import { Work, TokenUsage } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { WorkCard, CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { useResolvedAgentState } from '@/hooks/swarm/useResolvedSwarmState';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { getStepResults, getSynthesisResult } from '@/utils/swarm/workHelpers';
import { useAgentStore } from '@/stores/agentStore';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('StatusAwareWorkCard');

const getWorkContentLength = (work: Work | undefined, step: StepId, index: number) => {
  if (!work) return -1;

  if (step === STEPS.SYNTHESIS) {
    const result = getSynthesisResult(work);
    const text = typeof result === 'string' ? result : result?.text;
    return typeof text === 'string' ? text.length : -1;
  }

  return (getStepResults(work, step)[index] ?? '').length;
};

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
  allowRegenerate?: boolean;
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
  onCardAction,
  allowRegenerate
}) => {
  const config = getStepConfig(step);
  const lastEmptyDoneLogRef = useRef<string | null>(null);
  
  // Resolve agent state from either live store or historical snapshot
  const agent = useResolvedAgentState(messageId, step, index, work);
  const status: DisplayStatus = 
    agent ? (agent.status as DisplayStatus) :
    content ? 'done' :
    'waiting';
  
  const label = agent?.label || config.labels[status];
  
  // Use live agent name from state when available, otherwise fallback to passed title
  // This ensures role names (e.g., "Agent 1 (Researcher)") are shown during generation
  const displayTitle = agent?.name || title;

  useEffect(() => {
    if (status !== 'done' || content !== '') {
      lastEmptyDoneLogRef.current = null;
      return;
    }

    // Intentionally read a one-time store snapshot here: this effect only emits a
    // diagnostic warning for the suspicious "done + empty" state, and subscribing
    // to currentWork would add extra rerenders and duplicate log noise.
    const liveWork = useAgentStore.getState().currentWork;
    const propLen = content?.length ?? -1;
    const snapshotLen = getWorkContentLength(work, step, index);
    const liveLen = getWorkContentLength(liveWork ?? work, step, index);
    const logKey = [messageId ?? '', step, index, label, propLen, snapshotLen, liveLen, thought ? '1' : '0'].join('|');

    if (lastEmptyDoneLogRef.current === logKey) {
      return;
    }

    lastEmptyDoneLogRef.current = logKey;

    logger.warn('Done card rendered empty', {
      messageId,
      step,
      index,
      status,
      label,
      propLen,
      snapshotLen,
      liveLen,
      hasThought: !!thought,
    });
  }, [content, index, label, messageId, status, step, thought, work]);

  return (
    <WorkCard
      cardId={cardId}
      onCardAction={onCardAction}
      className={className}
      title={displayTitle}
      statusLabel={label}
      status={status}
      icon={status === 'waiting' ? <span>{index + 1}</span> : undefined}
      content={content}
      tokenUsage={tokenUsage}
      thought={thought}
      debugInfo={debugInfo}
      downloadFilename={downloadFilename}
      allowRegenerate={allowRegenerate}
    />
  );
};
