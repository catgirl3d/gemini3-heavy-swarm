import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderType, type AppSettings, type ServerStatus } from '@/types';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { SettingsModal } from './SettingsModal';

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.Gemini,
  model: 'gemini-2.5-pro',
  profiles: [
    {
      id: 'general-purpose',
      name: 'General Purpose',
      initialInstruction: 'General initial instruction',
      refinementInstruction: 'General refinement instruction',
      synthesizerInstruction: 'General synthesis instruction',
    },
    {
      id: 'research-profile',
      name: 'Research Focus',
      initialInstruction: 'Research initial instruction',
      refinementInstruction: 'Research refinement instruction',
      synthesizerInstruction: 'Research synthesis instruction',
    },
  ],
  activeProfileId: 'general-purpose',
  ...overrides,
});

const createServerStatus = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  hasServerKey: true,
  hasOpenRouterKey: true,
  proxyMode: 'private',
  isLoaded: true,
  ...overrides,
});

const createRect = (): DOMRect => ({
  x: 0,
  y: 0,
  top: 24,
  left: 24,
  bottom: 64,
  right: 224,
  width: 200,
  height: 40,
  toJSON: () => ({}),
} as DOMRect);

const renderSettingsModal = () => {
  const onClose = vi.fn();

  render(
    <SettingsModal
      isOpen
      onClose={onClose}
      settings={createSettings()}
      onSave={vi.fn()}
      onReset={vi.fn()}
      serverStatus={createServerStatus()}
    />
  );

  return { onClose };
};

const openPromptProfileDropdown = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Prompts' }));
  fireEvent.click(screen.getByRole('button', { name: 'General Purpose' }));

  expect(await screen.findByRole('button', { name: 'Research Focus' })).toBeInTheDocument();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsModal integration', () => {
  it('closes the prompt profile dropdown on in-modal outside click while keeping the modal open', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(createRect());
    const { onClose } = renderSettingsModal();

    await openPromptProfileDropdown();

    fireEvent.click(screen.getByText('System Instructions'));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Research Focus' })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the prompt profile dropdown on overlay click before closing the modal', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(createRect());
    const { onClose } = renderSettingsModal();

    await openPromptProfileDropdown();

    fireEvent.click(document.querySelector('.modal-overlay') as Element);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Research Focus' })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
