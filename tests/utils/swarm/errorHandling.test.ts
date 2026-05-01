import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSendMessageError, hasPartialWorkResults } from '@/utils/swarm/errorHandling';
import { createMockSettings } from '@/test/utils/settingsMocks';
import { STEPS, Work } from '@/types';

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

vi.mock('@/services/swarm/steps/utils/errorUtils', () => ({
  getFriendlyErrorMessage: vi.fn(() => 'Friendly failure'),
}));

const createSetters = () => ({
  setLoadingStatus: vi.fn(),
  setIsPaused: vi.fn(),
  setIsLoading: vi.fn(),
  setCurrentWork: vi.fn(),
  setError: vi.fn(),
});

describe('hasPartialWorkResults', () => {
  it('returns false when work or successful step results are missing', () => {
    expect(hasPartialWorkResults(undefined)).toBe(false);
    expect(hasPartialWorkResults({})).toBe(false);
    expect(hasPartialWorkResults({ results: { [STEPS.INITIAL]: ['', null], [STEPS.REFINEMENT]: [] } })).toBe(false);
  });

  it('detects successful initial and refinement partial results', () => {
    expect(hasPartialWorkResults({ results: { [STEPS.INITIAL]: ['draft'] } })).toBe(true);
    expect(hasPartialWorkResults({ results: { [STEPS.REFINEMENT]: [null, 'critique'] } })).toBe(true);
  });
});

describe('handleSendMessageError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles Error("Aborted") as a user cancellation', () => {
    const setters = createSetters();

    const handled = handleSendMessageError(
      new Error('Aborted'),
      undefined,
      setters.setLoadingStatus,
      setters.setIsPaused,
      setters.setIsLoading,
      setters.setCurrentWork,
      setters.setError,
      createMockSettings()
    );

    expect(handled).toBe(true);
    expect(setters.setIsLoading).toHaveBeenCalledWith(false);
    expect(setters.setLoadingStatus).toHaveBeenCalledWith('Stopped by user');
    expect(setters.setError).not.toHaveBeenCalled();
  });

  it('handles DOM AbortError as a user cancellation', () => {
    const setters = createSetters();

    const handled = handleSendMessageError(
      new DOMException('The operation was aborted.', 'AbortError'),
      undefined,
      setters.setLoadingStatus,
      setters.setIsPaused,
      setters.setIsLoading,
      setters.setCurrentWork,
      setters.setError,
      createMockSettings()
    );

    expect(handled).toBe(true);
    expect(setters.setIsLoading).toHaveBeenCalledWith(false);
    expect(setters.setLoadingStatus).toHaveBeenCalledWith('Stopped by user');
  });

  it('pauses the UI when a real error occurs after partial work exists', () => {
    const setters = createSetters();
    const latestWork: Work = { results: { [STEPS.INITIAL]: ['draft'] } };

    const handled = handleSendMessageError(
      new Error('Network failed'),
      latestWork,
      setters.setLoadingStatus,
      setters.setIsPaused,
      setters.setIsLoading,
      setters.setCurrentWork,
      setters.setError,
      createMockSettings({ debugMode: true })
    );

    expect(handled).toBe(false);
    expect(setters.setLoadingStatus).toHaveBeenCalledWith('Error: Friendly failure');
    expect(setters.setIsPaused).toHaveBeenCalledWith(true);
    expect(setters.setIsLoading).not.toHaveBeenCalled();
    expect(setters.setCurrentWork).not.toHaveBeenCalled();
    expect(setters.setError).not.toHaveBeenCalled();
  });

  it('cleans up loading state when a real error occurs before any partial work', () => {
    const setters = createSetters();

    const handled = handleSendMessageError(
      new Error('Network failed'),
      undefined,
      setters.setLoadingStatus,
      setters.setIsPaused,
      setters.setIsLoading,
      setters.setCurrentWork,
      setters.setError,
      createMockSettings()
    );

    expect(handled).toBe(false);
    expect(setters.setIsLoading).toHaveBeenCalledWith(false);
    expect(setters.setCurrentWork).toHaveBeenCalledWith(undefined);
    expect(setters.setError).toHaveBeenCalledWith('Friendly failure');
    expect(setters.setIsPaused).not.toHaveBeenCalled();
  });

  it('handles non-Error failures without expecting a stack trace', () => {
    const setters = createSetters();

    const handled = handleSendMessageError(
      'plain failure',
      undefined,
      setters.setLoadingStatus,
      setters.setIsPaused,
      setters.setIsLoading,
      setters.setCurrentWork,
      setters.setError,
      createMockSettings()
    );

    expect(handled).toBe(false);
    expect(setters.setError).toHaveBeenCalledWith('Friendly failure');
  });
});
