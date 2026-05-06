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
