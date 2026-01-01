import { useState, useEffect, useRef } from 'react';
import { ServerStatus } from '@/types';
import { Logger } from '@shared/utils/logger';

export function useServerStatus() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    hasServerKey: false,
    hasOpenRouterKey: false,
    proxyMode: 'private',
    isLoaded: false
  });
  const [shouldShowLoadingBanner, setShouldShowLoadingBanner] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  
  // Use ref to avoid stale closure in setTimeout
  const isLoadedRef = useRef(false);

  useEffect(() => {
    // Show loading banner only if check takes longer than 300ms
    const loadingTimer = setTimeout(() => {
      if (!isLoadedRef.current) {
        setShouldShowLoadingBanner(true);
      }
    }, 300);

    fetch('/api/status')
      .then(res => {
        const contentType = res.headers.get('content-type');
        if (!res.ok || !contentType || !contentType.includes('application/json')) {
          return null;
        }
        return res.json();
      })
      .then(data => {
        clearTimeout(loadingTimer);
        setShouldShowLoadingBanner(false);
        if (data && typeof data.hasServerKey === 'boolean') {
          isLoadedRef.current = true;
          setServerStatus({
            hasServerKey: data.hasServerKey,
            hasOpenRouterKey: !!data.hasOpenRouterKey,
            proxyMode: data.proxyMode || 'private',
            isLoaded: true
          });
        } else {
          isLoadedRef.current = true;
          setServerStatus(prev => ({ ...prev, isLoaded: true }));
        }
      })
      .catch(err => {
        clearTimeout(loadingTimer);
        setShouldShowLoadingBanner(false);
        new Logger('ServerStatus').debug('Server status check failed (running client-only?):', err);
        isLoadedRef.current = true;
        setServerStatus(prev => ({ ...prev, isLoaded: true }));
      });

    return () => clearTimeout(loadingTimer);
  }, []);

  const dismissBanner = () => setIsBannerDismissed(true);

  return {
    serverStatus,
    shouldShowLoadingBanner,
    isBannerDismissed,
    dismissBanner,
    isMissingKey: !serverStatus.hasServerKey,
    isProxyDemo: serverStatus.hasServerKey && serverStatus.proxyMode !== 'private',
    isProxyPrivate: serverStatus.hasServerKey && serverStatus.proxyMode === 'private'
  };
}
