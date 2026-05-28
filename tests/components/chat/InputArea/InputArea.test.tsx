import { createRef, type ChangeEvent, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputArea } from '@/components/chat/InputArea/InputArea';

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

  it('forwards attachment clicks, file changes, and text input updates', () => {
    const onImageChange = vi.fn();
    const props = createProps({ onImageChange });

    render(<InputArea {...props} />);

    const fileInput = props.fileInputRef.current;

    expect(fileInput).not.toBeNull();

    const fileInputClickSpy = vi.fn();

    Object.defineProperty(fileInput as HTMLInputElement, 'click', {
      value: fileInputClickSpy,
      configurable: true,
    });

    const file = new File(['image-bytes'], 'preview.png', { type: 'image/png' });

    fireEvent.click(screen.getByLabelText('Attach image'));
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('User input'), { target: { value: 'Hello swarm' } });

    expect(fileInputClickSpy).toHaveBeenCalledTimes(1);
    expect(onImageChange).toHaveBeenCalledTimes(1);
    const imageChangeEvent = onImageChange.mock.calls[0]?.[0] as ChangeEvent<HTMLInputElement>;

    expect(imageChangeEvent.target.files).toHaveLength(1);
    expect(imageChangeEvent.target.files?.[0]).toStrictEqual(file);
    expect(props.onUserInputChange).toHaveBeenCalledWith('Hello swarm');
  });

  it('shows image preview, removes it, and submits the form', () => {
    const props = createProps({ image: 'data:image/png;base64,preview' });
    const { container } = render(<InputArea {...props} />);

    expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'data:image/png;base64,preview');

    fireEvent.click(screen.getByLabelText('Remove image'));
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(props.onRemoveImage).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });
});
