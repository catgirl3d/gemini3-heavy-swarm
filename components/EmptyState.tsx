import React, { FC } from 'react';
import geminiIcon from '../assets/Google-gemini-icon.png';

export const EmptyState: FC<{ onPromptClick: (prompt: string) => void; modelDisplayName: string }> = ({ onPromptClick, modelDisplayName }) => {
  const examplePrompts = [
    "Explain the concept of 'agentic workflows' in AI.",
    "Compare the pros and cons of Next.js and Remix.",
    "What are the ethical implications of generative AI in art?",
  ];
  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">
        <img src={geminiIcon} alt="Gemini Logo" />
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