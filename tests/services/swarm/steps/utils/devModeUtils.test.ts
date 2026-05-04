import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDevModeText, simulateStreaming } from '@/services/swarm/steps/utils/devModeUtils';
import { STEPS } from '@/types';

describe('getDevModeText', () => {
  it('returns initial step text with one-based agent numbering', () => {
    expect(getDevModeText(STEPS.INITIAL)).toContain('Agent 1');
    expect(getDevModeText(STEPS.INITIAL, 2)).toContain('Agent 3');
  });

  it('returns refinement step text with one-based critic numbering', () => {
    expect(getDevModeText(STEPS.REFINEMENT)).toContain('Critic 1');
    expect(getDevModeText(STEPS.REFINEMENT, 1)).toContain('Critic 2');
  });

  it('returns synthesis step text without agent-specific numbering', () => {
    const text = getDevModeText(STEPS.SYNTHESIS, 4);

    expect(text).toContain('Final Synthesized Answer');
    expect(text).toContain('Conclusion');
    expect(text).not.toContain('Agent 5');
  });
});

describe('simulateStreaming', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams accumulated text word by word and returns trimmed final text', async () => {
    vi.useFakeTimers();
    const onChunk = vi.fn();
    const controller = new AbortController();

    const promise = simulateStreaming('alpha beta gamma', {
      totalDurationMs: 30,
      signal: controller.signal,
      onChunk,
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(onChunk).toHaveBeenLastCalledWith('alpha ');

    await vi.advanceTimersByTimeAsync(10);
    expect(onChunk).toHaveBeenLastCalledWith('alpha beta ');

    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toBe('alpha beta gamma');
    expect(onChunk).toHaveBeenLastCalledWith('alpha beta gamma ');
    expect(onChunk).toHaveBeenCalledTimes(3);
  });

  it('throws before streaming when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(simulateStreaming('alpha beta', {
      signal: controller.signal,
      onChunk: vi.fn(),
    })).rejects.toThrow('Aborted');
  });

  it('throws before the next chunk when the signal is aborted from a chunk callback', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onChunk = vi.fn(() => {
      controller.abort();
    });

    const promise = simulateStreaming('alpha beta', {
      totalDurationMs: 20,
      signal: controller.signal,
      onChunk,
    });
    const rejection = expect(promise).rejects.toThrow('Aborted');

    await vi.advanceTimersByTimeAsync(10);
    expect(onChunk).toHaveBeenCalledWith('alpha ');
    await rejection;
    expect(onChunk).toHaveBeenCalledTimes(1);
  });
});
