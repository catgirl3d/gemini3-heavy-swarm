import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalDropdown } from './PortalDropdown';

interface MutableRect {
  x: number;
  y: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  toJSON: () => object;
}

const createRect = (overrides: Partial<MutableRect> = {}): MutableRect => ({
  x: 0,
  y: 0,
  top: 16,
  left: 24,
  bottom: 56,
  right: 124,
  width: 100,
  height: 40,
  toJSON: () => ({}),
  ...overrides,
});

const DropdownHarness = ({
  isOpen,
  className,
  width,
}: {
  isOpen: boolean;
  className?: string;
  width?: number;
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button ref={triggerRef} type="button">Trigger</button>
      <PortalDropdown isOpen={isOpen} triggerRef={triggerRef} className={className} width={width}>
        <div>Dropdown content</div>
      </PortalDropdown>
    </>
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PortalDropdown', () => {
  it('renders nothing while closed', () => {
    render(<DropdownHarness isOpen={false} />);

    expect(screen.queryByText('Dropdown content')).not.toBeInTheDocument();
    expect(document.body.querySelector('.modal-dropdown-portal')).not.toBeInTheDocument();
  });

  it('renders into document.body using the trigger coordinates by default', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      createRect({ bottom: 72, left: 32, width: 180 }) as unknown as DOMRect
    );

    render(<DropdownHarness isOpen className="custom-dropdown" />);

    const portal = document.body.querySelector('.modal-dropdown-portal.custom-dropdown');

    expect(portal).toBeInTheDocument();
    expect(portal).toHaveStyle({ top: '72px', left: '32px', width: '180px' });
    expect(screen.getByText('Dropdown content')).toBeInTheDocument();
  });

  it('uses an explicit width, updates position on window events, and cleans up on close', () => {
    const rect = createRect({ bottom: 60, left: 28, width: 120 });
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect as unknown as DOMRect);

    const { rerender } = render(<DropdownHarness isOpen width={240} />);

    let portal = document.body.querySelector('.modal-dropdown-portal');
    expect(portal).toHaveStyle({ top: '60px', left: '28px', width: '240px' });

    rect.bottom = 96;
    rect.left = 80;
    fireEvent(window, new Event('resize'));

    portal = document.body.querySelector('.modal-dropdown-portal');
    expect(portal).toHaveStyle({ top: '96px', left: '80px', width: '240px' });

    rect.bottom = 128;
    rect.left = 112;
    fireEvent(window, new Event('scroll'));

    portal = document.body.querySelector('.modal-dropdown-portal');
    expect(portal).toHaveStyle({ top: '128px', left: '112px', width: '240px' });

    rerender(<DropdownHarness isOpen={false} width={240} />);

    expect(document.body.querySelector('.modal-dropdown-portal')).not.toBeInTheDocument();
    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true);
  });
});
