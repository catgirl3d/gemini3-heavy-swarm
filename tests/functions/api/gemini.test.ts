import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateAndPrepareProxy: vi.fn(),
  executeGeminiRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  buildUnifiedHeaders: vi.fn(),
  handleCorsPreflightIfNeeded: vi.fn(),
  wrapStreamWithLogging: vi.fn(),
}));

vi.mock('../../../shared/api/geminiProxy.core', () => ({
  validateAndPrepareProxy: mocks.validateAndPrepareProxy,
  executeGeminiRequest: mocks.executeGeminiRequest,
}));

vi.mock('../../../shared/api/adapters/cloudflare.adapter', () => ({
  checkRateLimit: mocks.checkRateLimit,
  isCloudflareProduction: () => false,
  buildUnifiedHeaders: mocks.buildUnifiedHeaders,
  handleCorsPreflightIfNeeded: mocks.handleCorsPreflightIfNeeded,
  wrapStreamWithLogging: mocks.wrapStreamWithLogging,
}));

import { onRequestPost } from '../../../functions/api/gemini';

describe('Cloudflare Gemini function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 0 });
    mocks.buildUnifiedHeaders.mockReturnValue(new Headers());
    mocks.handleCorsPreflightIfNeeded.mockReturnValue(null);
    mocks.wrapStreamWithLogging.mockImplementation((body) => body);
  });

  it('maps non-ok upstream Gemini responses to safe client errors with the original status code', async () => {
    mocks.validateAndPrepareProxy.mockReturnValue({
      ok: true,
      targetUrl: 'https://example.com/stream',
      targetModel: 'gemini-2.5-flash',
      requestBody: '{"prepared":true}',
    });
    mocks.executeGeminiRequest.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('raw upstream overload details'),
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'secret',
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hello' }] }] }),
      }),
      env: {
        API_SECRET: 'secret',
        GEMINI_API_KEY: 'gemini-key',
        PROXY_MODE: 'private',
        ALLOWED_ORIGINS: '',
        RATE_LIMITER_DO: {},
      },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Gemini service is temporarily overloaded or unavailable',
    });
    expect(mocks.executeGeminiRequest).toHaveBeenCalledWith('https://example.com/stream', '{"prepared":true}', 'gemini-key');
  });
});
