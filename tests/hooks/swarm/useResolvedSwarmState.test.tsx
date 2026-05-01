import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResolvedAgentState, useResolvedSwarmState } from '@/hooks/swarm/useResolvedSwarmState';
import { useAgentStore } from '@/stores/agentStore';
import type { AgentState, Work } from '@/types';
import { STEPS } from '@/types/steps';

const resetAgentStore = () => {
  useAgentStore.getState().abortAll();
  useAgentStore.setState({
    ...useAgentStore.getInitialState(),
    abortControllers: new Map(),
  }, true);
};

const createAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Agent 1',
  status: 'done',
  label: 'Done',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'message-1',
  ...overrides,
});

const createWork = (overrides: Partial<Work> = {}): Work => ({
  agentStates: [],
  ...overrides,
});

describe('useResolvedSwarmState', () => {
  beforeEach(() => {
    resetAgentStore();
  });

  it('prefers live agent state over the historical snapshot for the same message/step/index', () => {
    const snapshotAgent = createAgent({ status: 'error', label: 'Failed' });
    const liveAgent = createAgent({ status: 'working', label: 'Working' });
    useAgentStore.getState().hydrate([liveAgent]);

    const { result } = renderHook(() => useResolvedAgentState(
      'message-1',
      STEPS.INITIAL,
      0,
      createWork({ agentStates: [snapshotAgent] })
    ));

    expect(result.current).toMatchObject({
      messageId: 'message-1',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      status: 'working',
      label: 'Working',
    });
  });

  it('falls back to work.agentStates when live state is missing or belongs to another message', () => {
    useAgentStore.getState().hydrate([
      createAgent({ messageId: 'other-message', status: 'working', label: 'Other working' }),
    ]);
    const snapshotAgent = createAgent({ messageId: 'snapshot-message', status: 'done', label: 'Snapshot done' });

    const { result } = renderHook(() => useResolvedAgentState(
      'message-1',
      STEPS.INITIAL,
      0,
      createWork({ agentStates: [snapshotAgent] })
    ));

    expect(result.current).toMatchObject({
      status: 'done',
      label: 'Snapshot done',
      messageId: 'snapshot-message',
    });
  });

  it('resolves synthesizer state from live store, while refinementStarted can fall back to snapshot', () => {
    const liveSynth = createAgent({
      id: 'synth-live',
      name: 'Synthesizer',
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
      messageId: 'message-1',
      status: 'working',
      label: 'Synthesizing',
    });
    useAgentStore.getState().hydrate([liveSynth]);
    const work = createWork({
      agentStates: [
        createAgent({
          id: 'refine-snapshot',
          stepId: STEPS.REFINEMENT,
          agentIndex: 1,
          messageId: 'snapshot-message',
          status: 'done',
          label: 'Refined',
        }),
        createAgent({
          id: 'synth-snapshot',
          stepId: STEPS.SYNTHESIS,
          agentIndex: 0,
          messageId: 'snapshot-message',
          status: 'error',
          label: 'Snapshot synth',
        }),
      ],
    });

    const { result } = renderHook(() => useResolvedSwarmState('message-1', work));

    expect(result.current.synthesizerState).toMatchObject({
      id: 'synth-live',
      messageId: 'message-1',
      status: 'working',
    });
    expect(result.current.refinementStarted).toBe(true);
    expect(result.current.isEarlyStageWorking).toBe(false);
  });

  it('treats only live initial/refinement working agents for the same message as early-stage work', () => {
    useAgentStore.getState().hydrate([
      createAgent({ id: 'initial-working', stepId: STEPS.INITIAL, messageId: 'message-1', status: 'working', label: 'Drafting' }),
      createAgent({ id: 'synth-working', stepId: STEPS.SYNTHESIS, messageId: 'message-1', status: 'working', label: 'Synthesizing' }),
      createAgent({ id: 'other-message', stepId: STEPS.REFINEMENT, messageId: 'other-message', status: 'working', label: 'Other refine' }),
    ]);

    const { result } = renderHook(() => useResolvedSwarmState('message-1', createWork()));

    expect(result.current.isEarlyStageWorking).toBe(true);
    expect(result.current.refinementStarted).toBe(false);
    expect(result.current.synthesizerState).toMatchObject({
      id: 'synth-working',
      stepId: STEPS.SYNTHESIS,
    });
  });

  it('returns falsy fallbacks when neither live nor historical state is available', () => {
    const { result } = renderHook(() => useResolvedSwarmState(undefined, createWork()));

    expect(result.current.synthesizerState).toBeUndefined();
    expect(result.current.refinementStarted).toBe(false);
    expect(result.current.isEarlyStageWorking).toBe(false);
  });
});
