import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { createLocalStorageMock } from './mocks/localStorage';

// Mock localStorage globally
Object.defineProperty(window, 'localStorage', {
  value: createLocalStorageMock(),
  writable: true,
  configurable: true,
});

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
  vi.mocked(localStorage).clear();
});
