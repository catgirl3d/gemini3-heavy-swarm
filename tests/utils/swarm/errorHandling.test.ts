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

const createHandlers = () => ({
  onAborted: vi.fn(),
  onPartialFailure: vi.fn(),
  onTotalFailure: vi.fn(),
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
    const handlers = createHandlers();

    const handled = handleSendMessageError(
      new Error('Aborted'),
      undefined,
      handlers,
      createMockSettings()
    );

    expect(handled).toBe(true);
    expect(handlers.onAborted).toHaveBeenCalledTimes(1);
    expect(handlers.onPartialFailure).not.toHaveBeenCalled();
    expect(handlers.onTotalFailure).not.toHaveBeenCalled();
  });

  it('handles DOM AbortError as a user cancellation', () => {
    const handlers = createHandlers();

    const handled = handleSendMessageError(
      new DOMException('The operation was aborted.', 'AbortError'),
      undefined,
      handlers,
      createMockSettings()
    );

    expect(handled).toBe(true);
    expect(handlers.onAborted).toHaveBeenCalledTimes(1);
  });

  it('pauses the UI when a real error occurs after partial work exists', () => {
    const handlers = createHandlers();
    const latestWork: Work = { results: { [STEPS.INITIAL]: ['draft'] } };

    const handled = handleSendMessageError(
      new Error('Network failed'),
      latestWork,
      handlers,
      createMockSettings({ debugMode: true })
    );

    expect(handled).toBe(false);
    expect(handlers.onPartialFailure).toHaveBeenCalledWith('Friendly failure');
    expect(handlers.onAborted).not.toHaveBeenCalled();
    expect(handlers.onTotalFailure).not.toHaveBeenCalled();
  });

  it('cleans up loading state when a real error occurs before any partial work', () => {
    const handlers = createHandlers();

    const handled = handleSendMessageError(
      new Error('Network failed'),
      undefined,
      handlers,
      createMockSettings()
    );

    expect(handled).toBe(false);
    expect(handlers.onTotalFailure).toHaveBeenCalledWith('Friendly failure');
    expect(handlers.onAborted).not.toHaveBeenCalled();
    expect(handlers.onPartialFailure).not.toHaveBeenCalled();
  });

  it('handles non-Error failures without expecting a stack trace', () => {
    const handlers = createHandlers();

    const handled = handleSendMessageError(
      'plain failure',
      undefined,
      handlers,
      createMockSettings()
    );

    expect(handled).toBe(false);
    expect(handlers.onTotalFailure).toHaveBeenCalledWith('Friendly failure');
  });
});
