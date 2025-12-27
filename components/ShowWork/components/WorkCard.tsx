import React, { FC, ReactNode, memo, useCallback, useMemo } from 'react';
import { TokenUsage as TokenUsageType } from '@/types';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { SpinnerIcon, ErrorIcon, CheckIcon, ExpandIcon, ThoughtIcon, DebugIcon, DownloadIcon, RegenerateIcon } from '@/components/ShowWork/icons';
import { ActionMenu } from '@/components/ShowWork/components/ActionMenu';
import { TokenUsage } from '@/components/ShowWork/components/TokenUsage';
import { downloadContent } from '@/components/ShowWork/utils';

export type CardActionType = 'expand' | 'showThought' | 'showDebug' | 'regenerate';

interface WorkCardProps {
  title: string;
  statusLabel: string;
  status: 'working' | 'done' | 'error' | 'waiting';
  icon?: ReactNode;
  content: string | null;
  tokenUsage?: TokenUsageType | null;
  thought?: string | null;
  debugInfo?: unknown;
  /** Stable callback pattern: cardId + onCardAction instead of individual callbacks */
  cardId?: string;
  onCardAction?: (cardId: string, action: CardActionType) => void;
  /** Legacy individual callbacks - will be deprecated */
  onExpand?: () => void;
  onShowThought?: () => void;
  onShowDebug?: () => void;
  onRegenerate?: () => void;
  downloadFilename: string;
  className?: string;
}

const WorkCardComponent: FC<WorkCardProps> = ({
  title,
  statusLabel,
  status,
  icon,
  content,
  tokenUsage,
  thought,
  debugInfo,
  cardId,
  onCardAction,
  onExpand,
  onShowThought,
  onShowDebug,
  onRegenerate,
  downloadFilename,
  className = ''
}) => {
  // Unified action handlers that use stable cardId pattern when available
  const handleExpand = useCallback(() => {
    if (cardId && onCardAction) {
      onCardAction(cardId, 'expand');
    } else if (onExpand) {
      onExpand();
    }
  }, [cardId, onCardAction, onExpand]);

  const handleShowThought = useCallback(() => {
    if (cardId && onCardAction) {
      onCardAction(cardId, 'showThought');
    } else if (onShowThought) {
      onShowThought();
    }
  }, [cardId, onCardAction, onShowThought]);

  const handleShowDebug = useCallback(() => {
    if (cardId && onCardAction) {
      onCardAction(cardId, 'showDebug');
    } else if (onShowDebug) {
      onShowDebug();
    }
  }, [cardId, onCardAction, onShowDebug]);

  const handleRegenerate = useCallback(() => {
    if (cardId && onCardAction) {
      onCardAction(cardId, 'regenerate');
    } else if (onRegenerate) {
      onRegenerate();
    }
  }, [cardId, onCardAction, onRegenerate]);
  const renderContent = (content: string | null) => {
    if (content === null) return <div className="pending-work">Waiting for agent output...</div>;
    if (content === '') return <div className="pending-work">Thinking...</div>;
    
    // Check if this is an error message from the system
    const errorMatch = content.match(/\[System: (.+?)\]/);
    if (errorMatch && status === 'error') {
      const errorMessage = errorMatch[1];
      // Extract human-readable error
      const is429 = errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit');
      const is503 = errorMessage.includes('503');
      
      let displayMessage = errorMessage;
      let errorType = 'Error';
      
      if (is429) {
        errorType = 'Rate Limit';
        displayMessage = 'Too many requests. The API is temporarily blocked. Please wait a moment and try again.';
      } else if (is503) {
        errorType = 'Service Unavailable';
        displayMessage = 'The server is temporarily unavailable. Please try again later.';
      }
      
      return (
        <div className="agent-error-display">
          <div className="agent-error-type">{errorType}</div>
          <div className="agent-error-message">{displayMessage}</div>
        </div>
      );
    }
    
    return <MarkdownRenderer content={content} />;
  };

  const canRegenerate = Boolean(onRegenerate || (cardId && onCardAction));

  const actions = useMemo(() => [
    ...(thought ? [{
        label: 'Show Thought Process',
        icon: <ThoughtIcon />,
        onClick: handleShowThought
    }] : []),
    ...(debugInfo ? [{
        label: 'Debug Info',
        icon: <DebugIcon />,
        onClick: handleShowDebug
    }] : []),
    ...(content ? [{
        label: 'Download Response',
        icon: <DownloadIcon />,
        onClick: () => downloadContent(downloadFilename, content)
    }] : []),
    ...(canRegenerate ? [{
        label: status === 'error' ? 'Retry' : 'Regenerate',
        icon: <RegenerateIcon />,
        onClick: handleRegenerate,
        danger: status === 'error'
    }] : [])
  ], [thought, debugInfo, content, canRegenerate, status, handleShowThought, handleShowDebug, handleRegenerate, downloadFilename]);

  return (
    <div className={`work-card ${className} ${status === 'error' ? 'error' : ''}`}>
      <div className="modal-header work-card-header">
        <div className="work-card-title-group">
          <div className={`work-card-icon ${status}`}>
            {status === 'working' ? <SpinnerIcon /> : 
             status === 'error' ? <ErrorIcon /> : 
             status === 'done' ? <CheckIcon /> : 
             icon || null}
          </div>
          <div className="work-card-info">
            <span className="work-card-name">{title}</span>
            <span className={`work-card-status ${status === 'error' ? 'error' : ''}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        {content && (
          <div className="work-card-actions">
            <button
              className="modal-icon-btn expand-work-button"
              onClick={(e) => {
                e.preventDefault();
                handleExpand();
              }}
              title="Expand Response"
              aria-label="Expand Response"
            >
              <ExpandIcon />
            </button>
            <ActionMenu actions={actions} />
          </div>
        )}
      </div>
      <div className="modal-body work-card-body">
        {renderContent(content)}
      </div>
      {tokenUsage && (
        <div className="modal-footer work-card-footer">
          <TokenUsage usage={tokenUsage} />
        </div>
      )}
    </div>
  );
};

// Memoized version for performance optimization
export const WorkCard = memo(WorkCardComponent);
