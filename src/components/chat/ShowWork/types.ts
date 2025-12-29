import { Work, AgentState } from '@/types';
import { StepId } from '@/types/steps';

export interface WorkModalData {
  title: string;
  content: string;
}

export interface DebugModalData {
  title: string;
  debugInfo: unknown;
}

export interface ThoughtModalData {
  title: string;
  content: string;
}

export interface ShowWorkProps {
  work: Work;
  isLive?: boolean;
  messageId?: string;
  onRegenerate?: (stepId: StepId, agentIndex: number) => void;
}
