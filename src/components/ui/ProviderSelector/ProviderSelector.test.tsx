import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  getProviderLogo: vi.fn((provider: string) => `${provider}-logo.svg`),
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

vi.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({
    options,
    value,
    onChange,
    disabled,
    isOpen,
    onOpenChange,
    renderTrigger,
    renderOption,
  }: any) => {
    const selected = options.find((option: any) => option.value === value) ?? null;

    return (
      <div data-testid="custom-select" data-disabled={String(!!disabled)} data-open={String(!!isOpen)}>
        <div data-testid="provider-trigger">{renderTrigger?.(selected)}</div>
        <div data-testid="provider-options">
          {options.map((option: any) => (
            <div data-testid={`provider-option-${option.value}`} key={option.value}>
              {renderOption?.(option)}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => onChange(options[1].value)}>
          Select next provider
        </button>
        <button type="button" onClick={() => onOpenChange?.(!isOpen)}>
          Toggle provider dropdown
        </button>
      </div>
    );
  },
}));

import { ProviderSelector } from './ProviderSelector';

describe('ProviderSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderLogo.mockImplementation((provider: string) => `${provider}-logo.svg`);
  });

  it('renders provider logos, passes state through, and forwards selection changes', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();

    const { container } = render(
      <ProviderSelector
        value={ProviderType.Gemini}
        onChange={onChange}
        disabled
        isOpen={false}
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.getByTestId('custom-select')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('provider-trigger')).toHaveTextContent('Google Gemini');
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(mocks.getProviderLogo).toHaveBeenCalledWith(ProviderType.Gemini);
    expect(mocks.getProviderLogo).toHaveBeenCalledWith(ProviderType.OpenRouter);

    fireEvent.click(screen.getByRole('button', { name: 'Select next provider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle provider dropdown' }));

    expect(onChange).toHaveBeenCalledWith(ProviderType.OpenRouter);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('falls back to the placeholder trigger when the current value is unknown', () => {
    render(
      <ProviderSelector
        value={'missing-provider' as ProviderType}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('provider-trigger')).toHaveTextContent('Select Provider');
  });
});
