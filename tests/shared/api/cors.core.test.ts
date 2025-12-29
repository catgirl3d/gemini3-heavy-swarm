import { describe, it, expect } from 'vitest';
import { getAllowedOrigins, isOriginAllowed, buildCorsHeaders, buildSecurityHeaders, buildAllHeaders } from '@shared/api/cors.core';
import { SECURITY_CONFIG } from '@shared/api/types';

describe('cors.core', () => {
  describe('getAllowedOrigins', () => {
    it('should parse comma-separated origins', () => {
      const env = 'http://localhost:3000,https://example.com';
      expect(getAllowedOrigins(env)).toEqual(['http://localhost:3000', 'https://example.com']);
    });

    it('should use defaults if env is missing', () => {
      const result = getAllowedOrigins(undefined);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('isOriginAllowed', () => {
    it('should return true for allowed origin', () => {
      expect(isOriginAllowed('http://localhost:3000', ['http://localhost:3000', 'https://example.com'])).toBe(true);
    });

    it('should return false for disallowed origin', () => {
      expect(isOriginAllowed('https://evil.com', ['http://localhost:3000'])).toBe(false);
    });

    it('should return false for null origin', () => {
      expect(isOriginAllowed(null, ['http://localhost:3000'])).toBe(false);
    });
  });

  describe('buildCorsHeaders', () => {
    it('should return correct headers for origin', () => {
      const headers = buildCorsHeaders('http://localhost:3000');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      expect(headers['Vary']).toBe('Origin');
      expect(headers['Access-Control-Allow-Methods']).toBeDefined();
    });
  });

  describe('buildSecurityHeaders', () => {
    it('should include basic security headers', () => {
      const headers = buildSecurityHeaders(false, false);
      expect(headers['X-Content-Type-Options']).toBe(SECURITY_CONFIG.xContentTypeOptions);
      expect(headers['X-Frame-Options']).toBe(SECURITY_CONFIG.xFrameOptions);
    });

    it('should include CSP for API endpoints', () => {
      const headers = buildSecurityHeaders(false, true);
      expect(headers['Content-Security-Policy']).toBe(SECURITY_CONFIG.csp);
    });

    it('should include HSTS in production', () => {
      const headers = buildSecurityHeaders(true, false);
      expect(headers['Strict-Transport-Security']).toBe(SECURITY_CONFIG.hsts);
    });
  });

  describe('buildAllHeaders', () => {
    it('should combine cors, security, and content-type headers', () => {
      const headers = buildAllHeaders('http://localhost:3000', ['http://localhost:3000'], true);
      
      // CORS
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      // Security
      expect(headers['Strict-Transport-Security']).toBeDefined();
      expect(headers['Content-Security-Policy']).toBeDefined();
      // Content-Type
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should handle disallowed origin by excluding CORS headers', () => {
      const headers = buildAllHeaders('https://evil.com', ['http://localhost:3000'], false);
      
      expect((headers as any)['Access-Control-Allow-Origin']).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Frame-Options']).toBe('DENY');
    });
  });
});
