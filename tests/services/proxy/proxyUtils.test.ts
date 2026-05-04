import { afterEach, describe, expect, it, vi } from 'vitest';

const importProxyUtils = async (isForcedProxy: boolean) => {
  vi.resetModules();
  vi.doMock('@/constants', () => ({
    IS_FORCED_PROXY: isForcedProxy,
  }));

  return import('@/services/proxy/proxyUtils');
};

describe('proxyUtils', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.doUnmock('@/constants');
    vi.resetModules();
  });

  describe('isUsingProxy', () => {
    it('uses proxy when there is no user key and no env key', async () => {
      const { isUsingProxy } = await importProxyUtils(false);

      expect(isUsingProxy()).toBe(true);
    });

    it('uses direct mode when only an env key exists and forced proxy is off', async () => {
      process.env.GEMINI_API_KEY = 'env-key';
      const { isUsingProxy } = await importProxyUtils(false);

      expect(isUsingProxy()).toBe(false);
    });

    it('uses proxy for env keys when forced proxy is on', async () => {
      process.env.GEMINI_API_KEY = 'env-key';
      const { isUsingProxy } = await importProxyUtils(true);

      expect(isUsingProxy()).toBe(true);
    });

    it('lets a user key override forced proxy mode', async () => {
      process.env.GEMINI_API_KEY = 'env-key';
      const { isUsingProxy } = await importProxyUtils(true);

      expect(isUsingProxy('user-key')).toBe(false);
    });

    it('treats whitespace user keys as present under the current contract', async () => {
      const { isUsingProxy } = await importProxyUtils(true);

      expect(isUsingProxy('   ')).toBe(false);
    });

    it('treats null runtime input like a missing key', async () => {
      const { isUsingProxy } = await importProxyUtils(false);

      expect(isUsingProxy(null as unknown as string | undefined)).toBe(true);
    });
  });

  describe('getDirectApiKey', () => {
    it('returns the user key before env or forced proxy checks', async () => {
      process.env.GEMINI_API_KEY = 'env-key';
      const { getDirectApiKey } = await importProxyUtils(true);

      expect(getDirectApiKey('user-key')).toBe('user-key');
    });

    it('returns the env key when forced proxy is off and no user key exists', async () => {
      process.env.GEMINI_API_KEY = 'env-key';
      const { getDirectApiKey } = await importProxyUtils(false);

      expect(getDirectApiKey()).toBe('env-key');
    });

    it('returns null for env keys when forced proxy is on', async () => {
      process.env.GEMINI_API_KEY = 'env-key';
      const { getDirectApiKey } = await importProxyUtils(true);

      expect(getDirectApiKey()).toBeNull();
    });

    it('returns null when no direct key is available', async () => {
      const { getDirectApiKey } = await importProxyUtils(false);

      expect(getDirectApiKey()).toBeNull();
    });

    it('returns whitespace user keys as-is under the current contract', async () => {
      const { getDirectApiKey } = await importProxyUtils(true);

      expect(getDirectApiKey('   ')).toBe('   ');
    });

    it('treats null runtime input like a missing key', async () => {
      const { getDirectApiKey } = await importProxyUtils(false);

      expect(getDirectApiKey(null as unknown as string | undefined)).toBeNull();
    });
  });
});
