import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

type RouteHandler = (req: Pick<Request, 'body'>, res: Pick<Response, 'status' | 'json'>) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  executeGeminiRequest: vi.fn(),
  postHandlers: new Map<string, RouteHandler>(),
}));

vi.mock('express', () => {
  const app = {
    set: vi.fn(),
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn((path: string, handler: RouteHandler) => {
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

vi.mock('../../shared/api/geminiProxy.core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/geminiProxy.core')>();

  return {
    ...actual,
    executeGeminiRequest: mocks.executeGeminiRequest,
  };
});

describe('Express Gemini validation failures', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.postHandlers.clear();
    process.env.GEMINI_API_KEY = 'gemini-key';
  });

  it('returns 400 for empty contents before attempting any upstream Gemini request', async () => {
    await import('../../server/server');
    const handler = mocks.postHandlers.get('/api/gemini');
    if (!handler) {
      throw new Error('Expected /api/gemini route handler to be registered');
    }

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } satisfies Pick<Response, 'status' | 'json'>;

    await handler({ body: { contents: [] } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing or invalid "contents" in request body',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed non-empty contents items with no usable parts array', async () => {
    await import('../../server/server');
    const handler = mocks.postHandlers.get('/api/gemini');
    if (!handler) {
      throw new Error('Expected /api/gemini route handler to be registered');
    }

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } satisfies Pick<Response, 'status' | 'json'>;

    await handler({ body: { contents: [{ role: 'user' }] } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid "contents" structure: each item must have a non-empty "parts" array (further validation by Gemini API)',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });

  it('returns 400 for unauthorized models and 413 for oversized serialized bodies before any upstream request', async () => {
    await import('../../server/server');
    const handler = mocks.postHandlers.get('/api/gemini');
    if (!handler) {
      throw new Error('Expected /api/gemini route handler to be registered');
    }

    const unauthorizedRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } satisfies Pick<Response, 'status' | 'json'>;

    await handler({
      body: {
        model: 'gpt-4-ultra-mega-secret',
        contents: [{ parts: [{ text: 'hello' }] }],
      },
    }, unauthorizedRes);

    expect(unauthorizedRes.status).toHaveBeenCalledWith(400);
    expect(unauthorizedRes.json).toHaveBeenCalledWith({
      error: 'Invalid or unauthorized model',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();

    const oversizedRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } satisfies Pick<Response, 'status' | 'json'>;

    await handler({
      body: {
        contents: [{ parts: [{ text: 'a'.repeat(100001) }] }],
      },
    }, oversizedRes);

    expect(oversizedRes.status).toHaveBeenCalledWith(413);
    expect(oversizedRes.json).toHaveBeenCalledWith({
      error: 'Content too large',
    });
    expect(mocks.executeGeminiRequest).not.toHaveBeenCalled();
  });
});
