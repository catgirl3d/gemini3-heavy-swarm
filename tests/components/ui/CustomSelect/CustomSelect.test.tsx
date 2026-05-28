import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/PortalDropdown/PortalDropdown', () => ({
  PortalDropdown: ({ isOpen, children, width }: any) => (isOpen ? <div data-testid="portal-dropdown" data-width={width ? String(width) : ''}>{children}</div> : null),
}));

import { CustomSelect } from '@/components/ui/CustomSelect/CustomSelect';

const baseOptions = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta-42', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe('CustomSelect', () => {
  it('renders the selected label and closes after uncontrolled selection', () => {
    const onChange = vi.fn();

    render(
      <CustomSelect
        options={baseOptions}
        value="alpha"
        onChange={onChange}
      />
    );

    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));

    expect(screen.getByTestId('portal-dropdown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));

    expect(onChange).toHaveBeenCalledWith('beta-42');
    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();
  });

  it('shows the placeholder for an unknown value and stays closed while disabled', () => {
    render(
      <CustomSelect
        options={baseOptions}
        value="missing"
        onChange={vi.fn()}
        placeholder="Pick a model"
        disabled
      />
    );

    const trigger = screen.getByRole('button', { name: /pick a model/i });

    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);

    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();
  });

  it('filters searchable options by default, supports Enter selection, Escape close, and no-result text', () => {
    const onChange = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <CustomSelect
        options={baseOptions}
        value="alpha"
        onChange={onChange}
        searchable
        searchPlaceholder="Search models"
        onSearchChange={onSearchChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));

    const searchInput = screen.getByPlaceholderText('Search models');

    fireEvent.change(searchInput, { target: { value: '42' } });

    expect(onSearchChange).toHaveBeenCalledWith('42');
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gamma' })).not.toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('beta-42');
    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    const reopenedSearchInput = screen.getByPlaceholderText('Search models');

    fireEvent.change(reopenedSearchInput, { target: { value: 'zzz' } });
    expect(screen.getByText('No results found')).toBeInTheDocument();

    fireEvent.keyDown(reopenedSearchInput, { key: 'Escape' });
    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();
  });

  it('shows the empty-options message and renders a non-searchable dropdown header', () => {
    render(
      <CustomSelect
        options={[]}
        value=""
        onChange={vi.fn()}
        placeholder="Open empty"
        dropdownHeader={<div>Static Header</div>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open empty/i }));

    expect(screen.getByText('Static Header')).toBeInTheDocument();
    expect(screen.getByText('No options available')).toBeInTheDocument();
  });

  it('supports controlled open state, custom renderers, custom filtering, slots, and header rows', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <CustomSelect
        options={[
          { value: 'featured', label: 'Featured', isHeader: true },
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
        ]}
        value="alpha"
        onChange={onChange}
        searchable
        isOpen
        onOpenChange={onOpenChange}
        onSearchChange={onSearchChange}
        className="custom-container"
        dropdownClassName="custom-dropdown"
        searchWrapperClassName="custom-search-wrapper"
        dropdownHeader={<div>Search Header</div>}
        dropdownFooter={<div>Search Footer</div>}
        filterFn={(option, term) => option.label.toLowerCase().startsWith(term.toLowerCase())}
        renderTrigger={(selected, open) => (
          <span>{`${selected?.label ?? 'none'} trigger ${open ? 'open' : 'closed'}`}</span>
        )}
        renderOption={(option, isSelected) => (
          <span>{`${option.label} ${isSelected ? 'selected' : 'available'}`}</span>
        )}
      />
    );

    expect(screen.getByText('Alpha trigger open')).toBeInTheDocument();
    expect(screen.getByText('Search Header')).toBeInTheDocument();
    expect(screen.getByText('Search Footer')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Featured' })).not.toBeInTheDocument();
    expect(screen.getByText('Alpha selected')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'b' } });

    expect(onSearchChange).toHaveBeenCalledWith('b');
    expect(screen.getByText('Beta available')).toBeInTheDocument();
    expect(screen.queryByText('Alpha selected')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /alpha trigger open/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Beta available' }));

    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);
    expect(onChange).toHaveBeenCalledWith('beta');
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByTestId('portal-dropdown').firstChild).toHaveClass('custom-select-dropdown', 'custom-dropdown');
    expect(screen.getByPlaceholderText('Search...').parentElement).toHaveClass('custom-select-search-wrapper', 'custom-search-wrapper');
    expect(screen.getByRole('button', { name: /alpha trigger open/i }).parentElement).toHaveClass('custom-select-container', 'custom-container');
  });

  it('supports custom trigger classes, portal width, and trailing option actions', () => {
    const onArchive = vi.fn();

    render(
      <CustomSelect
        options={baseOptions}
        value="alpha"
        onChange={vi.fn()}
        triggerClassName="compact-trigger"
        dropdownWidth={320}
        renderOptionTrailing={(option, { closeDropdown }) => (
          option.value === 'beta-42' ? (
            <button
              type="button"
              onClick={() => {
                onArchive(option.value);
                closeDropdown();
              }}
            >
              Archive
            </button>
          ) : null
        )}
      />
    );

    const trigger = screen.getByRole('button', { name: /alpha/i });

    expect(trigger).toHaveClass('compact-trigger');

    fireEvent.click(trigger);

    expect(screen.getByTestId('portal-dropdown')).toHaveAttribute('data-width', '320');

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onArchive).toHaveBeenCalledWith('beta-42');
    expect(screen.queryByTestId('portal-dropdown')).not.toBeInTheDocument();
  });
});
