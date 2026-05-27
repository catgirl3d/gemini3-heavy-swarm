import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  getProviderLogo: vi.fn((provider: string, model?: string) => `${provider}-${model ?? 'default'}.svg`),
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

import { Header } from './Header';

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderLogo.mockImplementation((provider: string, model?: string) => `${provider}-${model ?? 'default'}.svg`);
  });

  it('renders the provider logo and forwards info and settings actions', () => {
    const onInfoClick = vi.fn();
    const onSettingsClick = vi.fn();

    render(
      <Header
        modelDisplayName="Gemini 2.5 Flash"
        provider={ProviderType.Gemini}
        model="gemini-2.5-flash"
        onInfoClick={onInfoClick}
        onSettingsClick={onSettingsClick}
      />
    );

    const logo = screen.getByRole('img', { name: 'Gemini 2.5 Flash Logo' });

    expect(mocks.getProviderLogo).toHaveBeenCalledWith(ProviderType.Gemini, 'gemini-2.5-flash');
    expect(logo).toHaveAttribute('src', 'gemini-gemini-2.5-flash.svg');
    expect(screen.getByRole('heading', { level: 1, name: 'Gemini 2.5 Flash' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'How it Works' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swarm Settings' }));

    expect(onInfoClick).toHaveBeenCalledTimes(1);
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  it('reloads the page from the home button', () => {
    const reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);

    render(
      <Header
        modelDisplayName="Gemini 2.5 Flash"
        provider={ProviderType.Gemini}
        model="gemini-2.5-flash"
        onInfoClick={vi.fn()}
        onSettingsClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
