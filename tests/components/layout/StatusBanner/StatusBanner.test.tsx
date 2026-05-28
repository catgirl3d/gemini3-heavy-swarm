import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StatusBanner } from '@/components/layout/StatusBanner/StatusBanner';

type StatusBannerProps = ComponentProps<typeof StatusBanner>;

const createProviderInfo = (
  overrides: Partial<StatusBannerProps['providerInfo']> = {}
): StatusBannerProps['providerInfo'] => ({
  isGemini: true,
  isOpenRouter: false,
  currentModelId: 'gemini-2.5-flash',
  isUsingProxy: false,
  isUnlocked: false,
  isDemoMode: false,
  modelDisplayName: 'Gemini 2.5 Flash Swarm',
  canSend: vi.fn(() => false),
  ...overrides,
});

const createProps = (overrides: Partial<StatusBannerProps> = {}): StatusBannerProps => ({
  serverStatus: {
    hasServerKey: false,
    hasOpenRouterKey: false,
    proxyMode: 'server',
    isLoaded: false,
  },
  providerInfo: createProviderInfo(),
  shouldShowLoadingBanner: false,
  isBannerDismissed: false,
  onDismiss: vi.fn(),
  ...overrides,
});

describe('StatusBanner', () => {
  it('renders nothing when the banner has already been dismissed', () => {
    render(
      <StatusBanner
        {...createProps({
          isBannerDismissed: true,
          shouldShowLoadingBanner: true,
          serverStatus: {
            hasServerKey: false,
            hasOpenRouterKey: false,
            proxyMode: 'server',
            isLoaded: true,
          },
          providerInfo: createProviderInfo({
            isUsingProxy: true,
            isUnlocked: false,
            isDemoMode: false,
            isOpenRouter: false,
          }),
        })}
      />
    );

    expect(screen.queryByText('Checking server status...')).not.toBeInTheDocument();
    expect(screen.queryByText(/No API Key found/i)).not.toBeInTheDocument();
  });

  it('shows the loading banner alongside the missing-key warning and wires dismiss', () => {
    const onDismiss = vi.fn();

    render(
      <StatusBanner
        {...createProps({
          shouldShowLoadingBanner: true,
          onDismiss,
          serverStatus: {
            hasServerKey: false,
            hasOpenRouterKey: false,
            proxyMode: 'server',
            isLoaded: true,
          },
          providerInfo: createProviderInfo({
            isUsingProxy: true,
            isUnlocked: false,
            isDemoMode: false,
            isOpenRouter: false,
          }),
        })}
      />
    );

    expect(screen.getByText('Checking server status...')).toBeInTheDocument();
    expect(screen.getByText(/No API Key found/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss banner' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the demo-mode banner only for unlocked demo access', () => {
    render(
      <StatusBanner
        {...createProps({
          serverStatus: {
            hasServerKey: true,
            hasOpenRouterKey: false,
            proxyMode: 'server',
            isLoaded: true,
          },
          providerInfo: createProviderInfo({
            isUsingProxy: true,
            isUnlocked: true,
            isDemoMode: true,
            isOpenRouter: false,
          }),
        })}
      />
    );

    expect(screen.getByText(/Demo mode\. Limited models available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Private Server Mode/i)).not.toBeInTheDocument();
  });

  it('switches success messaging between proxy-backed and private-key modes', () => {
    const { rerender } = render(
      <StatusBanner
        {...createProps({
          serverStatus: {
            hasServerKey: true,
            hasOpenRouterKey: true,
            proxyMode: 'server',
            isLoaded: true,
          },
          providerInfo: createProviderInfo({
            isGemini: false,
            isUsingProxy: true,
            isUnlocked: true,
            isDemoMode: false,
            isOpenRouter: true,
            currentModelId: 'openrouter/model',
            modelDisplayName: 'OpenRouter Swarm',
          }),
        })}
      />
    );

    expect(screen.getByText(/server's OpenRouter API key/i)).toBeInTheDocument();

    rerender(
      <StatusBanner
        {...createProps({
          serverStatus: {
            hasServerKey: true,
            hasOpenRouterKey: false,
            proxyMode: 'server',
            isLoaded: true,
          },
          providerInfo: createProviderInfo({
            isUsingProxy: true,
            isUnlocked: true,
            isDemoMode: false,
            isOpenRouter: false,
          }),
        })}
      />
    );

    expect(screen.getByText(/server's Gemini API key/i)).toBeInTheDocument();

    rerender(
      <StatusBanner
        {...createProps({
          serverStatus: {
            hasServerKey: false,
            hasOpenRouterKey: false,
            proxyMode: 'direct',
            isLoaded: true,
          },
          providerInfo: createProviderInfo({
            isUsingProxy: false,
            isUnlocked: true,
            isDemoMode: false,
            isOpenRouter: false,
          }),
        })}
      />
    );

    expect(screen.getByText('Private API Key Active. All models are unlocked.')).toBeInTheDocument();
  });
});
