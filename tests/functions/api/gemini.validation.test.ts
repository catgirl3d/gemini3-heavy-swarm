import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeGeminiRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  buildUnifiedHeaders: vi.fn(),
  handleCorsPreflightIfNeeded: vi.fn(),
  wrapStreamWithLogging: vi.fn(),
}));

vi.mock('../../../shared/api/geminiProxy.core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/geminiProxy.core')>();

  return {
    ...actual,
    executeGeminiRequest: mocks.executeGeminiRequest,
  };
});

vi.mock('../../../shared/api/adapters/cloudflare.adapter', () => ({
  checkRateLimit: mocks.checkRateLimit,
  isCloudflareProduction: () => false,
  buildUnifiedHeaders: mocks.buildUnifiedHeaders,
  handleCorsPreflightIfNeeded: mocks.handleCorsPreflightIfNeeded,
  wrapStreamWithLogging: mocks.wrapStreamWithLogging,
}));

import { onRequestPost } from '../../../functions/api/gemini';

describe('Cloudflare Gemini validation failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 0 });
    mocks.buildUnifiedHeaders.mockReturnValue(new Headers());
    mocks.handleCorsPreflightIfNeeded.mockReturnValue(null);
    mocks.wrapStreamWithLogging.mockImplementation((body) => body);
  });

  it('returns 400 for empty contents before any upstream Gemini request is attempted', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'secret',
        },
        body: JSON.stringify({ contents: [] }),
      }),
      env: {
        API_SECRET: 'secret',
        GEMINI_API_KEY: 'gemini-key',
        PROXY_MODE: 'private',
        ALLOWED_ORIGINS: '',
        RATE_LIMITER_DO: {},
      },
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing or invalid "contents" in request body',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed non-empty contents items with no usable parts array', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'secret',
        },
        body: JSON.stringify({ contents: [{ role: 'user' }] }),
      }),
      env: {
        API_SECRET: 'secret',
        GEMINI_API_KEY: 'gemini-key',
        PROXY_MODE: 'private',
        ALLOWED_ORIGINS: '',
        RATE_LIMITER_DO: {},
      },
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid "contents" structure: each item must have a non-empty "parts" array (further validation by Gemini API)',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON before validation/preparation reaches Gemini proxy execution', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'secret',
        },
        body: '{"contents": [',
      }),
      env: {
        API_SECRET: 'secret',
        GEMINI_API_KEY: 'gemini-key',
        PROXY_MODE: 'private',
        ALLOWED_ORIGINS: '',
        RATE_LIMITER_DO: {},
      },
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid JSON body',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for unauthorized models and 413 for oversized serialized bodies before any upstream request', async () => {
    const unauthorizedResponse = await onRequestPost({
      request: new Request('https://example.com/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'secret',
        },
        body: JSON.stringify({
          model: 'gpt-4-ultra-mega-secret',
          contents: [{ parts: [{ text: 'hello' }] }],
        }),
      }),
      env: {
        API_SECRET: 'secret',
        GEMINI_API_KEY: 'gemini-key',
        PROXY_MODE: 'private',
        ALLOWED_ORIGINS: '',
        RATE_LIMITER_DO: {},
      },
    } as never);

    expect(unauthorizedResponse.status).toBe(400);
    await expect(unauthorizedResponse.json()).resolves.toEqual({
      error: 'Invalid or unauthorized model',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();

    const oversizedResponse = await onRequestPost({
      request: new Request('https://example.com/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'secret',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'a'.repeat(100001) }] }],
        }),
      }),
      env: {
        API_SECRET: 'secret',
        GEMINI_API_KEY: 'gemini-key',
        PROXY_MODE: 'private',
        ALLOWED_ORIGINS: '',
        RATE_LIMITER_DO: {},
      },
    } as never);

    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toEqual({
      error: 'Content too large',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });
});
