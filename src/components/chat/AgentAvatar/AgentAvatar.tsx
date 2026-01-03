import React, { FC } from 'react';
import geminiIcon from '@/assets/Google-gemini-icon.webp';
import { ProviderType } from '@/types';
import { getProviderLogo } from '@/utils/logoHelpers';
import './AgentAvatar.css';

interface AgentAvatarProps {
  type: 'user' | 'model';
  provider?: ProviderType;
  model?: string;
}

export const AgentAvatar: FC<AgentAvatarProps> = ({ type, provider, model }) => {
  const logoSrc = provider ? getProviderLogo(provider, model) : geminiIcon;
  
  return (
    <div className="avatar">
      {type === 'user' ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      ) : (
        <img src={logoSrc} alt="AI Logo" key={logoSrc} />
      )}
    </div>
  );
};
