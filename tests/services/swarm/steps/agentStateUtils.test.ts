import { describe, expect, it } from 'vitest';
import { createMockSettings } from '@test/settingsMocks';
import { STEPS } from '@/types/steps';
import { createAgentStates, updateAgentState, updateAgentStateById } from '@/services/swarm/steps/utils/agentStateUtils';
import type { AgentState } from '@/types';

const settings = createMockSettings({
  activeRoleProfileId: 'profile-1',
  roleProfiles: [{
    id: 'profile-1',
    name: 'Profile 1',
    roles: [{ id: 'drafter-1', name: 'Researcher', instruction: 'Research the topic' }],
    criticRoles: [{ id: 'critic-1', name: 'Reviewer', instruction: 'Review the answer' }],
  }],
});

const createState = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'msg-a-initial_step-agent-0',
  name: 'Agent 1 (Researcher)',
  status: 'waiting',
  label: 'Waiting...',
  stepId: STEPS.INITIAL,
  agentIndex: 0,
  messageId: 'msg-a',
  ...overrides,
});

describe('agentStateUtils', () => {
  it('creates scoped agent states with message ids and role-derived names', () => {
    const states = createAgentStates(2, settings, {
      stepId: STEPS.INITIAL,
      status: 'working',
      statusLabel: 'Drafting...',
      messageId: 'message-1',
    });

    expect(states).toEqual([
      expect.objectContaining({
        id: 'message-1-initial_step-agent-0',
        name: 'Agent 1 (Researcher)',
        status: 'working',
        label: 'Drafting...',
        stepId: STEPS.INITIAL,
        agentIndex: 0,
        messageId: 'message-1',
      }),
      expect.objectContaining({
        id: 'message-1-initial_step-agent-1',
        name: 'Agent 2 (Researcher)',
        agentIndex: 1,
        messageId: 'message-1',
      }),
    ]);
  });

  it('creates unscoped states when no message id is provided', () => {
    const states = createAgentStates(1, settings, {
      stepId: STEPS.REFINEMENT,
      status: 'done',
      statusLabel: 'Refined',
    });

    expect(states).toEqual([
      expect.objectContaining({
        id: 'refinement_step-agent-0',
        name: 'Critic 1 (Reviewer)',
        status: 'done',
        label: 'Refined',
        stepId: STEPS.REFINEMENT,
        agentIndex: 0,
        messageId: undefined,
      }),
    ]);
  });

  it('updates only the exact step/message match when both are provided', () => {
    const states = [
      createState({ id: 'msg-a-initial_step-agent-0', messageId: 'msg-a', label: 'Waiting A' }),
      createState({ id: 'msg-b-initial_step-agent-0', messageId: 'msg-b', label: 'Waiting B' }),
    ];

    const updated = updateAgentState(states, 0, {
      stepId: STEPS.INITIAL,
      messageId: 'msg-b',
      status: 'done',
      label: 'Done',
    });

    expect(updated[0]).toMatchObject({ messageId: 'msg-a', status: 'waiting', label: 'Waiting A' });
    expect(updated[1]).toMatchObject({ messageId: 'msg-b', status: 'done', label: 'Done' });
  });

  it('falls back to step-plus-index matching when message id is not supplied', () => {
    const states = [
      createState({ id: 'msg-a-initial_step-agent-0', stepId: STEPS.INITIAL, agentIndex: 0 }),
      createState({ id: 'msg-a-refinement_step-agent-0', stepId: STEPS.REFINEMENT, agentIndex: 0, name: 'Critic 1 (Reviewer)' }),
    ];

    const updated = updateAgentState(states, 0, {
      stepId: STEPS.REFINEMENT,
      status: 'working',
      label: 'Refining...',
    });

    expect(updated[0]).toMatchObject({ stepId: STEPS.INITIAL, status: 'waiting', label: 'Waiting...' });
    expect(updated[1]).toMatchObject({ stepId: STEPS.REFINEMENT, status: 'working', label: 'Refining...' });
  });

  it('falls back to raw array index matching and supports direct id updates', () => {
    const states = [
      createState({ id: 'agent-0', agentIndex: 0 }),
      createState({ id: 'agent-1', agentIndex: 1, status: 'working', label: 'Working...' }),
    ];

    const updatedByIndex = updateAgentState(states, 1, {
      status: 'error',
      label: 'Failed',
    });
    const updatedById = updateAgentStateById(updatedByIndex, 'agent-0', {
      status: 'done',
      label: 'Completed',
    });

    expect(updatedById[0]).toMatchObject({ id: 'agent-0', status: 'done', label: 'Completed' });
    expect(updatedById[1]).toMatchObject({ id: 'agent-1', status: 'error', label: 'Failed' });
  });
});
