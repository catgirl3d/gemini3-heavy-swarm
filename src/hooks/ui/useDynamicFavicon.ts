import { useEffect } from 'react';
import { ProviderType } from '@/types';
import { getProviderLogo } from '@/utils/logoHelpers';

/**
 * Hook to dynamically update the browser favicon based on the selected provider and model.
 */
export function useDynamicFavicon(provider: ProviderType, model: string, modelDisplayName: string) {
  useEffect(() => {
    const logoSrc = getProviderLogo(provider, model);
    
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    
    link.href = logoSrc;
    
    // Update document title
    document.title = modelDisplayName;
    
    // Optional: Update type based on extension
    if (logoSrc.endsWith('.svg')) {
      link.type = 'image/svg+xml';
    } else if (logoSrc.endsWith('.webp')) {
      link.type = 'image/webp';
    } else {
      link.type = 'image/png';
    }
  }, [provider, model, modelDisplayName]);
}
