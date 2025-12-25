import { Work, AgentState } from '@/types';
import { StepId } from '@/types/steps';

export type DisplayStatus = 'working' | 'done' | 'error' | 'waiting';

export interface WorkModalData {
  title: string;
  content: string;
}

export interface DebugModalData {
  title: string;
  debugInfo: any;
}

export interface ThoughtModalData {
  title: string;
  content: string;
}

export interface ShowWorkProps {
  work: Work;
  isLive?: boolean;
  liveAgentStates?: AgentState[];
  onRegenerate?: (stepId: StepId, agentIndex: number) => void;
}
