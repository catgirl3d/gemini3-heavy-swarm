import { describe, it, expect, vi } from 'vitest';
import { AgentState } from '@/types';
import { STEPS } from '@/types/steps';
import { 
  getErroredAgents, 
  isAnyAgentWorking, 
  isErrorState, 
  getContinueButtonText,
  getContinueButtonState,
  handleContinueClick 
} from '@/utils/swarm/continueHelpers';

describe('continueHelpers', () => {
  const mockAgents: AgentState[] = [
    {
      id: '1',
      stepId: STEPS.INITIAL,
      agentIndex: 0,
      status: 'done',
      label: 'Completed',
      name: 'Agent 1',
      messageId: 'msg-1'
    },
    {
      id: '2',
      stepId: STEPS.INITIAL,
      agentIndex: 1,
      status: 'error',
      label: 'Failed',
      name: 'Agent 2',
      messageId: 'msg-1'
    },
    {
      id: '3',
      stepId: STEPS.REFINEMENT,
      agentIndex: 0,
      status: 'working',
      label: 'Processing',
      name: 'Critic 1',
      messageId: 'msg-2'
    }
  ];

  describe('getErroredAgents', () => {
    it('should return all errored agents when no messageId provided', () => {
      const result = getErroredAgents(mockAgents);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter errored agents by messageId', () => {
      const result = getErroredAgents(mockAgents, 'msg-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should return empty array when no errored agents match messageId', () => {
      const result = getErroredAgents(mockAgents, 'msg-2');
      expect(result).toHaveLength(0);
    });
  });

  describe('isAnyAgentWorking', () => {
    it('should return true when any agent is working', () => {
      expect(isAnyAgentWorking(mockAgents)).toBe(true);
    });

    it('should filter by messageId', () => {
      expect(isAnyAgentWorking(mockAgents, 'msg-2')).toBe(true);
      expect(isAnyAgentWorking(mockAgents, 'msg-1')).toBe(false);
    });

    it('should return false when no agents are working', () => {
      const nonWorkingAgents = mockAgents.filter(a => a.status !== 'working');
      expect(isAnyAgentWorking(nonWorkingAgents)).toBe(false);
    });
  });

  describe('isErrorState', () => {
    it('should return true when there are errored agents and none working', () => {
      const agents = mockAgents.filter(a => a.messageId === 'msg-1');
      expect(isErrorState(agents, 'msg-1')).toBe(true);
    });

    it('should return false when agents are working even with errors', () => {
      expect(isErrorState(mockAgents, 'msg-2')).toBe(false);
    });

    it('should return false when no errored agents', () => {
      const agents = mockAgents.filter(a => a.status === 'done');
      expect(isErrorState(agents, undefined)).toBe(false);
    });

    it('should return false when no errors and no working agents', () => {
      const agents = mockAgents.filter(a => a.status === 'done');
      expect(isErrorState(agents, undefined)).toBe(false);
    });
  });

  describe('getContinueButtonText', () => {
    it('should return "Retry" when isError is true', () => {
      expect(getContinueButtonText(true)).toBe('Retry');
    });

    it('should return "Continue" when isError is false', () => {
      expect(getContinueButtonText(false)).toBe('Continue');
    });
  });

  describe('getContinueButtonState', () => {
    it('shows Continue for awaiting-user phase with no active workers', () => {
      const agents = mockAgents.filter(agent => agent.messageId === 'msg-1' && agent.status !== 'error');

      expect(getContinueButtonState({
        phase: 'awaiting-user',
        agentStates: agents,
        messageId: 'msg-1',
        work: { results: { [STEPS.SYNTHESIS]: [''] } },
        hasContinueCallback: true,
        hasRegenerateCallback: false,
      })).toMatchObject({
        visible: true,
        label: 'Continue',
      });
    });

    it('shows Retry for recoverable-error phase and hides terminal phases', () => {
      const retryState = getContinueButtonState({
        phase: 'recoverable-error',
        agentStates: mockAgents,
        messageId: 'msg-1',
        work: { results: { [STEPS.SYNTHESIS]: [''] } },
        hasContinueCallback: false,
        hasRegenerateCallback: true,
      });
      const streamingState = getContinueButtonState({
        phase: 'streaming-final',
        agentStates: mockAgents,
        messageId: 'msg-1',
        work: { results: { [STEPS.SYNTHESIS]: [''] } },
        hasContinueCallback: true,
        hasRegenerateCallback: true,
      });

      expect(retryState).toMatchObject({ visible: true, label: 'Retry' });
      expect(streamingState.visible).toBe(false);
    });

    it('hides action when synthesis is complete', () => {
      expect(getContinueButtonState({
        phase: 'awaiting-user',
        agentStates: [{ ...mockAgents[0], stepId: STEPS.SYNTHESIS, status: 'done' }],
        messageId: 'msg-1',
        work: { results: { [STEPS.SYNTHESIS]: ['final'] } },
        hasContinueCallback: true,
        hasRegenerateCallback: false,
      }).visible).toBe(false);
    });
  });

  describe('handleContinueClick', () => {
    it('should call onRegenerate for each errored agent', () => {
      const onRegenerate = vi.fn();
      const onContinue = vi.fn();
      
      handleContinueClick(mockAgents, 'msg-1', onContinue, onRegenerate);
      
      expect(onRegenerate).toHaveBeenCalledTimes(1);
      expect(onRegenerate).toHaveBeenCalledWith(STEPS.INITIAL, 1);
      expect(onContinue).not.toHaveBeenCalled();
    });

    it('should call onContinue when no errored agents', () => {
      const onRegenerate = vi.fn();
      const onContinue = vi.fn();
      const agents = mockAgents.filter(a => a.status !== 'error');
      
      handleContinueClick(agents, undefined, onContinue, onRegenerate);
      
      expect(onContinue).toHaveBeenCalledTimes(1);
      expect(onRegenerate).not.toHaveBeenCalled();
    });

    it('should call onContinue when errored agents exist but no onRegenerate provided', () => {
      const onContinue = vi.fn();
      
      handleContinueClick(mockAgents, 'msg-1', onContinue);
      
      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when no callbacks provided', () => {
      // Should not throw
      expect(() => {
        handleContinueClick(mockAgents, undefined);
      }).not.toThrow();
    });
  });
});
