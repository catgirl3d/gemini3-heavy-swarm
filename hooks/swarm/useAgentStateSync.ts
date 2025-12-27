import { useCallback } from 'react';
import { AgentState, Message, Work, AppSettings } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { getUpdatedAgentName } from '@/utils/agentHelpers';

/**
 * Hook to synchronize agent status updates across:
 * 1. Global agentStates (for the loading indicator)
 * 2. Message-specific work context (for history)
 * 3. Active currentWork (for live view)
 */
export function useAgentStateSync(
  setAgentStates: (value: React.SetStateAction<AgentState[]>) => void,
  setMessages: (value: React.SetStateAction<Message[]>) => void,
  setCurrentWork: (value: React.SetStateAction<Work | undefined>) => void
) {
  const updateAgentStatus = useCallback((
    messageIndex: number,
    stepId: StepId,
    agentIndex: number,
    status: AgentState['status'],
    label: string,
    settings: AppSettings
  ) => {
    const updateStates = (states: AgentState[] | undefined): AgentState[] | undefined => {
      if (!states) return states;
      const copy = [...states];

      if (stepId === STEPS.SYNTHESIS) {
        const synthIndex = copy.findIndex(a => a.id === 'synthesizer_agent');
        if (synthIndex >= 0) {
          copy[synthIndex] = { ...copy[synthIndex], status, label, stepId };
        }
      } else {
        if (copy[agentIndex]) {
          const newName = getUpdatedAgentName(agentIndex, stepId, settings);
          copy[agentIndex] = { ...copy[agentIndex], status, label, name: newName, stepId };
        }
      }

      return copy;
    };

    setAgentStates(prev => updateStates(prev) ?? prev);

    setMessages(prev => {
      const newMessages = [...prev];
      const msg = newMessages[messageIndex];
      // Note: synthesis step might have created a new message at +1 index
      // but updateAgentStatus is usually called with the ORIGINAL message index.
      // The logic here updates the message at messageIndex.
      if (msg && msg.work && msg.work.agentStates) {
        const updated = updateStates(msg.work.agentStates);
        if (updated) {
          newMessages[messageIndex] = { ...msg, work: { ...msg.work, agentStates: updated } };
        }
      }
      return newMessages;
    });

    setCurrentWork(prev => {
      if (!prev || !prev.agentStates) return prev;
      const updated = updateStates(prev.agentStates);
      return updated ? { ...prev, agentStates: updated } : prev;
    });
  }, [setAgentStates, setMessages, setCurrentWork]);

  return { updateAgentStatus };
}
