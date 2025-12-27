import { AppSettings, Message, AgentState, Work } from '@/types';
import { StepId, STEPS } from '@/types/steps';
import { Logger } from '@/utils/common/logger';
import { getStepConfig } from '@/utils/swarm/stepConstants';
import { findTargetMessageIndex } from '@/utils/chat/messageHelpers';
import { updateTargetMessage } from '@/utils/chat/messageUpdaters';
import { handleSynthesisJump, getSynthesisWorkingLabel } from '@/utils/swarm/synthesisHelpers';
import {
  getStepLabels, 
  calculateUpdatedStateForRegeneration 
} from '@/utils/swarm/regenerationHelpers';
import { withEnsuredResults, updateStepWithError } from '@/utils/swarm/workHelpers';
import { getFriendlyErrorMessage, getErrorLabel } from '@/services/swarm/steps/utils/errorUtils';
import { GeminiService } from '@/services/swarm/GeminiService';
import { useAbortController } from '@/hooks/network/useAbortController';

interface RegenerationDependencies {
  settings: AppSettings;
  messages: Message[];
  messagesRef: React.RefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  agentStates: AgentState[];
  currentWork: Work | undefined;
  isLoading: boolean;
  isPaused: boolean;
  setIsLoading: (b: boolean) => void;
  setIsPaused: (b: boolean) => void;
  setLoadingStatus: (s: string) => void;
  setAgentStates: (a: AgentState[]) => void;
  setCurrentWork: (w: Work | undefined) => void;
  updateAgentStatus: (
    messageIndex: number,
    stepId: StepId,
    agentIndex: number,
    status: AgentState['status'],
    label: string,
    settings: AppSettings
  ) => void;
  regenAbort: ReturnType<typeof useAbortController>;
  geminiServiceRef: React.RefObject<GeminiService>;
  lastInput: { text: string, image: string | null, imageFile: File | null } | null;
}

export function useSwarmRegeneration({
  settings,
  messages,
  messagesRef,
  setMessages,
  agentStates,
  currentWork,
  isLoading,
  isPaused,
  setIsLoading,
  setIsPaused,
  setLoadingStatus,
  setAgentStates,
  setCurrentWork,
  updateAgentStatus,
  regenAbort,
  geminiServiceRef,
  lastInput
}: RegenerationDependencies) {

  const regenerateAgentResponse = async (messageIndex: number, stepId: StepId, agentIndex: number) => {
    const logger = new Logger('Synthesis', settings.debugMode);
    logger.debug('regenerateAgentResponse start:', { messageIndex, stepId, agentIndex });
    if (!lastInput) return;

    const targetMessage = messages[messageIndex];
    let workContext = targetMessage?.work || currentWork;
    if (!workContext) return;

    const syncStatus = (status: AgentState['status'], label: string) => 
      updateAgentStatus(messageIndex, stepId, agentIndex, status, label, settings);

    const controller = regenAbort.create();

    // Capture initial state to restore later if needed
    const initialLoading = isLoading;
    const initialPaused = isPaused;

    // Start loading state (but NOT for synthesis - it will hide on first chunk)
    if (stepId !== STEPS.SYNTHESIS) {
      setIsLoading(true);
    }
    
    // Unpause to allow work to proceed
    if (stepId !== STEPS.SYNTHESIS) {
      setIsPaused(false);
    }

    // Capture latest agent states from progress updates to use in finalization
    let latestAgentStates: AgentState[] = agentStates || [];

    try {      
      const labels = getStepLabels(stepId);
      // Only set working status immediately for non-synthesis steps
      if (stepId !== STEPS.SYNTHESIS) {
        syncStatus('working', labels.regenerating);
      }
      const history = messages.slice(0, messageIndex);

      if (!geminiServiceRef.current) {
        throw new Error('GeminiService not initialized');
      }

      const result = await geminiServiceRef.current.regenerateResponse(
        settings,
        lastInput.text,
        lastInput.image,
        lastInput.imageFile,
        history,
        agentIndex,
        stepId,
        workContext,
        (text, isFirstChunk) => {
          setMessages(prev => {
            const { updatedMessages, updatedWork } = calculateUpdatedStateForRegeneration(
              prev,
              messageIndex,
              stepId,
              agentIndex,
              workContext,
              text,
              settings,
              isFirstChunk,
              () => {
                handleSynthesisJump(setIsLoading, setIsPaused, () => {
                  syncStatus('working', getSynthesisWorkingLabel());
                });
              }
            );

            if (updatedWork) {
              setCurrentWork(updatedWork);
            }
            
            return updatedMessages;
          });
        },
        (status, agents, work) => {
          latestAgentStates = agents; // Capture latest agents
          setLoadingStatus(status);
          setAgentStates(agents);
          setCurrentWork({ ...work, agentStates: agents });
        },
        controller.signal
      );

      // Handle final result
      if (typeof result === 'object' && result !== null && 'sources' in result) {
         setMessages(prev => {
           const workToUpdate = prev[messageIndex]?.work || workContext || currentWork;
           const updatedWork = workToUpdate ? (() => {
             const ensuredWork = withEnsuredResults(workToUpdate);
             return {
               ...ensuredWork,
               results: { ...ensuredWork.results, [stepId]: result }
             };
           })() : undefined;
           
           const updated = updateTargetMessage(prev, messageIndex, stepId, {
             sources: result.sources,
             work: updatedWork
           }, { workContext, currentWork });
           
           return updated ?? prev;
         });

        setCurrentWork(prev => {
          if (!prev || !prev.results) return prev;
          return {
            ...prev,
            results: { ...prev.results, [stepId]: result }
          };
        });
      }

      syncStatus('done', labels.done);

      if (stepId === STEPS.SYNTHESIS) {
        const logger = new Logger('Synthesis', settings.debugMode);
        logger.debug('Synthesis regeneration logic complete');
        
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsgIndex = newMessages.length - 1;
          const lastMsg = newMessages[lastMsgIndex];
          
          if (lastMsg && lastMsg.role === 'model') {
            const workToUse = lastMsg.work || currentWork;
            if (workToUse) {
              const updatedAgentStates = (latestAgentStates || workToUse.agentStates || agentStates || []).map(agent => {
                if (agent.id === 'synthesizer_agent') {
                  return { ...agent, status: 'done' as const, label: labels.done, stepId: STEPS.SYNTHESIS as StepId };
                }
                return agent;
              });
              newMessages[lastMsgIndex] = { ...lastMsg, work: { ...workToUse, agentStates: updatedAgentStates } };
            }
          }
          
          return newMessages;
        });
        setCurrentWork(undefined);
      }
    } catch (error) {
       const logger = new Logger('Regeneration', settings.debugMode);
      logger.error(`Regeneration failed for step ${stepId}, agent ${agentIndex}:`, error);
      const errorLabel = getErrorLabel(error, 'Regeneration Failed');
      syncStatus('error', errorLabel);
      
      const errorMessage = getFriendlyErrorMessage(error);
      
      setMessages(prev => {
        const workToUpdate = prev[messageIndex]?.work || workContext || currentWork;
        const updatedWork = workToUpdate ? updateStepWithError(workToUpdate, stepId, agentIndex, errorMessage) : undefined;
        const config = getStepConfig(stepId);
        const errorText = `[System: ${config.errorPrefix}. ${errorMessage}]`;
        
        const updated = updateTargetMessage(prev, messageIndex, stepId, {
          parts: [{ text: errorText }],
          work: updatedWork
        }, { workContext, currentWork });
        
        return updated ?? prev;
      });
      
      setCurrentWork(prev => 
        prev ? updateStepWithError(prev, stepId, agentIndex, errorMessage) : prev
      );
    } finally {
      // RESTORE STATE LOGIC (only for non-synthesis steps)
      if (stepId !== STEPS.SYNTHESIS) {
        setIsLoading(initialLoading);
        setIsPaused(initialPaused);
      }
    }
  };

  return { regenerateAgentResponse };
}
