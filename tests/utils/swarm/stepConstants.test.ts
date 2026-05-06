import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STEPS } from '@/types/steps';
import { Work } from '@/types';
import {
  getStepConfig,
  getWorkNames,
  handleSynthesisJump,
  setWorkName,
} from '@/utils/swarm/stepConstants';

const loggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@shared/utils/logger', () => ({
  Logger: class {
    debug = vi.fn();
    info = loggerInfo;
    warn = vi.fn();
    error = vi.fn();
  },
}));

describe('stepConstants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStepConfig', () => {
    it('returns the initial-step contract', () => {
      const config = getStepConfig(STEPS.INITIAL);

      expect(config).toMatchObject({
        namePrefix: 'Agent',
        roleKey: 'roles',
        namesKey: 'agentNames',
        errorPrefix: 'Agent failed to complete',
        progressMsg: 'Drafting initial responses...',
        name: 'Initial Step',
        allowPause: true,
        pauseSettingKey: 'pauseAfterInitial',
      });
      expect(config.labels).toEqual({
        working: 'Drafting...',
        done: 'Drafted',
        error: 'Draft Failed',
        waiting: 'Waiting...',
      });
    });

    it('returns the refinement-step contract', () => {
      const config = getStepConfig(STEPS.REFINEMENT);

      expect(config).toMatchObject({
        namePrefix: 'Critic',
        roleKey: 'criticRoles',
        namesKey: 'criticNames',
        errorPrefix: 'Critic failed to refine',
        progressMsg: 'Refining and critiquing answers...',
        name: 'Refinement Step',
        allowPause: true,
        pauseSettingKey: 'pauseAfterRefinement',
      });
      expect(config.labels).toEqual({
        working: 'Refining...',
        done: 'Refined',
        error: 'Refinement Failed',
        waiting: 'Waiting...',
      });
    });

    it('returns the synthesis-step contract', () => {
      const config = getStepConfig(STEPS.SYNTHESIS);

      expect(config).toMatchObject({
        namePrefix: 'Synthesizer',
        roleKey: 'roles',
        namesKey: null,
        errorPrefix: 'Synthesis failed',
        progressMsg: 'Synthesizing final response...',
        name: 'Synthesis Step',
        synthesisJump: true,
      });
      expect(config.allowPause).toBeUndefined();
      expect(config.pauseSettingKey).toBeUndefined();
    });
  });

  describe('getWorkNames', () => {
    it('returns agent names for the initial step', () => {
      const work: Work = { agentNames: ['Agent 1'] };

      expect(getWorkNames(work, STEPS.INITIAL)).toBe(work.agentNames);
    });

    it('returns critic names for the refinement step', () => {
      const work: Work = { criticNames: ['Critic 1'] };

      expect(getWorkNames(work, STEPS.REFINEMENT)).toBe(work.criticNames);
    });

    it('returns undefined for synthesis', () => {
      expect(getWorkNames({ agentNames: ['Agent 1'] }, STEPS.SYNTHESIS)).toBeUndefined();
    });
  });

  describe('setWorkName', () => {
    it('immutably updates an initial agent name', () => {
      const work: Work = { agentNames: ['Agent 1', 'Agent 2'], criticNames: ['Critic 1'] };

      const updated = setWorkName(work, STEPS.INITIAL, 1, 'Updated Agent');

      expect(updated).not.toBe(work);
      expect(updated.agentNames).toEqual(['Agent 1', 'Updated Agent']);
      expect(updated.criticNames).toBe(work.criticNames);
      expect(work.agentNames).toEqual(['Agent 1', 'Agent 2']);
    });

    it('immutably updates a refinement critic name', () => {
      const work: Work = { agentNames: ['Agent 1'], criticNames: ['Critic 1', 'Critic 2'] };

      const updated = setWorkName(work, STEPS.REFINEMENT, 0, 'Updated Critic');

      expect(updated).not.toBe(work);
      expect(updated.criticNames).toEqual(['Updated Critic', 'Critic 2']);
      expect(updated.agentNames).toBe(work.agentNames);
      expect(work.criticNames).toEqual(['Critic 1', 'Critic 2']);
    });

    it('creates and sparsely extends missing name arrays', () => {
      const updated = setWorkName({}, STEPS.INITIAL, 2, 'Agent 3');

      expect(updated.agentNames).toHaveLength(3);
      expect(updated.agentNames?.[0]).toBeUndefined();
      expect(updated.agentNames?.[1]).toBeUndefined();
      expect(updated.agentNames?.[2]).toBe('Agent 3');
    });

    it('returns the original work reference for synthesis', () => {
      const work: Work = { agentNames: ['Agent 1'] };

      expect(setWorkName(work, STEPS.SYNTHESIS, 0, 'Ignored')).toBe(work);
    });
  });

  describe('handleSynthesisJump', () => {
    it('hides loading, logs, and calls onJump once', () => {
      const hideLoadingIndicator = vi.fn();
      const onJump = vi.fn();

      handleSynthesisJump(hideLoadingIndicator, onJump);

      expect(loggerInfo).toHaveBeenCalledWith('SYNTHESIS JUMP - First chunk received, hiding LoadingIndicator');
      expect(hideLoadingIndicator).toHaveBeenCalledTimes(1);
      expect(onJump).toHaveBeenCalledTimes(1);
    });

    it('works without an optional onJump callback', () => {
      const hideLoadingIndicator = vi.fn();

      expect(() => handleSynthesisJump(hideLoadingIndicator)).not.toThrow();
      expect(hideLoadingIndicator).toHaveBeenCalledTimes(1);
    });
  });
});
