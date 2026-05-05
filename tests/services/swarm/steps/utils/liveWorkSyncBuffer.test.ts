import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STEPS, type StepId, type WorkResultUpdates } from '@/types';
import { LiveWorkSyncBuffer } from '@/services/swarm/steps/utils/liveWorkSyncBuffer';

describe('LiveWorkSyncBuffer', () => {
  let onFlush: ReturnType<typeof vi.fn<(messageId: string, stepId: StepId, agentIndex: number, updates: WorkResultUpdates) => void>>;
  let buffer: LiveWorkSyncBuffer;

  beforeEach(() => {
    vi.useFakeTimers();
    onFlush = vi.fn<(messageId: string, stepId: StepId, agentIndex: number, updates: WorkResultUpdates) => void>();
    buffer = new LiveWorkSyncBuffer({ throttleMs: 75, onFlush });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers non-visible updates until the throttle window ends', () => {
    const updates: WorkResultUpdates = {
      thought: 'reasoning',
      usage: { totalTokens: 7, promptTokens: 3, candidatesTokens: 4 },
    };

    buffer.buffer('msg-1', STEPS.INITIAL, 0, updates);

    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(74);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('msg-1', STEPS.INITIAL, 0, updates);
  });

  it('flushes the first visible text chunk immediately and merges pending updates', () => {
    buffer.buffer('msg-1', STEPS.INITIAL, 0, {
      thought: 'reasoning',
      usage: { totalTokens: 7, promptTokens: 3, candidatesTokens: 4 },
    });

    vi.advanceTimersByTime(50);
    buffer.buffer('msg-1', STEPS.INITIAL, 0, { text: 'visible text' });

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('msg-1', STEPS.INITIAL, 0, {
      text: 'visible text',
      thought: 'reasoning',
      usage: { totalTokens: 7, promptTokens: 3, candidatesTokens: 4 },
    });

    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('throttles subsequent visible text updates after the first flush', () => {
    buffer.buffer('msg-1', STEPS.INITIAL, 0, { text: 'first chunk' });

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenLastCalledWith('msg-1', STEPS.INITIAL, 0, { text: 'first chunk' });

    buffer.buffer('msg-1', STEPS.INITIAL, 0, { text: 'first chunk plus more' });
    expect(onFlush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(75);

    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenLastCalledWith('msg-1', STEPS.INITIAL, 0, { text: 'first chunk plus more' });
  });

  it('discards pending step updates without affecting other steps', () => {
    buffer.buffer('msg-1', STEPS.INITIAL, 0, { thought: 'drop me' });
    buffer.buffer('msg-1', STEPS.REFINEMENT, 0, { thought: 'keep me' });

    buffer.discardStep('msg-1', STEPS.INITIAL);
    vi.advanceTimersByTime(75);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('msg-1', STEPS.REFINEMENT, 0, { thought: 'keep me' });
  });
});
