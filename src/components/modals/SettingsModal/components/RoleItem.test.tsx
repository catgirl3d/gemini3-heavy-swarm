import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  formatModelTag: vi.fn((model: string) => `Model ${model}`),
  getProviderLogo: vi.fn((provider: string, model: string) => `${provider}/${model}.svg`),
}));

vi.mock('@/utils/common/modelUtils', () => ({
  formatModelTag: mocks.formatModelTag,
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

import { RoleItem } from './RoleItem';

describe('RoleItem', () => {
  it('renders fallback names and disables movement at the edges', () => {
    render(
      <RoleItem
        index={0}
        role={{ name: '', instruction: 'No name yet' }}
        provider={ProviderType.Gemini}
        isFirst
        isLast
        canDelete={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
      />
    );

    expect(screen.getByText('Unnamed Role')).toBeInTheDocument();
    expect(screen.getByTitle('Move Up')).toBeDisabled();
    expect(screen.getByTitle('Move Down')).toBeDisabled();
    expect(screen.queryByTitle('Delete Role')).not.toBeInTheDocument();
  });

  it('renders model tags and wires edit, delete, and movement callbacks', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();

    const { container } = render(
      <RoleItem
        index={2}
        role={{ name: 'Researcher', instruction: 'Investigate', model: 'gemini-2.5-pro' }}
        provider={ProviderType.Gemini}
        isFirst={false}
        isLast={false}
        canDelete
        onEdit={onEdit}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );

    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(screen.getByText('Model gemini-2.5-pro')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'gemini/gemini-2.5-pro.svg');

    fireEvent.click(screen.getByTitle('Move Up'));
    fireEvent.click(screen.getByTitle('Move Down'));
    fireEvent.click(screen.getByTitle('Configure Role'));
    fireEvent.click(screen.getByTitle('Delete Role'));

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
