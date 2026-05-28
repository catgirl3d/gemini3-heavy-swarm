import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { OpenRouterModel } from '@/services/openrouter/modelsService';
import { RECOMMENDED_MODEL_IDS } from '@/services/openrouter/constants';
import { ProviderType } from '@/types';

const mocks = vi.hoisted(() => ({
  fetchOpenRouterModels: vi.fn(),
  getCachedModels: vi.fn(),
  setCachedModels: vi.fn(),
  getProviderLogo: vi.fn(() => 'logo.svg'),
}));

vi.mock('@/services/openrouter/modelsService', () => ({
  fetchOpenRouterModels: mocks.fetchOpenRouterModels,
}));

vi.mock('@/services/openrouter/modelsCache', () => ({
  getCachedModels: mocks.getCachedModels,
  setCachedModels: mocks.setCachedModels,
}));

vi.mock('@/utils/logoHelpers', () => ({
  getProviderLogo: mocks.getProviderLogo,
}));

vi.mock('@/assets/thinking.png', () => ({
  default: 'thinking.png',
}));

vi.mock('@/components/ui/CustomSelect', () => ({
  CustomSelect: ({
    options,
    value,
    onChange,
    disabled,
    isOpen,
    onOpenChange,
    searchable,
    searchPlaceholder,
    onSearchChange,
    renderTrigger,
    renderOption,
    dropdownHeader,
    dropdownFooter,
  }: any) => {
    const selected = options.find((option: any) => option.value === value) || null;

    return (
      <div data-testid="custom-select">
        <button
          type="button"
          data-testid="select-trigger"
          disabled={disabled}
          onClick={() => onOpenChange?.(!isOpen)}
        >
          {renderTrigger?.(selected, !!isOpen) as ReactNode}
        </button>
        {searchable && (
          <input
            aria-label="model-search"
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        )}
        <div data-testid="dropdown-header">{dropdownHeader}</div>
        <div data-testid="model-options">
          {options.map((option: any) => option.isHeader ? (
            <div data-testid="model-option-header" key={option.value}>{option.label}</div>
          ) : (
            <button
              type="button"
              data-testid="model-option"
              data-value={option.value || 'empty'}
              key={option.value || 'empty'}
              onClick={() => onChange(option.value)}
            >
              {renderOption?.(option, option.value === value) as ReactNode}
            </button>
          ))}
        </div>
        <div data-testid="dropdown-footer">{dropdownFooter}</div>
      </div>
    );
  },
}));

import { ModelSelector } from '@/components/ui/ModelSelector/ModelSelector';

const createOpenRouterModel = (overrides: Partial<OpenRouterModel>): OpenRouterModel => {
  const { pricing, architecture, top_provider, ...rest } = overrides;

  return {
    id: 'provider/model',
    name: 'Provider Model',
    description: 'Model description',
    pricing: {
      prompt: '0',
      completion: '0',
      request: '0',
      image: '0',
      ...pricing,
    },
    context_length: 128000,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Other',
      instruct_type: null,
      ...architecture,
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
      ...top_provider,
    },
    ...rest,
  };
};

const getOptionLabels = () => screen.getAllByTestId('model-option').map(option => {
  const label = within(option).queryByText((content, element) =>
    element?.className === 'model-option-label' && content.length > 0
  );
  return label?.textContent?.trim() || option.textContent?.trim();
});

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedModels.mockReturnValue(null);
    mocks.fetchOpenRouterModels.mockResolvedValue([]);
    mocks.getProviderLogo.mockReturnValue('logo.svg');
  });

  it('renders static Gemini models without fetching OpenRouter data', async () => {
    const onChange = vi.fn();

    render(
      <ModelSelector
        value=""
        onChange={onChange}
        provider={ProviderType.Gemini}
        showEmptyOption
        emptyLabel="Use default"
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Gemini 2.5 Flash-Lite')).toBeInTheDocument();
    });

    expect(mocks.fetchOpenRouterModels).not.toHaveBeenCalled();
    expect(screen.queryByText('Sort by:')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('model-option')[0].getAttribute('data-value')).toBe('empty');

    fireEvent.click(screen.getAllByTestId('model-option')[0]);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('normalizes fetched OpenRouter models and renders loading, recommended, prices, and reasoning state', async () => {
    let resolveModels: (models: OpenRouterModel[]) => void;
    mocks.fetchOpenRouterModels.mockReturnValue(new Promise<OpenRouterModel[]>(resolve => {
      resolveModels = resolve;
    }));

    render(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Loading models...')).toBeInTheDocument();
    });

    await act(async () => {
        resolveModels!([
          createOpenRouterModel({
            id: RECOMMENDED_MODEL_IDS[0],
            name: 'Recommended Model',
            pricing: { completion: '0.000015' } as OpenRouterModel['pricing'],
            supported_parameters: ['reasoning'],
          }),
        createOpenRouterModel({
          id: 'z/free-model',
          name: 'Regular Free',
          pricing: { completion: '0' } as OpenRouterModel['pricing'],
        }),
        createOpenRouterModel({
          id: 'z/paid-model',
          name: 'Regular Paid',
          pricing: { completion: '0.000002' } as OpenRouterModel['pricing'],
        }),
        createOpenRouterModel({
          id: 'google/gemma-3',
          name: 'Gemma Filtered',
          pricing: { completion: '0' } as OpenRouterModel['pricing'],
        }),
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText('Recommended Model')).toBeInTheDocument();
    });

    expect(mocks.setCachedModels).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        value: RECOMMENDED_MODEL_IDS[0],
        label: 'Recommended Model',
        price: 0.000015,
        priceText: '$15.00/M',
        supportsReasoning: true,
      }),
      expect.objectContaining({
        value: 'z/free-model',
        price: 0,
        priceText: 'Free',
        supportsReasoning: false,
      }),
    ]));
    expect(screen.queryByText('Loading models...')).not.toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('All Models')).toBeInTheDocument();
    expect(screen.getByText('$15.00/M')).toBeInTheDocument();
    expect(screen.getByAltText('thinking')).toBeInTheDocument();
    expect(screen.queryByText('Gemma Filtered')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('model-search'), { target: { value: 'free' } });

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.queryByText('All Models')).not.toBeInTheDocument();
    expect(screen.getByText('Regular Free')).toBeInTheDocument();
    expect(screen.queryByText('Recommended Model')).not.toBeInTheDocument();
  });

  it('renders cached OpenRouter models immediately while refreshing in the background', async () => {
    mocks.getCachedModels.mockReturnValue([
      { value: 'cached/model', label: 'Cached Model', priceText: 'Free' },
    ]);
    mocks.fetchOpenRouterModels.mockReturnValue(new Promise(() => undefined));

    render(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isOpen
      />
    );

    expect(screen.getByText('Cached Model')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Loading models...')).toBeInTheDocument();
    });
    expect(mocks.fetchOpenRouterModels).toHaveBeenCalledTimes(1);
  });

  it('switches from OpenRouter loading to Gemini without letting the stale request overwrite static models', async () => {
    let resolveModels: (models: OpenRouterModel[]) => void;
    mocks.fetchOpenRouterModels.mockReturnValue(new Promise<OpenRouterModel[]>(resolve => {
      resolveModels = resolve;
    }));

    const { rerender } = render(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Loading models...')).toBeInTheDocument();
    });

    rerender(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.Gemini}
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Gemini 2.5 Flash-Lite')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading models...')).not.toBeInTheDocument();

    await act(async () => {
      resolveModels!([
        createOpenRouterModel({ id: 'late/openrouter-model', name: 'Late OpenRouter Model' }),
      ]);
    });

    expect(screen.queryByText('Late OpenRouter Model')).not.toBeInTheDocument();
    expect(screen.getByText('Gemini 2.5 Flash-Lite')).toBeInTheDocument();
    expect(mocks.setCachedModels).not.toHaveBeenCalled();
  });

  it('keeps cached OpenRouter models visible when the background refresh fails', async () => {
    mocks.getCachedModels.mockReturnValue([
      { value: 'cached/model', label: 'Cached Model', priceText: 'Free' },
    ]);
    mocks.fetchOpenRouterModels.mockRejectedValueOnce(new Error('network down'));

    render(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isOpen
      />
    );

    expect(screen.getByText('Cached Model')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Failed to load models from OpenRouter')).toBeInTheDocument();
    });
    expect(screen.getByText('Cached Model')).toBeInTheDocument();
  });

  it('shows an OpenRouter load error and retries successfully', async () => {
    mocks.fetchOpenRouterModels
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([
        createOpenRouterModel({ id: 'recovered/model', name: 'Recovered Model' }),
      ]);

    render(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load models from OpenRouter')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(mocks.fetchOpenRouterModels).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Recovered Model')).toBeInTheDocument();
    });
    expect(screen.queryByText('Failed to load models from OpenRouter')).not.toBeInTheDocument();
  });

  it('filters paid models in demo mode and sorts OpenRouter options by price', async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([
      createOpenRouterModel({
        id: 'alpha/paid',
        name: 'Alpha Paid',
        pricing: { completion: '0.000003' } as OpenRouterModel['pricing'],
      }),
      createOpenRouterModel({
        id: 'beta/free',
        name: 'Beta Free',
        pricing: { completion: '0' } as OpenRouterModel['pricing'],
      }),
    ]);

    const { rerender } = render(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isDemoMode
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Beta Free')).toBeInTheDocument();
    });

    expect(screen.queryByText('Alpha Paid')).not.toBeInTheDocument();

    rerender(
      <ModelSelector
        value=""
        onChange={vi.fn()}
        provider={ProviderType.OpenRouter}
        isOpen
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Paid')).toBeInTheDocument();
    });

    expect(getOptionLabels()).toEqual(['Alpha Paid', 'Beta Free']);

    fireEvent.click(screen.getByTitle('Price: Low to High'));
    expect(getOptionLabels()).toEqual(['Beta Free', 'Alpha Paid']);

    fireEvent.click(screen.getByTitle('Price: High to Low'));
    expect(getOptionLabels()).toEqual(['Alpha Paid', 'Beta Free']);
  });
});
