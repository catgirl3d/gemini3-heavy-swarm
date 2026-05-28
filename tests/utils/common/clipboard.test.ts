import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/utils/common/clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes text with the Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await copyTextToClipboard('copied text');

    expect(writeText).toHaveBeenCalledWith('copied text');
  });

  it('rejects when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    await expect(copyTextToClipboard('copied text')).rejects.toThrow('Clipboard API is not available');
  });
});
