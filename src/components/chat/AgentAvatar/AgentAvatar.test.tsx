import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  getProviderLogo: vi.fn((provider: string, model?: string) => `${provider}/${model ?? 'default'}.svg`),
}));

vi.mock('@/assets/Google-gemini-icon.webp', () => ({
  default: 'gemini-icon.webp',
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

import { AgentAvatar } from './AgentAvatar';

describe('AgentAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderLogo.mockImplementation((provider: string, model?: string) => `${provider}/${model ?? 'default'}.svg`);
  });

  it('renders the user avatar without requesting a provider logo', () => {
    const { container } = render(
      <AgentAvatar
        type="user"
        provider={ProviderType.Gemini}
        model="gemini-2.5-flash"
      />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'AI Logo' })).not.toBeInTheDocument();
    expect(mocks.getProviderLogo).not.toHaveBeenCalled();
  });

  it('renders the model avatar from the selected provider and model', () => {
    render(
      <AgentAvatar
        type="model"
        provider={ProviderType.OpenRouter}
        model="anthropic/claude-sonnet"
      />
    );

    expect(mocks.getProviderLogo).toHaveBeenCalledWith(ProviderType.OpenRouter, 'anthropic/claude-sonnet');
    expect(screen.getByRole('img', { name: 'AI Logo' })).toHaveAttribute('src', 'openrouter/anthropic/claude-sonnet.svg');
  });

  it('falls back to the default gemini icon when no provider is available', () => {
    render(<AgentAvatar type="model" />);

    expect(screen.getByRole('img', { name: 'AI Logo' })).toHaveAttribute('src', 'gemini-icon.webp');
    expect(mocks.getProviderLogo).not.toHaveBeenCalled();
  });
});
