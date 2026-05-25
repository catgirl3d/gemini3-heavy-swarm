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
    useAgentStore.getState().replaceSessionAgents('message-1', [liveAgent]);

    const { result } = renderHook(() => useResolvedAgentState(
      'message-1',
      STEPS.INITIAL,
      0,
      createWork({ agentStates: [snapshotAgent] }),
      true,
    ));

    expect(result.current).toMatchObject({
      messageId: 'message-1',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      status: 'working',
      label: 'Working',
    });
  });

  it('does not fall back to work.agentStates when live state is missing or belongs to another message', () => {
    useAgentStore.getState().replaceSessionAgents('other-message', [
      createAgent({ messageId: 'other-message', status: 'working', label: 'Other working' }),
    ]);
    const snapshotAgent = createAgent({ messageId: 'snapshot-message', status: 'done', label: 'Snapshot done' });

    const { result } = renderHook(() => useResolvedAgentState(
      'message-1',
      STEPS.INITIAL,
      0,
      createWork({ agentStates: [snapshotAgent] }),
      true,
    ));

    expect(result.current).toBeUndefined();
  });

  it('resolves synthesizer and refinement state from live store only in live mode', () => {
    const liveSynth = createAgent({
      id: 'synth-live',
      name: 'Synthesizer',
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
      messageId: 'message-1',
      status: 'working',
      label: 'Synthesizing',
    });
    useAgentStore.getState().replaceSessionAgents('message-1', [liveSynth]);
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

    const { result } = renderHook(() => useResolvedSwarmState('message-1', work, true));

    expect(result.current.synthesizerState).toMatchObject({
      id: 'synth-live',
      messageId: 'message-1',
      status: 'working',
    });
    expect(result.current.refinementStarted).toBe(false);
    expect(result.current.isEarlyStageWorking).toBe(false);
  });

  it('treats only live initial/refinement working agents for the same message as early-stage work', () => {
    useAgentStore.getState().replaceSessionAgents('message-1', [
      createAgent({ id: 'initial-working', stepId: STEPS.INITIAL, messageId: 'message-1', status: 'working', label: 'Drafting' }),
      createAgent({ id: 'synth-working', stepId: STEPS.SYNTHESIS, messageId: 'message-1', status: 'working', label: 'Synthesizing' }),
    ]);
    useAgentStore.getState().replaceSessionAgents('other-message', [
      createAgent({ id: 'other-message', stepId: STEPS.REFINEMENT, messageId: 'other-message', status: 'working', label: 'Other refine' }),
    ]);

    const { result } = renderHook(() => useResolvedSwarmState('message-1', createWork(), true));

    expect(result.current.isEarlyStageWorking).toBe(true);
    expect(result.current.refinementStarted).toBe(false);
    expect(result.current.synthesizerState).toMatchObject({
      id: 'synth-working',
      stepId: STEPS.SYNTHESIS,
    });
  });

  it('returns falsy fallbacks when neither live nor historical state is available', () => {
    const { result } = renderHook(() => useResolvedSwarmState(undefined, createWork(), false));

    expect(result.current.synthesizerState).toBeUndefined();
    expect(result.current.refinementStarted).toBe(false);
    expect(result.current.isEarlyStageWorking).toBe(false);
  });

  it('keeps historical reads snapshot-only even if a matching session still exists', () => {
    const liveAgent = createAgent({ status: 'working', label: 'Live working' });
    const snapshotAgent = createAgent({ status: 'done', label: 'Snapshot done' });
    const snapshotSynth = createAgent({
      id: 'snapshot-synth',
      stepId: STEPS.SYNTHESIS,
      agentIndex: 0,
      status: 'done',
      label: 'Snapshot synth done',
    });
    const snapshotRefine = createAgent({
      id: 'snapshot-refine',
      stepId: STEPS.REFINEMENT,
      agentIndex: 1,
      status: 'done',
      label: 'Snapshot refine done',
    });
    useAgentStore.getState().startSession('message-1', { results: {} }, {
      agentStates: [liveAgent],
      phase: 'awaiting-user',
    });
    useAgentStore.getState().setActiveSession(undefined);

    const { result: agentResult } = renderHook(() => useResolvedAgentState(
      'message-1',
      STEPS.INITIAL,
      0,
      createWork({ agentStates: [snapshotAgent] }),
      false,
    ));

    expect(agentResult.current).toMatchObject({
      status: 'done',
      label: 'Snapshot done',
    });

    const { result: swarmResult } = renderHook(() => useResolvedSwarmState(
      'message-1',
      createWork({ agentStates: [snapshotAgent, snapshotSynth, snapshotRefine] }),
      false,
    ));

    expect(swarmResult.current.synthesizerState).toMatchObject({
      id: 'snapshot-synth',
      status: 'done',
    });
    expect(swarmResult.current.refinementStarted).toBe(true);
    expect(swarmResult.current.isEarlyStageWorking).toBe(false);
  });
});
