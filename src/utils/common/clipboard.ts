const CLIPBOARD_UNAVAILABLE_ERROR = 'Clipboard API is not available';

export const copyTextToClipboard = (text: string): Promise<void> => {
  const clipboard = navigator.clipboard;

  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return Promise.reject(new Error(CLIPBOARD_UNAVAILABLE_ERROR));
  }

  return Promise.resolve(clipboard.writeText(text));
};
