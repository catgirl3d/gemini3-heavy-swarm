import { describe, expect, it } from 'vitest';
import type { Work } from '@/types';
import { STEPS } from '@/types/steps';
import { markDownstreamStale } from '@/utils/swarm/workHelpers';

const createCompletedWork = (): Work => ({
  results: {
    [STEPS.INITIAL]: ['draft 1', 'draft 2'],
    [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
    [STEPS.SYNTHESIS]: ['final answer'],
  },
  stepMetadata: [
    { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
    { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
    { id: STEPS.SYNTHESIS, status: 'done', label: 'Synthesis Step' },
  ],
  agentStates: [
    { id: 'initial-0', name: 'Agent 1', status: 'done', label: 'Drafted', stepId: STEPS.INITIAL, agentIndex: 0, messageId: 'msg-1' },
    { id: 'initial-1', name: 'Agent 2', status: 'done', label: 'Drafted', stepId: STEPS.INITIAL, agentIndex: 1, messageId: 'msg-1' },
    { id: 'refine-0', name: 'Critic 1', status: 'done', label: 'Refined', stepId: STEPS.REFINEMENT, agentIndex: 0, messageId: 'msg-1' },
    { id: 'refine-1', name: 'Critic 2', status: 'done', label: 'Refined', stepId: STEPS.REFINEMENT, agentIndex: 1, messageId: 'msg-1' },
    { id: 'synth-0', name: 'Synthesizer', status: 'done', label: 'Synthesized', stepId: STEPS.SYNTHESIS, agentIndex: 0, messageId: 'msg-1' },
  ],
});

describe('workHelpers markDownstreamStale', () => {
  it('marks downstream completed steps as stale without clearing their content', () => {
    const nextWork = markDownstreamStale(createCompletedWork(), STEPS.INITIAL);

    expect(nextWork.results?.[STEPS.REFINEMENT]).toEqual(['refined 1', 'refined 2']);
    expect(nextWork.results?.[STEPS.SYNTHESIS]).toEqual(['final answer']);
    expect(nextWork.stepMetadata?.find(meta => meta.id === STEPS.REFINEMENT)).toMatchObject({
      status: 'stale',
      staleFromStepId: STEPS.INITIAL,
    });
    expect(nextWork.stepMetadata?.find(meta => meta.id === STEPS.SYNTHESIS)).toMatchObject({
      status: 'stale',
      staleFromStepId: STEPS.INITIAL,
    });
    expect(nextWork.agentStates?.filter(agent => agent.stepId === STEPS.REFINEMENT).map(agent => agent.status)).toEqual(['stale', 'stale']);
    expect(nextWork.agentStates?.filter(agent => agent.stepId === STEPS.REFINEMENT).map(agent => agent.label)).toEqual(['Stale', 'Stale']);
    expect(nextWork.agentStates?.find(agent => agent.stepId === STEPS.SYNTHESIS)?.status).toBe('stale');
    expect(nextWork.agentStates?.find(agent => agent.stepId === STEPS.SYNTHESIS)?.label).toBe('Stale');
  });

  it('keeps pending downstream steps pending when they do not have prior results', () => {
    const pausedWork: Work = {
      results: {
        [STEPS.INITIAL]: ['draft 1', 'draft 2'],
        [STEPS.REFINEMENT]: ['refined 1', 'refined 2'],
        [STEPS.SYNTHESIS]: [''],
      },
      stepMetadata: [
        { id: STEPS.INITIAL, status: 'done', label: 'Initial Step' },
        { id: STEPS.REFINEMENT, status: 'done', label: 'Refinement Step' },
        { id: STEPS.SYNTHESIS, status: 'pending', label: 'Synthesis Step' },
      ],
    };

    const nextWork = markDownstreamStale(pausedWork, STEPS.REFINEMENT);

    expect(nextWork.stepMetadata?.find(meta => meta.id === STEPS.SYNTHESIS)).toMatchObject({
      status: 'pending',
      label: 'Synthesis Step',
    });
  });
});
