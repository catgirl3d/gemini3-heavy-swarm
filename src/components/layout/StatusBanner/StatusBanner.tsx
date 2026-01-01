import React, { FC } from 'react';
import { ServerStatus } from '@/types';

interface StatusBannerProps {
  serverStatus: ServerStatus;
  shouldShowLoadingBanner: boolean;
  isUsingProxy: boolean;
  isBannerDismissed: boolean;
  onDismiss: () => void;
  isMissingKey: boolean;
  isProxyDemo: boolean;
  isProxyPrivate: boolean;
  hasUserApiKey: boolean;
  hasUserOpenRouterKey: boolean;
}

export const StatusBanner: FC<StatusBannerProps> = ({
  serverStatus,
  shouldShowLoadingBanner,
  isUsingProxy,
  isBannerDismissed,
  onDismiss,
  isMissingKey,
  isProxyDemo,
  isProxyPrivate,
  hasUserApiKey,
  hasUserOpenRouterKey
}) => {
  if (isBannerDismissed) return null;

  return (
    <>
      {shouldShowLoadingBanner && isUsingProxy && (
        <div className="modal-banner info global">
            <div className="modal-banner-content">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
                Checking server status...
            </div>
        </div>
      )}

      {serverStatus.isLoaded && isMissingKey && (
        <div className="modal-banner warning global">
            <div className="modal-banner-content">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
                No API Key found. Please add your API key in settings or configure the server environment.
            </div>
            <button className="modal-banner-close-btn" onClick={onDismiss} aria-label="Dismiss banner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
      )}

      {serverStatus.isLoaded && isProxyDemo && !hasUserApiKey && !hasUserOpenRouterKey && (
        <div className="modal-banner info global">
            <div className="modal-banner-content">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
                Demo mode. Limited models available. Add your own API key in settings to unlock full access.
            </div>
            <button className="modal-banner-close-btn" onClick={onDismiss} aria-label="Dismiss banner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
      )}

      {serverStatus.isLoaded && (isProxyPrivate || hasUserApiKey || hasUserOpenRouterKey) && (
        <div className="modal-banner success global">
            <div className="modal-banner-content">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 1.5c2.9 0 5.25 2.35 5.25 5.25v3.75a.75.75 0 01-1.5 0V6.75a3.75 3.75 0 10-7.5 0v3a3 3 0 013 3v6.75a3 3 0 01-3 3H3.75a3 3 0 01-3-3v-6.75a3 3 0 013-3h9v-3c0-2.9 2.35-5.25 5.25-5.25z" />
                </svg>
                {hasUserApiKey || hasUserOpenRouterKey
                    ? "Private API Key Active. All models are unlocked."
                    : "Private Server Mode. All models are unlocked via the server's API key."
                }
            </div>
            <button className="modal-banner-close-btn" onClick={onDismiss} aria-label="Dismiss banner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
      )}
    </>
  );
};
