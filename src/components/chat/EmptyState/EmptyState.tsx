import React, { FC } from 'react';
import { ProviderType } from '@/types';
import { getProviderLogo } from '@/utils/logoHelpers';
import './EmptyState.css';

interface EmptyStateProps {
  onPromptClick: (prompt: string) => void;
  modelDisplayName: string;
  provider: ProviderType;
  model: string;
}

export const EmptyState: FC<EmptyStateProps> = ({ 
  onPromptClick, 
  modelDisplayName,
  provider,
  model
}) => {
  const logoSrc = getProviderLogo(provider, model);
  const examplePrompts = [
    "Analyze the impact of Blackwell GPUs on AI scaling laws.",
    "Draft a technical proposal for a multi-agent orchestration layer.",
    "Synthesize the main arguments for and against AGI by 2030.",
  ];
  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">
        <img src={logoSrc} alt={`${modelDisplayName} Logo`} key={logoSrc} />
      </div>
      <h2 className="welcome-title">{modelDisplayName}</h2>
      <p className="welcome-subtitle">How can this AI swarm assist you today?</p>

      <a href="https://t.me/temnobogin9" target="_blank" rel="noopener noreferrer" className="creator-credit">
        by Lisova
      </a>

      <div className="example-prompts">
        {examplePrompts.map((prompt, i) => (
          <button key={i} className="prompt-button" onClick={() => onPromptClick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};
