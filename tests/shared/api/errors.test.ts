import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSafeGeminiError } from '@shared/api/errors';

describe('getSafeGeminiError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [400, 'Invalid request parameters or format'],
    [401, 'Authentication failed: check API key configuration'],
    [403, 'Access denied: permission error or blocked region'],
    [404, 'The requested resource or model was not found'],
    [413, 'Request content exceeds allowed size limits'],
    [429, 'Rate limit exceeded: too many requests in a short period'],
    [500, 'Internal Gemini API error: please try again later'],
    [503, 'Gemini service is temporarily overloaded or unavailable'],
    [504, 'Gateway timeout: the request took too long to complete'],
  ])('maps status %i to a safe message', (statusCode, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(getSafeGeminiError(statusCode, 'raw secret details')).toEqual({
      error: message,
      statusCode,
    });
  });

  it('uses a generic fallback for unknown status codes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(getSafeGeminiError(418, 'internal stack trace')).toEqual({
      error: 'Gemini API error occurred (Status 418)',
      statusCode: 418,
    });
  });

  it('logs raw technical details without returning them to the client', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawError = 'secret api detail';

    const result = getSafeGeminiError(500, rawError);

    expect(result.error).not.toContain(rawError);
    expect(errorSpy).toHaveBeenCalledWith(
      '[ERROR:GeminiError] Technical Logs - Status: 500, Details: secret api detail',
      ''
    );
  });
});
