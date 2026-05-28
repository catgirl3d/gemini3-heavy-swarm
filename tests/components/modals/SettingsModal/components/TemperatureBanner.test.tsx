import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemperatureBanner } from '@/components/modals/SettingsModal/components/TemperatureBanner';

describe('TemperatureBanner', () => {
  it('renders the warning copy and enables advanced temperature when inactive', () => {
    const onToggle = vi.fn();

    render(<TemperatureBanner isActive={false} onToggle={onToggle} />);

    const toggle = screen.getByRole('button', { name: 'Enable' });

    expect(screen.getByText('Force Temperature (Advanced)')).toBeInTheDocument();
    expect(screen.getByText(/Gemini 3.0 works best with its default temperature/i)).toBeInTheDocument();
    expect(toggle).toHaveClass('advanced-temperature-toggle');
    expect(toggle).not.toHaveClass('active');

    fireEvent.click(toggle);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the active state when unsafe temperature is already enabled', () => {
    render(<TemperatureBanner isActive onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Disable' })).toHaveClass('advanced-temperature-toggle', 'active');
  });
});
