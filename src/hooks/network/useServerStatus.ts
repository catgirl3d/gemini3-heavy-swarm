import { useState, useEffect, useRef } from 'react';
import { ServerStatus } from '@/types';
import { Logger } from '@shared/utils/logger';

const DEFAULT_PROXY_MODE = 'private';

const isJsonContentType = (contentType: string | null): boolean => (
  contentType?.toLowerCase().includes('application/json') ?? false
);

const normalizeProxyMode = (proxyMode: unknown): 'demo' | 'private' => (
  proxyMode === 'demo' ? 'demo' : DEFAULT_PROXY_MODE
);

export function useServerStatus() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    hasServerKey: false,
    hasOpenRouterKey: false,
    proxyMode: DEFAULT_PROXY_MODE,
    isLoaded: false
  });
  const [shouldShowLoadingBanner, setShouldShowLoadingBanner] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  
  // Use ref to avoid stale closure in setTimeout
  const isLoadedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // Show loading banner only if check takes longer than 300ms
    const loadingTimer = setTimeout(() => {
      if (isMounted && !isLoadedRef.current) {
        setShouldShowLoadingBanner(true);
      }
    }, 300);

    fetch('/api/status')
      .then(res => {
        const contentType = res.headers.get('content-type');
        if (!isMounted || !res.ok || !isJsonContentType(contentType)) {
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        clearTimeout(loadingTimer);
        setShouldShowLoadingBanner(false);
        if (data && typeof data.hasServerKey === 'boolean') {
          isLoadedRef.current = true;
          setServerStatus({
            hasServerKey: data.hasServerKey,
            hasOpenRouterKey: !!data.hasOpenRouterKey,
            proxyMode: normalizeProxyMode(data.proxyMode),
            isLoaded: true
          });
        } else {
          isLoadedRef.current = true;
          setServerStatus(prev => ({ ...prev, isLoaded: true }));
        }
      })
      .catch(err => {
        if (!isMounted) return;
        clearTimeout(loadingTimer);
        setShouldShowLoadingBanner(false);
        new Logger('ServerStatus').debug('Server status check failed (running client-only?):', err);
        isLoadedRef.current = true;
        setServerStatus(prev => ({ ...prev, isLoaded: true }));
      });

    return () => {
      isMounted = false;
      clearTimeout(loadingTimer);
    };
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
