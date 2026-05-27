import React, { type FC, type ReactNode, memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { type TokenUsage as TokenUsageType } from '@/types';
import { MarkdownRenderer } from '@/components/ui';
import { SpinnerIcon, ErrorIcon, CheckIcon, StaleIcon, ExpandIcon, ThoughtIcon, DebugIcon, DownloadIcon, RegenerateIcon } from '@/components/chat/ShowWork/icons';
import { ActionMenu } from './ActionMenu';
import { TokenUsage } from './TokenUsage';
import { downloadContent } from '@/components/chat/ShowWork/utils';
import { AppError } from '@/utils/errors/AppError';

export type CardActionType = 'expand' | 'showThought' | 'showDebug' | 'regenerate';

interface WorkCardProps {
  title: string;
  statusLabel: string;
  status: 'working' | 'done' | 'error' | 'waiting' | 'stale';
  icon?: ReactNode;
  content: string | null;
  tokenUsage?: TokenUsageType | null;
  thought?: string | null;
  debugInfo?: unknown;
  cardId?: string;
  onCardAction?: (cardId: string, action: CardActionType) => void;
  onExpand?: () => void;
  onShowThought?: () => void;
  onShowDebug?: () => void;
  onRegenerate?: () => void;
  /**
   * Controls whether the regenerate action is available.
   * Defaults to `false` as a secure default to prevent unintended actions
   * (e.g., for stopped/completed messages or when permission isn't explicitly granted).
   */
  allowRegenerate?: boolean;
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
      setThrottledContent(content);
      lastUpdateRef.current = Date.now();
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Force immediate update if we are transitioning from empty to non-empty content.
    // This prevents the "Thinking..." state from hanging when the first chunk arrives.
    const isFirstContent = (!throttledContent || throttledContent === '') && content && content.length > 0;

    if (isFirstContent || timeSinceLastUpdate >= throttleMs) {
      // Enough time has passed, update now
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setThrottledContent(content);
      lastUpdateRef.current = now;
    } else {
      // Schedule an update for the remainder of the throttle period if one isn't already running
      if (timerRef.current === null) {
        timerRef.current = setTimeout(() => {
          // Use current ref value to avoid stale closure
          setThrottledContent(contentRef.current);
          lastUpdateRef.current = Date.now();
          timerRef.current = null;
        }, throttleMs - timeSinceLastUpdate);
      }
    }

    return () => {
      // CRITICAL: We should only clear timer on unmount OR when status changes
      // In a throttler, we DON'T want to clear the timer on every dependency change 
    };
  }, [content, status, throttleMs]);

  // Separate effect specifically for cleanup on unmount or status change
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status]);

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
  allowRegenerate = false,
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
      return;
    }

    onRegenerate?.();
  }, [cardId, onCardAction, onRegenerate]);
  const renderContent = (content: string | null) => {
    // Check for error status
    if (status === 'error') {
      // Use statusLabel for error classification
      let errorMessage = statusLabel;
      
      // If statusLabel doesn't help, use generic fallback
      if (statusLabel.includes('Failed') || statusLabel.includes('Error')) {
        // statusLabel is too generic, use fallback
        errorMessage = 'An error occurred during generation.';
      }
      
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
    
    // Check if the agent was skipped due to workflow error/bypass
    const isSkipped = statusLabel === 'Skipped' || statusLabel.includes('Skipped');
    if (content === '' && status === 'done' && isSkipped) {
      return (
        <div className="agent-error-display">
          <div className="agent-error-type" style={{ backgroundColor: 'var(--model-message-border)', color: 'var(--text-secondary)' }}>Skipped</div>
          <div className="agent-error-message">
            This agent was skipped during execution. No response was generated.
          </div>
        </div>
      );
    }

    // CRITICAL: If model finished (status='done') but returned no text, show warning
    // This happens with models like gemini-3-pro-preview that sometimes only return thoughts
    if (content === '' && status === 'done') {
      return (
        <div className="agent-error-display">
          <div className="agent-error-type">No Text Response</div>
          <div className="agent-error-message">
            The model completed successfully but did not return any text content. 
            {thought ? ' Thought process was captured.' : ''} 
            Try regenerating this agent.
          </div>
        </div>
      );
    }
    
    if (content === '') return <div className="pending-work">Thinking...</div>;
    
    return <MarkdownRenderer content={content} />;
  };

  const canRegenerate = allowRegenerate && Boolean(onRegenerate || (cardId && onCardAction));

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
            ...(canRegenerate && status !== 'working' ? [{
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
             status === 'stale' ? <StaleIcon /> : 
             status === 'done' ? <CheckIcon /> : 
             icon || null}
           </div>
           <div className="work-card-info">
             <span className="work-card-name">{title}</span>
             <span className={`work-card-status ${status === 'error' ? 'error' : status === 'stale' ? 'stale' : ''}`}>
               {statusLabel}
             </span>
           </div>
         </div>
        {(content || status === 'error' || status === 'done' || status === 'stale') && (
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
