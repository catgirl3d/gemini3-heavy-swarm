import { createRef, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputArea } from './InputArea';

type InputAreaProps = ComponentProps<typeof InputArea>;

const createProps = (overrides: Partial<InputAreaProps> = {}): InputAreaProps => ({
  isInputLocked: false,
  canStartNewPrompt: true,
  canStop: false,
  image: null,
  userInput: '',
  onUserInputChange: vi.fn(),
  onImageChange: vi.fn(),
  onRemoveImage: vi.fn(),
  onSubmit: vi.fn((event) => event.preventDefault()),
  onStop: vi.fn(),
  fileInputRef: createRef<HTMLInputElement>(),
  inputRef: createRef<HTMLInputElement>(),
  ...overrides,
});

describe('InputArea', () => {
  it('disables input and attachment while the session is locked', () => {
    render(<InputArea {...createProps({ isInputLocked: true })} />);

    expect(screen.getByLabelText('User input')).toBeDisabled();
    expect(screen.getByLabelText('Attach image')).toBeDisabled();
  });

  it('shows Stop independently from send availability', () => {
    const onStop = vi.fn();

    render(<InputArea {...createProps({ canStop: true, canStartNewPrompt: false, onStop })} />);

    fireEvent.click(screen.getByLabelText('Stop generation'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Send message')).not.toBeInTheDocument();
  });

  it('keeps Send visible but disabled when starting a new prompt is not allowed', () => {
    render(<InputArea {...createProps({ canStartNewPrompt: false })} />);

    expect(screen.getByLabelText('Send message')).toBeDisabled();
    expect(screen.queryByLabelText('Stop generation')).not.toBeInTheDocument();
  });
});
