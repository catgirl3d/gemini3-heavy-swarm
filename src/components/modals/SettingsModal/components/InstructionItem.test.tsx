import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  formatModelTag: vi.fn((model: string) => `Formatted ${model}`),
  getProviderLogo: vi.fn((provider: string, model: string) => `${provider}/${model}.svg`),
}));

vi.mock('@/utils/common/modelUtils', () => ({
  formatModelTag: mocks.formatModelTag,
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

import { InstructionItem } from './InstructionItem';

describe('InstructionItem', () => {
  it('renders the model tag and edit action when a model override exists', () => {
    const onEdit = vi.fn();

    const { container } = render(
      <InstructionItem
        index={1}
        label="Synthesizer Instruction"
        help="Instructions for the final agent."
        model="anthropic/claude-sonnet"
        provider={ProviderType.OpenRouter}
        onEdit={onEdit}
      />
    );

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Synthesizer Instruction')).toBeInTheDocument();
    expect(screen.getByText('Instructions for the final agent.')).toBeInTheDocument();
    expect(screen.getByText('Formatted anthropic/claude-sonnet')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'openrouter/anthropic/claude-sonnet.svg');

    fireEvent.click(screen.getByTitle('Configure Instruction'));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(mocks.getProviderLogo).toHaveBeenCalledWith(ProviderType.OpenRouter, 'anthropic/claude-sonnet');
  });

  it('omits the model tag when no override is present', () => {
    render(
      <InstructionItem
        index={0}
        label="Initial Instruction"
        help="Draft the first response."
        provider={ProviderType.Gemini}
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByText(/Formatted/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
  });
});
