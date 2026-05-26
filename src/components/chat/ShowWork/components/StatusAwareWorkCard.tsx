import React, { type FC, useEffect, useRef } from 'react';
import { type Work, type TokenUsage } from '@/types';
import { type StepId } from '@/types/steps';
import { WorkCard, type CardActionType } from '@/components/chat/ShowWork/components/WorkCard';
import { useResolvedAgentState } from '@/hooks/swarm/useResolvedSwarmState';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { getStepContent, getStepMeta } from '@/utils/swarm/workHelpers';
import { useAgentStore } from '@/stores/agentStore';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('StatusAwareWorkCard');

const getWorkContentLength = (work: Work | undefined, step: StepId, index: number) => {
  if (!work) return -1;
  const content = getStepContent(work, step, index);
  return typeof content === 'string' ? content.length : -1;
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
  preferLiveSession?: boolean;
  
  // Callbacks
  onCardAction: (cardId: string, action: CardActionType) => void;
  allowRegenerate?: boolean;
}

export type DisplayStatus = 'waiting' | 'working' | 'done' | 'error' | 'stale';

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
  preferLiveSession = false,
  onCardAction,
  allowRegenerate
}) => {
  const config = getStepConfig(step);
  const lastEmptyDoneLogRef = useRef<string | null>(null);
  
  const agent = useResolvedAgentState(messageId, step, index, work, preferLiveSession);
  const metaStatus = getStepMeta(work, step)?.status;
  const status: DisplayStatus = (() => {
    if (agent) return agent.status;
    if (metaStatus === 'stale') return 'stale';
    if (metaStatus === 'error') return 'error';
    if (metaStatus === 'working') return 'working';
    if (metaStatus === 'done' || content) return 'done';
    return 'waiting';
  })();
  
  const label = status === 'stale'
    ? config.labels.stale
    : agent?.label || config.labels[status];
  
  // Use live agent name from state when available, otherwise fallback to passed title
  // This ensures role names (e.g., "Agent 1 (Researcher)") are shown during generation
  const displayTitle = agent?.name || title;

  useEffect(() => {
    if (status !== 'done' || content !== '' || label === 'Skipped') {
      lastEmptyDoneLogRef.current = null;
      return;
    }

    // Intentionally read a one-time store snapshot here: this effect only emits a
    // diagnostic warning for the suspicious "done + empty" state, and subscribing
    // to session work would add extra rerenders and duplicate log noise.
    const activeSessionMessageId = useAgentStore.getState().activeSessionMessageId;
    const sessionWork = preferLiveSession && messageId && activeSessionMessageId === messageId
      ? useAgentStore.getState().sessionsByMessageId[messageId]?.work
      : undefined;
    const liveWork = sessionWork ?? work;
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
  }, [content, index, label, messageId, preferLiveSession, status, step, thought, work]);

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
