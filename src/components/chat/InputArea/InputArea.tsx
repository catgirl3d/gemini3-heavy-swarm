import React, { type FC, type ChangeEvent, type FormEvent, type RefObject } from 'react';

interface InputAreaProps {
  isInputLocked: boolean;
  canStartNewPrompt: boolean;
  canStop: boolean;
  image: string | null;
  userInput: string;
  onUserInputChange: (value: string) => void;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
}

export const InputArea: FC<InputAreaProps> = ({
  isInputLocked,
  canStartNewPrompt,
  canStop,
  image,
  userInput,
  onUserInputChange,
  onImageChange,
  onRemoveImage,
  onSubmit,
  onStop,
  fileInputRef,
  inputRef
}) => {
  return (
    <div className="input-container">
      {image && (
        <div className="image-preview">
          <img src={image} alt="Preview" className="preview-img" />
          <button onClick={onRemoveImage} className="remove-image-btn" aria-label="Remove image">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      )}
      <form className="input-area" onSubmit={onSubmit}>
        <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} disabled={isInputLocked} aria-label="Attach image">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
          </svg>
          <input type="file" ref={fileInputRef} onChange={onImageChange} accept="image/*" className="hidden-input" />
        </button>
        <input
          ref={inputRef}
          type="text"
          name="userInput"
          value={userInput}
          onChange={(e) => onUserInputChange(e.target.value)}
          placeholder="Ask the swarm..."
          aria-label="User input"
          disabled={isInputLocked}
        />
        {canStop ? (
          <button type="button" className="stop-button" onClick={onStop} aria-label="Stop generation">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="send-button" disabled={!canStartNewPrompt} aria-label="Send message">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
          </button>
        )}
      </form>
    </div>
  );
};
