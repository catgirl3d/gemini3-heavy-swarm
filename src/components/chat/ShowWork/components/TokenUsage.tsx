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
    const parts: string[] = [
      `P:${usage.promptTokens}`,
      `O:${usage.candidatesTokens}`
    ];
    
    if (usage.thoughtsTokenCount) {
      parts.push(`T:${usage.thoughtsTokenCount}`);
    }
    
    if (usage.cachedContentTokenCount) {
      parts.push(`C:${usage.cachedContentTokenCount}`);
    }
    
    if (usage.toolUsePromptTokenCount) {
      parts.push(`TU:${usage.toolUsePromptTokenCount}`);
    }
    
    return parts.join(' | ');
  };
  
  return (
    <div className="token-usage">
      <span className="token-count">
        {usage.totalTokens} tokens ({buildBreakdown()})
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
            Token Usage Breakdown
          </div>
          
          <div className="token-popup-content">
            <div className="token-group">
              <div className="token-row">
                <span className="token-label-detailed">P (Prompt)</span>
                <span className="token-value">{usage.promptTokens}</span>
              </div>
              <div className="token-description">
                Input tokens from your request
              </div>
            </div>
            
            <div className="token-group">
              <div className="token-row">
                <span className="token-label-detailed">O (Output)</span>
                <span className="token-value">{usage.candidatesTokens}</span>
              </div>
              <div className="token-description">
                Output tokens in the response
              </div>
            </div>
            
            {usage.thoughtsTokenCount !== undefined && usage.thoughtsTokenCount > 0 && (
              <div className="token-group">
                <div className="token-row">
                  <span className="token-label-detailed">T (Thoughts)</span>
                  <span className="token-value">{usage.thoughtsTokenCount}</span>
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
                  <span className="token-value">{usage.toolUsePromptTokenCount}</span>
                </div>
                <div className="token-description">
                  Tokens for tool execution
                </div>
              </div>
            )}
            
            <div className="token-total-row">
              <span>TOTAL</span>
              <span className="token-value">{usage.totalTokens}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
