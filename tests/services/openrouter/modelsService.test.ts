import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenRouterModel } from '@/services/openrouter/modelsService';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_DURATION_MS = 1000 * 60 * 60;

const loggerErrorMock = vi.fn();

const createModel = (id: string): OpenRouterModel => ({
  id,
  name: `Model ${id}`,
  description: `Description for ${id}`,
  pricing: {
    prompt: '0.000001',
    completion: '0.000002',
    request: '0',
    image: '0',
  },
  context_length: 128000,
  architecture: {
    modality: 'text->text',
    tokenizer: 'cl100k_base',
    instruct_type: null,
  },
  top_provider: {
    context_length: 128000,
    max_completion_tokens: 4096,
    is_moderated: false,
  },
  supported_parameters: ['reasoning'],
});

const createFetchResponse = (models: OpenRouterModel[]) => ({
  ok: true,
  statusText: 'OK',
  json: vi.fn().mockResolvedValue({ data: models }),
});

const importService = async () => {
  vi.resetModules();
  loggerErrorMock.mockClear();
  vi.doMock('@shared/utils/logger', () => ({
    Logger: class {
      debug = vi.fn();
      info = vi.fn();
      warn = vi.fn();
      error = loggerErrorMock;
    },
  }));

  return import('@/services/openrouter/modelsService');
};

describe('modelsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('@shared/utils/logger');
  });

  it('fetches OpenRouter models and caches the result', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const models = [createModel('openai/gpt-test')];
    const response = createFetchResponse(models);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    const result = await fetchOpenRouterModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(OPENROUTER_MODELS_URL);
    expect(response.json).toHaveBeenCalledTimes(1);
    expect(result).toBe(models);
  });

  it('returns fresh cached models within one hour', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const models = [createModel('anthropic/claude-test')];
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(models));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(models);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS - 1);
    await expect(fetchOpenRouterModels()).resolves.toBe(models);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches at the exact cache expiry boundary', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const firstModels = [createModel('model/boundary-old')];
    const secondModels = [createModel('model/boundary-new')];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(firstModels))
      .mockResolvedValueOnce(createFetchResponse(secondModels));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(firstModels);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS);
    await expect(fetchOpenRouterModels()).resolves.toBe(secondModels);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches an empty model list as a valid response', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const models: OpenRouterModel[] = [];
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(models));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(models);
    await expect(fetchOpenRouterModels()).resolves.toBe(models);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches and replaces cached models after cache expiry', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const firstModels = [createModel('model/old')];
    const secondModels = [createModel('model/new')];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(firstModels))
      .mockResolvedValueOnce(createFetchResponse(secondModels));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(firstModels);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS + 1);
    await expect(fetchOpenRouterModels()).resolves.toBe(secondModels);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent fetches through a shared pending promise', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const models = [createModel('google/gemini-test')];
    let resolveJson!: (value: { data: OpenRouterModel[] }) => void;
    const jsonPromise = new Promise<{ data: OpenRouterModel[] }>(resolve => {
      resolveJson = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: vi.fn(() => jsonPromise),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    const firstCall = fetchOpenRouterModels();
    const secondCall = fetchOpenRouterModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveJson({ data: models });
    await expect(firstCall).resolves.toBe(models);
    await expect(secondCall).resolves.toBe(models);
  });

  it('clears the pending promise after success so expired cache can refetch', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const firstModels = [createModel('model/first')];
    const secondModels = [createModel('model/second')];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(firstModels))
      .mockResolvedValueOnce(createFetchResponse(secondModels));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await fetchOpenRouterModels();
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS + 1);
    await expect(fetchOpenRouterModels()).resolves.toBe(secondModels);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logs and rethrows HTTP errors when no cache exists', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
      json: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).rejects.toThrow('Failed to fetch models: Unauthorized');
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Error fetching OpenRouter models:',
      expect.any(Error)
    );
  });

  it('returns stale cached models when an expired refetch gets an HTTP error', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const staleModels = [createModel('model/stale-http')];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(staleModels))
      .mockResolvedValueOnce({
        ok: false,
        statusText: 'Too Many Requests',
        json: vi.fn(),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS + 1);
    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Error fetching OpenRouter models:',
      expect.any(Error)
    );
  });

  it('logs and rethrows JSON parse errors when no cache exists', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const parseError = new Error('Invalid JSON');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: vi.fn().mockRejectedValue(parseError),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).rejects.toThrow('Invalid JSON');
    expect(loggerErrorMock).toHaveBeenCalledWith('Error fetching OpenRouter models:', parseError);
  });

  it('returns stale cached models when an expired refetch cannot parse JSON', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const staleModels = [createModel('model/stale-json')];
    const parseError = new Error('Invalid JSON');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(staleModels))
      .mockResolvedValueOnce({
        ok: true,
        statusText: 'OK',
        json: vi.fn().mockRejectedValue(parseError),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS + 1);
    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);

    expect(loggerErrorMock).toHaveBeenCalledWith('Error fetching OpenRouter models:', parseError);
  });

  it('rejects malformed API payloads instead of caching them', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({ data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).rejects.toThrow('Invalid OpenRouter models response');
    await expect(fetchOpenRouterModels()).rejects.toThrow('Invalid OpenRouter models response');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns stale cached models when an expired refetch fails', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const staleModels = [createModel('model/stale')];
    const fetchError = new Error('Network down');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(staleModels))
      .mockRejectedValueOnce(fetchError);
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS + 1);
    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loggerErrorMock).toHaveBeenCalledWith('Error fetching OpenRouter models:', fetchError);
  });

  it('clears the pending promise after failure so a later request can succeed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const models = [createModel('model/recovered')];
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(createFetchResponse(models));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).rejects.toThrow('Network down');
    await expect(fetchOpenRouterModels()).resolves.toBe(models);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares a failing pending promise across concurrent callers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchError = new Error('Network down');
    const fetchMock = vi.fn().mockRejectedValue(fetchError);
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    const firstCall = fetchOpenRouterModels();
    const secondCall = fetchOpenRouterModels();

    await expect(firstCall).rejects.toThrow('Network down');
    await expect(secondCall).rejects.toThrow('Network down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares stale fallback across concurrent expired refetch callers', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const staleModels = [createModel('model/concurrent-stale')];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse(staleModels))
      .mockRejectedValueOnce(new Error('Network down'));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOpenRouterModels } = await importService();

    await expect(fetchOpenRouterModels()).resolves.toBe(staleModels);
    nowSpy.mockReturnValue(1000 + CACHE_DURATION_MS + 1);

    const firstCall = fetchOpenRouterModels();
    const secondCall = fetchOpenRouterModels();

    await expect(firstCall).resolves.toBe(staleModels);
    await expect(secondCall).resolves.toBe(staleModels);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
