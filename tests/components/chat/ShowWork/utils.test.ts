import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadContent, formatDebugInfo } from '@/components/chat/ShowWork/utils';

describe('ShowWork utils', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  it('returns a fallback message when debug info is missing or invalid', () => {
    expect(formatDebugInfo(undefined)).toBe('No debug info available.');
    expect(formatDebugInfo('not-an-object')).toBe('No debug info available.');
    expect(formatDebugInfo(null)).toBe('No debug info available.');
  });

  it('formats system instruction, history, current turn, and inline image markers', () => {
    const output = formatDebugInfo({
      systemInstruction: '  <system>Use XML</system>  ',
      history: [
        {
          role: 'user',
          parts: [
            { text: '  hello world  ' },
            { inlineData: { mimeType: 'image/png' } },
          ],
        },
      ],
      userTurn: {
        role: 'model',
        parts: [
          { text: '  <draft>answer</draft>  ' },
          { inlineData: { mimeType: 'image/jpeg' } },
        ],
      },
    });

    expect(output).toContain('### System Instruction');
    expect(output).toContain('<system>Use XML</system>');
    expect(output).toContain('### Chat History');
    expect(output).toContain('#### user');
    expect(output).toContain('hello world');
    expect(output).toContain('*[Image Data]*');
    expect(output).toContain('### Current Turn');
    expect(output).toContain('#### model');
    expect(output).toContain('<draft>answer</draft>');
  });

  it('returns an empty string for an object without supported debug fields', () => {
    expect(formatDebugInfo({ somethingElse: true })).toBe('');
  });

  it('downloads markdown content through a temporary anchor and blob URL', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadContent('debug.md', '# debug');

    const createObjectUrlSpy = vi.mocked(URL.createObjectURL);
    const revokeObjectUrlSpy = vi.mocked(URL.revokeObjectURL);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectUrlSpy.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('text/markdown');
    await expect(blobArg.text()).resolves.toBe('# debug');

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('debug.md');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(anchor);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock-url');
  });
});
