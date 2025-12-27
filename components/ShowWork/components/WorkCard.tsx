import React, { FC, ReactNode, memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { TokenUsage as TokenUsageType } from '@/types';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { SpinnerIcon, ErrorIcon, CheckIcon, ExpandIcon, ThoughtIcon, DebugIcon, DownloadIcon, RegenerateIcon } from '@/components/ShowWork/icons';
import { ActionMenu } from '@/components/ShowWork/components/ActionMenu';
import { TokenUsage } from '@/components/ShowWork/components/TokenUsage';
import { downloadContent } from '@/components/ShowWork/utils';
import { AppError } from '@/utils/errors/AppError';

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

/**
 * Custom hook to throttle content updates during active streaming.
 * It ensures markdown parsing doesn't happen on every single token, 
 * which can be 10-30 times per second per agent.
 */
function useThrottledContent(content: string | null, status: string, throttleMs: number = 300) {
  const [throttledContent, setThrottledContent] = useState(content);
  const lastUpdateRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef(content);

  // Always keep ref up to date
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    // If status is not 'working', update immediately
    if (status !== 'working') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setThrottledContent(content);
      lastUpdateRef.current = Date.now();
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate >= throttleMs) {
      // Enough time has passed, update now
      if (timerRef.current) clearTimeout(timerRef.current);
      setThrottledContent(content);
      lastUpdateRef.current = now;
    } else {
      // Schedule an update for the remainder of the throttle period
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          // Use current ref value to avoid stale closure
          setThrottledContent(contentRef.current);
          lastUpdateRef.current = Date.now();
          timerRef.current = null;
        }, throttleMs - timeSinceLastUpdate);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, status, throttleMs]);

  return throttledContent;
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
  const throttledContent = useThrottledContent(content, status);

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
    // Check for system error messages in content, or fallback to status-based error display if content is missing.
    const contentToAnalyze = content || '';
    
    const errorMatch = contentToAnalyze.match(/\[System: (.+?)\]/);
    if ((errorMatch && status === 'error') || (status === 'error' && content === null)) {
      const errorMessage = errorMatch ? errorMatch[1] : 'An error occurred during generation.';
      const appError = AppError.from(errorMessage);
      const displayMessage = appError.toFriendlyMessage();
      
      // Map error codes to section labels if helpful
      const errorType = appError.code.replace(/_/g, ' ').toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
      
      return (
        <div className="agent-error-display">
          <div className="agent-error-type">{errorType}</div>
          <div className="agent-error-message">{displayMessage}</div>
        </div>
      );
    }

    if (content === null) return <div className="pending-work">Waiting for agent output...</div>;
    if (content === '') return <div className="pending-work">Thinking...</div>;
    
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
    <div className={`work-card ${className} ${status}`}>
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
        {(content || status === 'error') && (
          <div className="work-card-actions">
            {content && (
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
            )}
            <ActionMenu actions={actions} />
          </div>
        )}
      </div>
      <div className="modal-body work-card-body">
        {renderContent(throttledContent)}
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
