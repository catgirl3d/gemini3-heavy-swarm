import { Work, AgentState } from '@/types';
import { StepId } from '@/types/steps';

/**
 * Pre-calculated results optimization structure.
 * Used to pass already-computed work results to avoid redundant parsing.
 */
export interface PrecalculatedResults {
  initial?: (string | null)[];
  refined?: (string | null)[];
  synthesis?: { text?: string; error?: boolean } | string | null;
}

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
  liveAgentStates?: AgentState[];
  onRegenerate?: (stepId: StepId, agentIndex: number) => void;
}
