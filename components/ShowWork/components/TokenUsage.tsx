import React, { FC } from 'react';
import { TokenUsage as TokenUsageType } from '@/types';

export const TokenUsage: FC<{ usage: TokenUsageType | null }> = ({ usage }) => {
  if (!usage) return null;
  return (
    <div className="token-usage" title={`Prompt: ${usage.promptTokens}, Output: ${usage.candidatesTokens}`}>
      <span className="token-count">{usage.totalTokens} tokens</span>
    </div>
  );
};
