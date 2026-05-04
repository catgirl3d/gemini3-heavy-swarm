import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ProviderType } from '@/types';
import { getProviderLogo } from '@/utils/logoHelpers';
import { useDynamicFavicon } from '@/hooks/ui/useDynamicFavicon';

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: vi.fn(),
}));

const getProviderLogoMock = vi.mocked(getProviderLogo);

const queryIcon = () => document.head.querySelector<HTMLLinkElement>("link[rel~='icon']");

describe('useDynamicFavicon', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.title = '';
    getProviderLogoMock.mockReset();
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.title = '';
    vi.clearAllMocks();
  });

  it('creates an icon link, sets href, and updates document title', () => {
    getProviderLogoMock.mockReturnValue('/assets/gemini.svg');

    renderHook(() => useDynamicFavicon(ProviderType.Gemini, 'gemini-pro', 'Gemini Pro'));

    const link = queryIcon();
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/assets/gemini.svg');
    expect(document.title).toBe('Gemini Pro');
    expect(getProviderLogoMock).toHaveBeenCalledExactlyOnceWith(ProviderType.Gemini, 'gemini-pro');
  });

  it.each([
    ['/assets/logo.svg', 'image/svg+xml'],
    ['/assets/logo.webp', 'image/webp'],
    ['/assets/logo.png', 'image/png'],
  ])('sets favicon type for %s', (logoSrc, expectedType) => {
    getProviderLogoMock.mockReturnValue(logoSrc);

    renderHook(() => useDynamicFavicon(ProviderType.OpenRouter, 'model', 'Model'));

    expect(queryIcon()?.type).toBe(expectedType);
  });

  it('reuses an existing icon link instead of appending duplicates', () => {
    const existingLink = document.createElement('link');
    existingLink.rel = 'icon';
    existingLink.href = '/old.png';
    document.head.appendChild(existingLink);
    getProviderLogoMock.mockReturnValue('/new.webp');

    renderHook(() => useDynamicFavicon(ProviderType.OpenRouter, 'openai/gpt-4o', 'GPT-4o'));

    const links = document.head.querySelectorAll("link[rel~='icon']");
    expect(links).toHaveLength(1);
    expect(links[0]).toBe(existingLink);
    expect(existingLink.getAttribute('href')).toBe('/new.webp');
    expect(existingLink.type).toBe('image/webp');
  });

  it('updates the existing link when provider, model, or title changes', () => {
    getProviderLogoMock
      .mockReturnValueOnce('/first.svg')
      .mockReturnValueOnce('/second.webp');

    const { rerender } = renderHook(
      ({ provider, model, title }) => useDynamicFavicon(provider, model, title),
      {
        initialProps: {
          provider: ProviderType.Gemini,
          model: 'gemini-pro',
          title: 'Gemini Pro',
        },
      }
    );
    const firstLink = queryIcon();

    rerender({
      provider: ProviderType.OpenRouter,
      model: 'openai/gpt-4o',
      title: 'GPT-4o',
    });

    expect(getProviderLogoMock).toHaveBeenLastCalledWith(ProviderType.OpenRouter, 'openai/gpt-4o');
    expect(queryIcon()).toBe(firstLink);
    expect(firstLink?.getAttribute('href')).toBe('/second.webp');
    expect(firstLink?.type).toBe('image/webp');
    expect(document.title).toBe('GPT-4o');
  });
});
