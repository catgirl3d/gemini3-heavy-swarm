import { type StepId, type WorkResultUpdates } from '@/types';

type LiveWorkSyncBufferEntry = {
  pendingUpdates: WorkResultUpdates | null;
  timerId: ReturnType<typeof setTimeout> | null;
  hasFlushedVisibleText: boolean;
};

interface LiveWorkSyncBufferOptions {
  throttleMs?: number;
  onFlush: (messageId: string, stepId: StepId, agentIndex: number, updates: WorkResultUpdates) => void;
}

export class LiveWorkSyncBuffer {
  private readonly entries = new Map<string, LiveWorkSyncBufferEntry>();
  private readonly throttleMs: number;
  private readonly onFlush: LiveWorkSyncBufferOptions['onFlush'];

  constructor(options: LiveWorkSyncBufferOptions) {
    this.throttleMs = options.throttleMs ?? 75;
    this.onFlush = options.onFlush;
  }

  buffer(
    messageId: string,
    stepId: StepId,
    agentIndex: number,
    updates: WorkResultUpdates,
    options?: { forceImmediate?: boolean },
  ): void {
    const syncKey = this.getKey(messageId, stepId, agentIndex);
    const entry = this.entries.get(syncKey) ?? {
      pendingUpdates: null,
      timerId: null,
      hasFlushedVisibleText: false,
    };

    entry.pendingUpdates = this.mergeUpdates(entry.pendingUpdates, updates);

    const shouldFlushImmediately = options?.forceImmediate === true
      || (!entry.hasFlushedVisibleText && this.hasVisibleText(entry.pendingUpdates));

    if (shouldFlushImmediately) {
      this.flushEntry(messageId, stepId, agentIndex, entry);
      return;
    }

    if (!entry.pendingUpdates) {
      this.entries.delete(syncKey);
      return;
    }

    if (!entry.timerId) {
      entry.timerId = setTimeout(() => {
        this.flush(messageId, stepId, agentIndex);
      }, this.throttleMs);
    }

    this.entries.set(syncKey, entry);
  }

  flush(messageId: string, stepId: StepId, agentIndex: number): void {
    const syncKey = this.getKey(messageId, stepId, agentIndex);
    const entry = this.entries.get(syncKey);
    if (!entry) {
      return;
    }

    this.flushEntry(messageId, stepId, agentIndex, entry);
  }

  discard(messageId: string, stepId: StepId, agentIndex: number): void {
    const syncKey = this.getKey(messageId, stepId, agentIndex);
    const entry = this.entries.get(syncKey);
    if (!entry) {
      return;
    }

    if (entry.timerId) {
      clearTimeout(entry.timerId);
    }

    this.entries.delete(syncKey);
  }

  discardStep(messageId: string, stepId: StepId): void {
    const stepPrefix = `${messageId}:${stepId}:`;
    for (const [syncKey, entry] of this.entries.entries()) {
      if (!syncKey.startsWith(stepPrefix)) {
        continue;
      }

      if (entry.timerId) {
        clearTimeout(entry.timerId);
      }

      this.entries.delete(syncKey);
    }
  }

  private getKey(messageId: string, stepId: StepId, agentIndex: number): string {
    return `${messageId}:${stepId}:${agentIndex}`;
  }

  private mergeUpdates(
    current: WorkResultUpdates | null,
    updates: WorkResultUpdates,
  ): WorkResultUpdates {
    const merged: WorkResultUpdates = current ? { ...current } : {};

    if (Object.prototype.hasOwnProperty.call(updates, 'text')) {
      merged.text = updates.text;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'thought')) {
      merged.thought = updates.thought;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'usage')) {
      merged.usage = updates.usage;
    }

    return merged;
  }

  private hasVisibleText(updates: WorkResultUpdates | null): boolean {
    return typeof updates?.text === 'string' && updates.text.length > 0;
  }

  private flushEntry(
    messageId: string,
    stepId: StepId,
    agentIndex: number,
    entry: LiveWorkSyncBufferEntry,
  ): void {
    if (entry.timerId) {
      clearTimeout(entry.timerId);
    }

    entry.timerId = null;

    if (!entry.pendingUpdates) {
      this.entries.delete(this.getKey(messageId, stepId, agentIndex));
      return;
    }

    const updates = entry.pendingUpdates;
    entry.pendingUpdates = null;
    entry.hasFlushedVisibleText = entry.hasFlushedVisibleText || this.hasVisibleText(updates);

    this.onFlush(messageId, stepId, agentIndex, updates);

    this.entries.set(this.getKey(messageId, stepId, agentIndex), entry);
  }
}
