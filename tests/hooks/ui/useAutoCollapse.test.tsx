import { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AgentState } from '@/types';
import { useAutoCollapse } from '@/hooks/ui/useAutoCollapse';

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

type AutoCollapseTestProps = {
  isLive: boolean;
  isCurrentMessage: boolean;
  messageId: string;
  synthesizerState: AgentState | undefined;
  isEarlyStageWorking: boolean;
  synthesisText: string | null;
};

const createSynthesizerState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'synthesizer',
  name: 'Synthesizer',
  status: 'working',
  label: 'Synthesizing...',
  messageId: 'message-1',
  ...overrides,
});

const createProps = (overrides: Partial<AutoCollapseTestProps> = {}): AutoCollapseTestProps => ({
  isLive: true,
  isCurrentMessage: false,
  messageId: 'message-1',
  synthesizerState: createSynthesizerState(),
  isEarlyStageWorking: false,
  synthesisText: 'final answer',
  ...overrides,
});

const createDetailsRef = (open: boolean): RefObject<HTMLDetailsElement> => {
  const details = document.createElement('details');
  details.open = open;
  return { current: details };
};

const renderAutoCollapse = (
  props: AutoCollapseTestProps,
  detailsRef: RefObject<HTMLDetailsElement> = createDetailsRef(true)
) => renderHook(
  (currentProps: AutoCollapseTestProps) => {
    useAutoCollapse({ detailsRef, ...currentProps });
    return detailsRef;
  },
  { initialProps: props }
);

describe('useAutoCollapse', () => {
  it('collapses open details when all conditions are true', () => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps(), detailsRef);

    expect(detailsRef.current?.open).toBe(false);
  });

  it('does not collapse when details is already closed', () => {
    const detailsRef = createDetailsRef(false);

    renderAutoCollapse(createProps(), detailsRef);
    expect(detailsRef.current?.open).toBe(false);
  });

  it('does not collapse when the session is inactive and message id does not match', () => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps({
      isLive: false,
      isCurrentMessage: false,
      synthesizerState: createSynthesizerState({ messageId: 'other-message' }),
    }), detailsRef);

    expect(detailsRef.current?.open).toBe(true);
  });

  it('collapses when inactive flags are false but synthesizer message id matches', () => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps({
      isLive: false,
      isCurrentMessage: false,
      synthesizerState: createSynthesizerState({ messageId: 'message-1' }),
    }), detailsRef);

    expect(detailsRef.current?.open).toBe(false);
  });

  it.each(['waiting', 'done', 'error'] as const)('does not collapse when synthesizer status is %s', (status) => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps({
      synthesizerState: createSynthesizerState({ status }),
    }), detailsRef);

    expect(detailsRef.current?.open).toBe(true);
  });

  it('does not collapse when synthesizer state is undefined', () => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps({ synthesizerState: undefined }), detailsRef);
    expect(detailsRef.current?.open).toBe(true);
  });

  it('does not collapse while early-stage work is still running', () => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps({ isEarlyStageWorking: true }), detailsRef);
    expect(detailsRef.current?.open).toBe(true);
  });

  it.each([null, ''])('does not collapse when synthesis text is %s', (synthesisText) => {
    const detailsRef = createDetailsRef(true);

    renderAutoCollapse(createProps({ synthesisText }), detailsRef);
    expect(detailsRef.current?.open).toBe(true);
  });

  it('collapses on rerender when conditions become matching', () => {
    const detailsRef = createDetailsRef(true);
    const { rerender } = renderAutoCollapse(createProps({
      isLive: false,
      isCurrentMessage: false,
      synthesizerState: createSynthesizerState({ messageId: 'other-message' }),
    }), detailsRef);

    expect(detailsRef.current?.open).toBe(true);

    rerender(createProps({
      isLive: false,
      isCurrentMessage: false,
      synthesizerState: createSynthesizerState({ messageId: 'message-1' }),
    }));

    expect(detailsRef.current?.open).toBe(false);
  });

  it('does not throw when detailsRef.current is null', () => {
    const detailsRef = { current: null } as RefObject<HTMLDetailsElement>;

    expect(() => renderAutoCollapse(createProps(), detailsRef)).not.toThrow();
  });
});
