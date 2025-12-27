import React, { FC } from 'react';
import geminiIcon from '@/assets/Google-gemini-icon.png';

interface HeaderProps {
  modelDisplayName: string;
  onInfoClick: () => void;
  onSettingsClick: () => void;
}

export const Header: FC<HeaderProps> = ({
  modelDisplayName,
  onInfoClick,
  onSettingsClick
}) => {
  return (
    <header>
      <div className="header-content">
          <div className="header-logo">
              <img src={geminiIcon} alt="Gemini Logo" />
          </div>
          <h1>{modelDisplayName}</h1>
      </div>
      <div className="header-actions">
          <button
              className="settings-button"
              onClick={onInfoClick}
              aria-label="How it Works"
              title="How it Works"
          >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
          </button>
          <button
              className="settings-button"
              onClick={() => window.location.reload()}
              aria-label="Home"
              title="Reset / Home"
          >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
          </button>
          <button
              className="settings-button"
              onClick={onSettingsClick}
              aria-label="Swarm Settings"
          >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.15 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
          </button>
      </div>
    </header>
  );
};
