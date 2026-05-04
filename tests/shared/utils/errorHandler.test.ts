import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createErrorHandler } from '../../../shared/utils/errorHandler';

const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = loggerWarn;
    error = vi.fn();
  },
}));

const originalAlert = window.alert;

describe('createErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
  });

  afterEach(() => {
    window.alert = originalAlert;
    vi.unstubAllGlobals();
  });

  it('calls the provided onShowError handler with the message', () => {
    const onShowError = vi.fn();

    createErrorHandler(onShowError)('Something failed');

    expect(onShowError).toHaveBeenCalledExactlyOnceWith('Something failed');
  });

  it('does not call window.alert when a handler is provided', () => {
    createErrorHandler(vi.fn())('Something failed');

    expect(window.alert).not.toHaveBeenCalled();
  });

  it('logs a warning and calls window.alert when no handler is provided', () => {
    createErrorHandler()('Something failed');

    expect(loggerWarn).toHaveBeenCalledWith('No error handler provided:', 'Something failed');
    expect(window.alert).toHaveBeenCalledExactlyOnceWith('Something failed');
  });

  it('is safe when window is unavailable', () => {
    const currentWindow = window;
    vi.stubGlobal('window', undefined);

    try {
      expect(() => createErrorHandler()('Something failed')).not.toThrow();
    } finally {
      vi.stubGlobal('window', currentWindow);
    }
  });

  it('is safe when window.alert is unavailable', () => {
    Object.defineProperty(window, 'alert', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    expect(() => createErrorHandler()('Something failed')).not.toThrow();
    expect(loggerWarn).toHaveBeenCalledWith('No error handler provided:', 'Something failed');
  });
});
