import React, { FC } from 'react';

export const TokenUsage: FC<{ usage: any }> = ({ usage }) => {
  if (!usage) return null;
  return (
    <div className="token-usage" title={`Prompt: ${usage.promptTokens}, Output: ${usage.candidatesTokens}`}>
      <span className="token-count">{usage.totalTokens} tokens</span>
    </div>
  );
};
