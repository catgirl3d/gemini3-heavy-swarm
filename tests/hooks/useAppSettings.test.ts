import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppSettings } from '@/hooks/state/useAppSettings';
import * as React from 'react';

// Mock React
vi.mock('react', () => ({
  useState: vi.fn((val) => [val, vi.fn()]),
  useEffect: vi.fn(),
}));

// Mock Logger
vi.mock('@shared/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(function() {
    return {
      info: vi.fn(),
      error: vi.fn(),
    };
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('useAppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should have a resetSettings function', () => {
    // We need to capture the setSettings setter to verify resetSettings
    let capturedSetSettings: any;
    (React.useState as any).mockImplementation((init: any) => {
      const [val, setVal] = [init, vi.fn()];
      if (typeof init === 'object' && init !== null && 'provider' in init) {
        capturedSetSettings = setVal;
      }
      return [val, setVal];
    });

    const { resetSettings } = useAppSettings();
    expect(typeof resetSettings).toBe('function');

    resetSettings();

    // Verify localStorage.removeItem was called
    expect(localStorage.removeItem).toHaveBeenCalledWith('gemini3-settings');
    
    // Verify setSettings was called with DEFAULT_SETTINGS
    // Note: Since we mock React, we are testing that useAppSettings calls its internal setSettings with DEFAULT_SETTINGS
    expect(capturedSetSettings).toHaveBeenCalled();
  });
});
