import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

vi.mock('@/components/modals/BaseModal', () => {
  const BaseModal = ({ isOpen, onClose, onEscape, onCloseDropdowns, children }: any) => (
    isOpen ? (
      <div data-testid="base-modal">
        <button type="button" onClick={onClose}>Base close</button>
        <button type="button" onClick={onEscape}>Base escape</button>
        <button type="button" onClick={onCloseDropdowns}>Base outside close dropdowns</button>
        {children}
      </div>
    ) : null
  );

  BaseModal.Header = ({ title, onClose, children }: any) => (
    <div>
      <h1>{title}</h1>
      {children}
      <button type="button" onClick={onClose}>Header close</button>
    </div>
  );
  BaseModal.Body = ({ children }: any) => <div>{children}</div>;
  BaseModal.Footer = ({ children }: any) => <div>{children}</div>;
  BaseModal.Divider = () => <hr />;

  return { BaseModal };
});

vi.mock('@/components/ui', () => ({
  PresetSelector: ({ presets, isOpen, onOpenChange, onSelect, onDeletePreset }: any) => (
    <div data-testid="preset-selector" data-open={String(!!isOpen)}>
      <button type="button" disabled={presets.length === 0} onClick={() => onOpenChange?.(!isOpen)}>
        {presets.length === 0 ? 'No Presets Available' : 'Select a Preset...'}
      </button>
      {isOpen && presets.map((preset: any) => (
        <button key={preset.id} type="button" onClick={() => { onSelect(preset); onOpenChange?.(false); }}>
          {preset.name}
        </button>
      ))}
      {isOpen && presets.filter((preset: any) => preset.isCustom).map((preset: any) => (
        <button key={`${preset.id}-delete`} type="button" title="Delete Preset" onClick={() => { onDeletePreset?.(preset); onOpenChange?.(false); }}>
          Delete {preset.name}
        </button>
      ))}
    </div>
  ),
  ModelSelector: ({ isOpen, onOpenChange, onChange, disabled, value, isDemoMode, provider }: any) => (
    <div
      data-testid="model-selector"
      data-disabled={String(!!disabled)}
      data-value={value}
      data-demo={String(!!isDemoMode)}
      data-provider={provider}
    >
      <button type="button" onClick={() => onOpenChange?.(!isOpen)}>Toggle model selector</button>
      {isOpen && <button type="button" onClick={() => onChange('selected-model')}>Choose model</button>}
    </div>
  ),
}));

import { RoleAndPromptConfigModal } from './RoleAndPromptConfigModal';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  title: 'Configure Role',
  fields: [
    {
      label: 'Role Name',
      value: 'Researcher',
      onChange: vi.fn(),
      type: 'input' as const,
      autoFocus: true,
    },
    {
      label: 'Role Instruction',
      value: 'Investigate the topic.',
      onChange: vi.fn(),
      type: 'textarea' as const,
    },
  ],
  presets: [
    { id: 'preset-default', name: 'Default Preset', instruction: 'Default instruction', isCustom: false },
    { id: 'preset-custom', name: 'Custom Preset', instruction: 'Saved instruction', isCustom: true },
  ],
  onApplyPreset: vi.fn(),
  onDeletePreset: vi.fn(),
  onSavePreset: vi.fn(),
};

const StatefulModalHarness = ({ provider = ProviderType.Gemini }: { provider?: ProviderType }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <RoleAndPromptConfigModal
        {...baseProps}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onModelChange={vi.fn()}
        provider={provider}
      />
    </>
  );
};

describe('RoleAndPromptConfigModal', () => {
  it('disables preset loading when no presets are available', () => {
    render(
      <RoleAndPromptConfigModal
        {...baseProps}
        presets={[]}
      />
    );

    expect(screen.getByRole('button', { name: /No Presets Available/i })).toBeDisabled();
  });

  it('applies and deletes presets while showing OpenRouter demo messaging', () => {
    const onApplyPreset = vi.fn();
    const onDeletePreset = vi.fn();

    render(
      <RoleAndPromptConfigModal
        {...baseProps}
        onApplyPreset={onApplyPreset}
        onDeletePreset={onDeletePreset}
        onModelChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isModelUnlocked
        isDemoMode
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Select a Preset/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Default Preset' }));

    fireEvent.click(screen.getByRole('button', { name: /Select a Preset/i }));
    fireEvent.click(screen.getByTitle('Delete Preset'));

    expect(onApplyPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'preset-default' }));
    expect(onDeletePreset).toHaveBeenCalledWith('preset-custom');
    expect(screen.getByTestId('preset-selector')).toHaveAttribute('data-open', 'false');
    expect(screen.getByText(/Demo Mode: Only free models are available/i)).toBeInTheDocument();
    expect(screen.getByTestId('model-selector')).toHaveAttribute('data-disabled', 'false');
  });

  it('trims saved preset names, cancels inline save on Escape, and resets local state after close', () => {
    const onSavePreset = vi.fn();
    const nameFieldChange = vi.fn();
    const instructionFieldChange = vi.fn();
    const { container, rerender } = render(
      <RoleAndPromptConfigModal
        {...baseProps}
        fields={[
          {
            label: 'Role Name',
            value: 'Researcher',
            onChange: nameFieldChange,
            type: 'input',
            autoFocus: true,
          },
          {
            label: 'Role Instruction',
            value: 'Investigate the topic.',
            onChange: instructionFieldChange,
            type: 'textarea',
          },
        ]}
        onSavePreset={onSavePreset}
        onModelChange={vi.fn()}
        provider={ProviderType.Gemini}
        isModelUnlocked
      />
    );

    fireEvent.change(screen.getByDisplayValue('Researcher'), { target: { value: 'Renamed Researcher' } });
    fireEvent.change(screen.getByDisplayValue('Investigate the topic.'), { target: { value: 'Updated instruction' } });

    expect(nameFieldChange).toHaveBeenCalledWith('Renamed Researcher');
    expect(instructionFieldChange).toHaveBeenCalledWith('Updated instruction');

    fireEvent.click(screen.getByRole('button', { name: 'Save as Preset' }));
    const presetInput = screen.getByPlaceholderText('Preset Name');

    fireEvent.change(presetInput, { target: { value: '  Saved Copy  ' } });
    fireEvent.keyDown(presetInput, { key: 'Enter' });

    expect(onSavePreset).toHaveBeenCalledWith('Saved Copy');
    expect(screen.queryByPlaceholderText('Preset Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save as Preset' }));
    fireEvent.change(screen.getByPlaceholderText('Preset Name'), { target: { value: 'Temporary' } });
    fireEvent.click(container.querySelector('.save-cancel-btn') as HTMLButtonElement);

    expect(screen.queryByPlaceholderText('Preset Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save as Preset' }));
    fireEvent.change(screen.getByPlaceholderText('Preset Name'), { target: { value: 'Temporary' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Preset Name'), { key: 'Escape' });

    expect(screen.queryByPlaceholderText('Preset Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Select a Preset/i }));
    expect(screen.getByTestId('preset-selector')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle model selector' }));
    expect(screen.getByRole('button', { name: 'Choose model' })).toBeInTheDocument();

    rerender(
      <RoleAndPromptConfigModal
        {...baseProps}
        isOpen={false}
        onSavePreset={onSavePreset}
        onModelChange={vi.fn()}
        provider={ProviderType.Gemini}
        isModelUnlocked
      />
    );

    rerender(
      <RoleAndPromptConfigModal
        {...baseProps}
        isOpen
        onSavePreset={onSavePreset}
        onModelChange={vi.fn()}
        provider={ProviderType.Gemini}
        isModelUnlocked
      />
    );

    expect(screen.queryByPlaceholderText('Preset Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose model' })).not.toBeInTheDocument();
    expect(screen.getByTestId('preset-selector')).toHaveAttribute('data-open', 'false');
  });

  it('closes the preset dropdown first, then the model selector, then the modal on Escape', () => {
    render(<StatefulModalHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Select a Preset/i }));
    expect(screen.getByTestId('preset-selector')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Base escape' }));

    expect(screen.getByTestId('preset-selector')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('base-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle model selector' }));
    expect(screen.getByRole('button', { name: 'Choose model' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Base escape' }));

    expect(screen.queryByRole('button', { name: 'Choose model' })).not.toBeInTheDocument();
    expect(screen.getByTestId('base-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Base escape' }));

    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument();
  });
});
