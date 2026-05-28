import type { ChangeEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMPT_TYPES, ProviderType, type AppSettings, type PromptProfile } from '@/types';
import { createMockSettings } from '@test/settingsMocks';

interface MockProfileHeaderProps {
  label: string;
  profiles: { id: string; name: string }[];
  activeId: string;
  isEditing: boolean;
  activeName: string;
  onProfileChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRename: (newName: string) => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onCreate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  isSelectorOpen?: boolean;
  onSelectorOpenChange?: (open: boolean) => void;
}

interface MockInstructionItemProps {
  index: number;
  label: string;
  help: string;
  model?: string;
  provider: ProviderType;
  onEdit: () => void;
}

const mocks = vi.hoisted(() => ({
  profileHeader: vi.fn<(props: MockProfileHeaderProps) => void>(),
  instructionItem: vi.fn<(props: MockInstructionItemProps) => void>(),
}));

vi.mock('@/components/modals/SettingsModal/components/ProfileHeader', () => ({
  ProfileHeader: (props: MockProfileHeaderProps) => {
    mocks.profileHeader(props);

    return (
      <div
        data-testid="profile-header"
        data-open={String(!!props.isSelectorOpen)}
        data-can-delete={String(props.canDelete)}
      >
        <div>{`${props.label}|${props.activeName}|${props.activeId}`}</div>
        <button
          type="button"
          onClick={() => props.onProfileChange({
            target: { value: 'profile-2' },
            currentTarget: { value: 'profile-2' },
          } as ChangeEvent<HTMLSelectElement>)}
        >
          Change Profile
        </button>
        <button type="button" onClick={() => props.onRename('Renamed Profile')}>Rename Profile</button>
        <button type="button" onClick={props.onStartEditing}>Start Editing</button>
        <button type="button" onClick={props.onStopEditing}>Stop Editing</button>
        <button type="button" onClick={props.onCreate}>Create Profile</button>
        <button type="button" onClick={props.onDelete}>Delete Profile</button>
        <button type="button" onClick={() => props.onSelectorOpenChange?.(!props.isSelectorOpen)}>Toggle Selector</button>
      </div>
    );
  },
}));

vi.mock('@/components/modals/SettingsModal/components/InstructionItem', () => ({
  InstructionItem: (props: MockInstructionItemProps) => {
    mocks.instructionItem(props);

    return (
      <button type="button" data-testid={`instruction-${props.index}`} onClick={props.onEdit}>
        {`${props.label}|${props.help}|${props.model ?? 'none'}|${props.provider}`}
      </button>
    );
  },
}));

import { PromptsTab } from '@/components/modals/SettingsModal/tabs/PromptsTab';

const createProfile = (id: string, name: string): PromptProfile => ({
  id,
  name,
  initialInstruction: `${name} initial`,
  refinementInstruction: `${name} refinement`,
  synthesizerInstruction: `${name} synthesis`,
});

const createSettings = (overrides: Partial<AppSettings> = {}): AppSettings => createMockSettings({
  provider: ProviderType.OpenRouter,
  activeProfileId: 'profile-1',
  profiles: [
    createProfile('profile-1', 'Default Profile'),
    createProfile('profile-2', 'Research Profile'),
  ],
  initialModel: 'initial-model',
  refinementModel: 'refinement-model',
  synthesisModel: 'synthesis-model',
  ...overrides,
});

describe('PromptsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires profile management props and controlled selector state through ProfileHeader', () => {
    const setIsEditingProfileName = vi.fn();
    const handleRenameProfile = vi.fn();
    const handleProfileChange = vi.fn();
    const handleCreateProfile = vi.fn();
    const handleDeleteProfile = vi.fn();
    const setEditingInstruction = vi.fn();
    const setOpenDropdownId = vi.fn();
    const localSettings = createSettings();
    const activeProfile = localSettings.profiles[0];

    const { rerender } = render(
      <PromptsTab
        localSettings={localSettings}
        activeProfile={activeProfile}
        isEditingProfileName={false}
        setIsEditingProfileName={setIsEditingProfileName}
        handleRenameProfile={handleRenameProfile}
        handleProfileChange={handleProfileChange}
        handleCreateProfile={handleCreateProfile}
        handleDeleteProfile={handleDeleteProfile}
        setEditingInstruction={setEditingInstruction}
        openDropdownId={null}
        setOpenDropdownId={setOpenDropdownId}
      />
    );

    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-delete', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Selector' }));

    expect(setOpenDropdownId).toHaveBeenNthCalledWith(1, 'prompt-profile');

    rerender(
      <PromptsTab
        localSettings={localSettings}
        activeProfile={activeProfile}
        isEditingProfileName={false}
        setIsEditingProfileName={setIsEditingProfileName}
        handleRenameProfile={handleRenameProfile}
        handleProfileChange={handleProfileChange}
        handleCreateProfile={handleCreateProfile}
        handleDeleteProfile={handleDeleteProfile}
        setEditingInstruction={setEditingInstruction}
        openDropdownId="prompt-profile"
        setOpenDropdownId={setOpenDropdownId}
      />
    );

    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Change Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop Editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Selector' }));

    expect(handleProfileChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: 'profile-2' }),
        currentTarget: expect.objectContaining({ value: 'profile-2' }),
      })
    );
    expect(handleRenameProfile).toHaveBeenCalledWith('Renamed Profile');
    expect(setIsEditingProfileName).toHaveBeenNthCalledWith(1, true);
    expect(setIsEditingProfileName).toHaveBeenNthCalledWith(2, false);
    expect(handleCreateProfile).toHaveBeenCalledTimes(1);
    expect(handleDeleteProfile).toHaveBeenCalledTimes(1);
    expect(setOpenDropdownId).toHaveBeenNthCalledWith(2, null);
    expect(setEditingInstruction).not.toHaveBeenCalled();
  });

  it('maps the three instruction cards and disables deletion for the final remaining profile', () => {
    const setEditingInstruction = vi.fn();
    const localSettings = createSettings({
      profiles: [createProfile('profile-1', 'Solo Profile')],
    });

    render(
      <PromptsTab
        localSettings={localSettings}
        activeProfile={localSettings.profiles[0]}
        isEditingProfileName={true}
        setIsEditingProfileName={vi.fn()}
        handleRenameProfile={vi.fn()}
        handleProfileChange={vi.fn()}
        handleCreateProfile={vi.fn()}
        handleDeleteProfile={vi.fn()}
        setEditingInstruction={setEditingInstruction}
        openDropdownId={null}
        setOpenDropdownId={vi.fn()}
      />
    );

    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('profile-header')).toHaveAttribute('data-can-delete', 'false');
    expect(mocks.instructionItem).toHaveBeenCalledTimes(3);

    const instructionProps = mocks.instructionItem.mock.calls.map(([props]) => props);

    expect(instructionProps).toEqual([
      expect.objectContaining({
        index: 0,
        label: 'Initial Agent Instruction',
        help: 'Instructions for the agents drafting the first response.',
        model: 'initial-model',
        provider: ProviderType.OpenRouter,
      }),
      expect.objectContaining({
        index: 1,
        label: 'Refinement Instruction',
        help: 'Instructions for agents critiquing the initial drafts.',
        model: 'refinement-model',
        provider: ProviderType.OpenRouter,
      }),
      expect.objectContaining({
        index: 2,
        label: 'Synthesizer Instruction',
        help: 'Instructions for the final agent merging all refined responses.',
        model: 'synthesis-model',
        provider: ProviderType.OpenRouter,
      }),
    ]);

    fireEvent.click(screen.getByTestId('instruction-0'));
    fireEvent.click(screen.getByTestId('instruction-1'));
    fireEvent.click(screen.getByTestId('instruction-2'));

    expect(setEditingInstruction).toHaveBeenNthCalledWith(1, PROMPT_TYPES.INITIAL);
    expect(setEditingInstruction).toHaveBeenNthCalledWith(2, PROMPT_TYPES.REFINEMENT);
    expect(setEditingInstruction).toHaveBeenNthCalledWith(3, PROMPT_TYPES.SYNTHESIS);
  });
});
