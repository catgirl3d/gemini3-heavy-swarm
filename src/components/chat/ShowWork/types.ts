import { Work, AgentState, StepDebugInfo } from '@/types';
import { StepId } from '@/types/steps';

export interface WorkModalData {
  title: string;
  content: string;
}

export interface DebugModalData {
  title: string;
  debugInfo: StepDebugInfo | undefined;
}

export interface ThoughtModalData {
  title: string;
  content: string;
}

export interface ShowWorkProps {
  work: Work;
  isLive?: boolean;
  messageId?: string;
  isPaused?: boolean;
  onContinue?: () => void;
  onRegenerate?: (stepId: StepId, agentIndex: number) => void;
}
