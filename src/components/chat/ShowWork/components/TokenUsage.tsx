import React, { FC, useState, useRef, useEffect } from 'react';
import { TokenUsage as TokenUsageType } from '@/types';
import { InfoIcon } from '../icons';
import './TokenUsage.css';

export const TokenUsage: FC<{ usage: TokenUsageType | null }> = ({ usage }) => {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  
  if (!usage) return null;
  
  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowPopup(false);
      }
    };
    
    if (showPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopup]);
  
  // Build inline breakdown string
  const buildBreakdown = () => {
    const prefix = usage.isEstimated ? '~' : '';
    const parts: string[] = [
      `P:${prefix}${usage.promptTokens}`,
      `O:${prefix}${usage.candidatesTokens}`
    ];
    
    if (usage.thoughtsTokenCount) {
      parts.push(`T:${prefix}${usage.thoughtsTokenCount}`);
    }
    
    if (usage.cachedContentTokenCount) {
      parts.push(`C:${prefix}${usage.cachedContentTokenCount}`);
    }
    
    if (usage.toolUsePromptTokenCount) {
      parts.push(`TU:${prefix}${usage.toolUsePromptTokenCount}`);
    }
    
    return parts.join(' | ');
  };
  
  return (
    <div className={`token-usage ${usage.isEstimated ? 'is-estimated' : ''}`}>
      <span className="token-count" title={usage.isEstimated ? 'Estimated token counts (waiting for final API data)' : 'Final token counts from API'}>
        {usage.isEstimated ? '~' : ''}{usage.totalTokens} tokens ({buildBreakdown()})
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowPopup(!showPopup);
        }}
        className="token-help-button"
        aria-label="Token usage details"
      >
        <InfoIcon />
      </button>
      
      {showPopup && (
        <div ref={popupRef} className="token-usage-popup">
          <div className="token-popup-header">
            Token Usage Breakdown {usage.isEstimated && <span className="estimated-badge">(Estimated)</span>}
          </div>
          
          <div className="token-popup-content">
            {usage.isEstimated && (
              <div className="token-estimate-notice">
                Counts are estimated in real-time and will update with final API data once complete.
              </div>
            )}
            
            <div className="token-group">
              <div className="token-row">
                <span className="token-label-detailed">P (Prompt)</span>
                <span className="token-value">{usage.isEstimated ? '~' : ''}{usage.promptTokens}</span>
              </div>
              <div className="token-description">
                Input tokens from your request
              </div>
            </div>
            
            <div className="token-group">
              <div className="token-row">
                <span className="token-label-detailed">O (Output)</span>
                <span className="token-value">{usage.isEstimated ? '~' : ''}{usage.candidatesTokens}</span>
              </div>
              <div className="token-description">
                Output tokens in the response
              </div>
            </div>
            
            {usage.thoughtsTokenCount !== undefined && usage.thoughtsTokenCount > 0 && (
              <div className="token-group">
                <div className="token-row">
                  <span className="token-label-detailed">T (Thoughts)</span>
                  <span className="token-value">{usage.isEstimated ? '~' : ''}{usage.thoughtsTokenCount}</span>
                </div>
                <div className="token-description">
                  Model reasoning tokens (thinking models)
                </div>
              </div>
            )}
            
            {usage.cachedContentTokenCount !== undefined && usage.cachedContentTokenCount > 0 && (
              <div className="token-group">
                <div className="token-row">
                  <span className="token-label-detailed">C (Cached)</span>
                  <span className="token-value">{usage.cachedContentTokenCount}</span>
                </div>
                <div className="token-description">
                  Tokens served from cache (cost savings)
                </div>
              </div>
            )}
            
            {usage.toolUsePromptTokenCount !== undefined && usage.toolUsePromptTokenCount > 0 && (
              <div className="token-group">
                <div className="token-row">
                  <span className="token-label-detailed">TU (Tool Use)</span>
                  <span className="token-value">{usage.isEstimated ? '~' : ''}{usage.toolUsePromptTokenCount}</span>
                </div>
                <div className="token-description">
                  Tokens for tool execution
                </div>
              </div>
            )}
            
            <div className="token-total-row">
              <span>TOTAL</span>
              <span className="token-value">{usage.isEstimated ? '~' : ''}{usage.totalTokens}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
