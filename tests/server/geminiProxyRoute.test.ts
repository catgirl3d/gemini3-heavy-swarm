import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateAndPrepareProxy: vi.fn(),
  executeGeminiRequest: vi.fn(),
  postHandlers: new Map<string, (req: any, res: any) => Promise<unknown>>(),
}));

vi.mock('express', () => {
  const app = {
    set: vi.fn(),
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn((path: string, handler: (req: any, res: any) => Promise<unknown>) => {
      mocks.postHandlers.set(path, handler);
    }),
    listen: vi.fn((_port: number, callback?: () => void) => {
      callback?.();
      return { close: vi.fn() };
    }),
  };

  const express = Object.assign(() => app, {
    json: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    static: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  });

  return { default: express };
});

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

vi.mock('net', () => ({
  default: {
    createServer: () => {
      const handlers: Record<string, () => void> = {};
      return {
        once: (event: string, callback: () => void) => {
          handlers[event] = callback;
        },
        listen: () => {
          handlers.listening?.();
        },
        close: vi.fn(),
      };
    },
  },
}));

vi.mock('../../shared/api/geminiProxy.core', () => ({
  validateAndPrepareProxy: mocks.validateAndPrepareProxy,
  executeGeminiRequest: mocks.executeGeminiRequest,
}));

describe('Express Gemini proxy route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.postHandlers.clear();
    process.env.GEMINI_API_KEY = 'gemini-key';
  });

  it('maps non-ok upstream Gemini responses to safe Express JSON errors', async () => {
    mocks.validateAndPrepareProxy.mockReturnValue({
      ok: true,
      targetUrl: 'https://example.com/stream',
      targetModel: 'gemini-2.5-flash',
      requestBody: '{"prepared":true}',
    });
    mocks.executeGeminiRequest.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('raw upstream auth details'),
    });

    await import('../../server/server');
    const handler = mocks.postHandlers.get('/api/gemini');
    if (!handler) {
      throw new Error('Expected /api/gemini route handler to be registered');
    }

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler({ body: { model: 'gemini-2.5-flash' } }, res);

    expect(mocks.executeGeminiRequest).toHaveBeenCalledWith('https://example.com/stream', '{"prepared":true}', 'gemini-key');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication failed: check API key configuration',
    });
  });
});
