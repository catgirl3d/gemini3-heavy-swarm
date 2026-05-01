import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getProviderInfo, useProviderInfo } from '@/hooks/core/useProviderInfo';
import { isUsingProxy as checkProxyUsage } from '@/services/proxy/proxyUtils';
import { AppSettings, ProviderType, ServerStatus } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';

vi.mock('@/services/proxy/proxyUtils', () => ({
  isUsingProxy: vi.fn(),
}));

const createServerStatus = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  hasServerKey: false,
  hasOpenRouterKey: false,
  proxyMode: 'private',
  isLoaded: true,
  ...overrides,
});

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.Gemini,
  model: 'gemini-2.5-flash',
  openRouterModel: 'openai/gpt-4o',
  apiKey: undefined,
  openRouterApiKey: undefined,
  ...overrides,
});

describe('getProviderInfo', () => {
  beforeEach(() => {
    vi.mocked(checkProxyUsage).mockReset();
  });

  it('reports Gemini direct mode as unlocked when a user API key exists', () => {
    vi.mocked(checkProxyUsage).mockReturnValue(false);
    const settings = createSettings({ apiKey: 'gemini-key' });

    const info = getProviderInfo(settings, createServerStatus());

    expect(checkProxyUsage).toHaveBeenCalledWith('gemini-key');
    expect(info.isGemini).toBe(true);
    expect(info.isOpenRouter).toBe(false);
    expect(info.currentModelId).toBe('gemini-2.5-flash');
    expect(info.isUsingProxy).toBe(false);
    expect(info.isUnlocked).toBe(true);
    expect(info.isDemoMode).toBe(false);
    expect(info.modelDisplayName).toContain('Swarm');
    expect(info.canSend('hello', false)).toBe(true);
  });

  it('locks Gemini proxy mode when the server has no Gemini key', () => {
    vi.mocked(checkProxyUsage).mockReturnValue(true);
    const settings = createSettings({ apiKey: undefined });

    const info = getProviderInfo(settings, createServerStatus({ hasServerKey: false }));

    expect(info.isUsingProxy).toBe(true);
    expect(info.isUnlocked).toBe(false);
    expect(info.isDemoMode).toBe(false);
    expect(info.canSend('hello', false)).toBe(false);
  });

  it('unlocks Gemini proxy mode and marks demo mode outside private proxy mode', () => {
    vi.mocked(checkProxyUsage).mockReturnValue(true);
    const settings = createSettings({ apiKey: undefined });

    const info = getProviderInfo(settings, createServerStatus({ hasServerKey: true, proxyMode: 'demo' }));

    expect(info.isUnlocked).toBe(true);
    expect(info.isDemoMode).toBe(true);
    expect(info.canSend('', true)).toBe(true);
  });

  it('unlocks Gemini direct mode when proxy utility reports an env key path without a user key', () => {
    vi.mocked(checkProxyUsage).mockReturnValue(false);
    const settings = createSettings({ apiKey: undefined });

    const info = getProviderInfo(settings, createServerStatus({ hasServerKey: false }));

    expect(info.isUsingProxy).toBe(false);
    expect(info.isUnlocked).toBe(true);
  });

  it('reports OpenRouter direct mode without consulting Gemini proxy utilities', () => {
    const settings = createSettings({
      provider: ProviderType.OpenRouter,
      openRouterApiKey: 'openrouter-key',
      openRouterModel: 'anthropic/claude-3.5-sonnet',
    });

    const info = getProviderInfo(settings, createServerStatus());

    expect(checkProxyUsage).not.toHaveBeenCalled();
    expect(info.isGemini).toBe(false);
    expect(info.isOpenRouter).toBe(true);
    expect(info.currentModelId).toBe('anthropic/claude-3.5-sonnet');
    expect(info.isUsingProxy).toBe(false);
    expect(info.isUnlocked).toBe(true);
    expect(info.canSend('hello', false)).toBe(true);
  });

  it('locks and unlocks OpenRouter proxy mode based on server OpenRouter key availability', () => {
    const settings = createSettings({
      provider: ProviderType.OpenRouter,
      openRouterApiKey: undefined,
      openRouterModel: 'openai/gpt-4o',
    });

    const locked = getProviderInfo(settings, createServerStatus({ hasOpenRouterKey: false }));
    const unlocked = getProviderInfo(settings, createServerStatus({ hasOpenRouterKey: true, proxyMode: 'private' }));

    expect(locked.isUsingProxy).toBe(true);
    expect(locked.isUnlocked).toBe(false);
    expect(locked.canSend('hello', false)).toBe(false);
    expect(unlocked.isUsingProxy).toBe(true);
    expect(unlocked.isUnlocked).toBe(true);
    expect(unlocked.isDemoMode).toBe(false);
  });

  it('rejects sends with no content or no selected model', () => {
    vi.mocked(checkProxyUsage).mockReturnValue(false);
    const withModel = getProviderInfo(createSettings({ apiKey: 'key', model: 'gemini-pro' }));
    const withoutModel = getProviderInfo(createSettings({ apiKey: 'key', model: '   ' }));

    expect(withModel.canSend('   ', false)).toBe(false);
    expect(withModel.canSend('   ', true)).toBe(true);
    expect(withoutModel.canSend('hello', false)).toBe(false);
  });

  it('uses provider-specific fallback display names when model IDs are empty', () => {
    vi.mocked(checkProxyUsage).mockReturnValue(false);

    const geminiInfo = getProviderInfo(createSettings({ apiKey: 'key', model: '' }));
    const openRouterInfo = getProviderInfo(createSettings({
      provider: ProviderType.OpenRouter,
      openRouterApiKey: 'key',
      openRouterModel: '',
    }));

    expect(geminiInfo.modelDisplayName).toBe('AI Swarm');
    expect(openRouterInfo.modelDisplayName).toBe('OpenRouter Swarm');
  });
});

describe('useProviderInfo', () => {
  beforeEach(() => {
    vi.mocked(checkProxyUsage).mockReset().mockReturnValue(false);
  });

  it('memoizes provider info and recomputes when dependencies change', () => {
    const initialSettings = createSettings({ apiKey: 'key', model: 'gemini-pro' });
    const serverStatus = createServerStatus();
    const { result, rerender } = renderHook(
      ({ settings }) => useProviderInfo(settings, serverStatus),
      { initialProps: { settings: initialSettings } }
    );

    const firstResult = result.current;
    rerender({ settings: initialSettings });
    expect(result.current).toBe(firstResult);

    rerender({ settings: { ...initialSettings, model: 'gemini-3-pro' } });
    expect(result.current).not.toBe(firstResult);
    expect(result.current.currentModelId).toBe('gemini-3-pro');
  });
});
