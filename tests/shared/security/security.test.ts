import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenericRequest } from '@shared/api/types';
import {
  DEVELOPMENT_ORIGINS,
  PRODUCTION_ORIGINS,
  getNodeEnv,
  isProductionByNodeEnv,
  isProductionEnvironment,
} from '@shared/security/security';

const originalNodeEnv = process.env.NODE_ENV;

const createRequest = (url?: string): GenericRequest => ({
  headers: {},
  url,
});

const restoreNodeEnv = () => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
    return;
  }

  process.env.NODE_ENV = originalNodeEnv;
};

describe('security environment helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    restoreNodeEnv();
  });

  it('reads NODE_ENV when process.env is available', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(getNodeEnv()).toBe('production');
  });

  it('returns undefined when process is unavailable', () => {
    vi.stubGlobal('process', undefined);

    expect(getNodeEnv()).toBeUndefined();
  });

  it('detects production from NODE_ENV only when it equals production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isProductionByNodeEnv()).toBe(true);

    vi.stubEnv('NODE_ENV', 'development');
    expect(isProductionByNodeEnv()).toBe(false);
  });

  it('treats NODE_ENV production as authoritative', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(isProductionEnvironment(createRequest(DEVELOPMENT_ORIGINS[0]))).toBe(true);
  });

  it('detects production from exact production origin URLs', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(isProductionEnvironment(createRequest(`${PRODUCTION_ORIGINS[0]}/api/gemini`))).toBe(true);
  });

  it('detects production from production hostnames even when origin differs', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const productionHostname = new URL(PRODUCTION_ORIGINS[0]).hostname;

    expect(isProductionEnvironment(createRequest(`https://${productionHostname}:8443/api/gemini`))).toBe(true);
  });

  it('returns false for development origins, invalid URLs, and missing URLs', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(isProductionEnvironment(createRequest(DEVELOPMENT_ORIGINS[0]))).toBe(false);
    expect(isProductionEnvironment(createRequest('not a url'))).toBe(false);
    expect(isProductionEnvironment(createRequest())).toBe(false);
  });
});
