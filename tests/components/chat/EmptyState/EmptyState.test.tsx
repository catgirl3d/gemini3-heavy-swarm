import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  getProviderLogo: vi.fn((provider: string, model: string) => `${provider}/${model}.svg`),
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

import { EmptyState } from '@/components/chat/EmptyState/EmptyState';

describe('EmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderLogo.mockImplementation((provider: string, model: string) => `${provider}/${model}.svg`);
  });

  it('renders the provider logo, creator link, and forwards example prompt clicks', () => {
    const onPromptClick = vi.fn();
    render(
      <EmptyState
        onPromptClick={onPromptClick}
        modelDisplayName="Gemini 2.5 Flash"
        provider={ProviderType.Gemini}
        model="gemini-2.5-flash"
      />
    );

    expect(mocks.getProviderLogo).toHaveBeenCalledWith(ProviderType.Gemini, 'gemini-2.5-flash');
    expect(screen.getByRole('img', { name: 'Gemini 2.5 Flash Logo' })).toHaveAttribute('src', 'gemini/gemini-2.5-flash.svg');
    expect(screen.getByRole('heading', { level: 2, name: 'Gemini 2.5 Flash' })).toBeInTheDocument();
    expect(screen.getByText('How can this AI swarm assist you today?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'by Lisova' })).toHaveAttribute('href', 'https://t.me/temnobogin9');
    const promptButtons = screen.getAllByRole('button');
    const renderedPrompts = promptButtons.map((button) => button.textContent?.trim() ?? '');

    expect(promptButtons).toHaveLength(3);
    expect(renderedPrompts).not.toContain('');

    promptButtons.forEach((button) => {
      fireEvent.click(button);
    });

    renderedPrompts.forEach((prompt, index) => {
      expect(onPromptClick).toHaveBeenNthCalledWith(index + 1, prompt);
    });
  });
});
