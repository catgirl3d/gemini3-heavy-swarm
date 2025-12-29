import { StepId, STEPS } from '@/types/steps';
import { Work } from '@/types';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('SynthesisJump', true);

/**
 * Centralized configuration for step-specific behavior.
 * Eliminates scattered if-else chains for stepId across the codebase.
 */

export interface StepConfig {
  /** Display prefix for agent names (e.g., "Agent", "Critic") */
  namePrefix: string;
  /** Key to access role definitions in RoleProfile */
  roleKey: 'roles' | 'criticRoles';
  /** Key to access agent names in Work object */
  namesKey: 'agentNames' | 'criticNames' | null;
  /** Default status labels */
  labels: {
    working: string;
    done: string;
    error: string;
    waiting: string;
  };
  /** Error message prefix for system messages */
  errorPrefix: string;
  /** Content error detection pattern */
  errorPattern: string;
  /** Status message for agent updates */
  progressMsg: string;
  /** Formal name of the step */
  name: string;
  /** Detailed description of the step */
  description: string;
  /** Whether this step should trigger a "jump" behavior in UI when text arrives */
  synthesisJump?: boolean;
  /** Whether pausing is allowed after this step */
  allowPause?: boolean;
  /** Key in AppSettings that controls whether to pause after this step */
  pauseSettingKey?: 'pauseAfterInitial' | 'pauseAfterRefinement';
}

const STEP_CONFIGS: Record<StepId, StepConfig> = {
  [STEPS.INITIAL]: {
    namePrefix: 'Agent',
    roleKey: 'roles',
    namesKey: 'agentNames',
    labels: {
      working: 'Drafting...',
      done: 'Drafted',
      error: 'Draft Failed',
      waiting: 'Waiting...'
    },
    errorPrefix: 'Agent failed to complete',
    errorPattern: '[System: Agent failed to complete.',
    progressMsg: 'Drafting initial responses...',
    name: 'Initial Step',
    description: 'Agents draft their initial responses based on the user query.',
    allowPause: true,
    pauseSettingKey: 'pauseAfterInitial'
  },
  [STEPS.REFINEMENT]: {
    namePrefix: 'Critic',
    roleKey: 'criticRoles',
    namesKey: 'criticNames',
    labels: {
      working: 'Refining...',
      done: 'Refined',
      error: 'Refinement Failed',
      waiting: 'Waiting...'
    },
    errorPrefix: 'Critic failed to refine',
    errorPattern: '[System: Critic failed to refine.',
    progressMsg: 'Refining and critiquing answers...',
    name: 'Refinement Step',
    description: 'Agents critique and refine their responses based on other agents\' inputs.',
    allowPause: true,
    pauseSettingKey: 'pauseAfterRefinement'
  },
  [STEPS.SYNTHESIS]: {
    namePrefix: 'Synthesizer',
    roleKey: 'roles', // Not used for synthesis
    namesKey: null,
    labels: {
      working: 'Synthesizing...',
      done: 'Synthesized',
      error: 'Synthesis Failed',
      waiting: 'Waiting...'
    },
    errorPrefix: 'Synthesis failed',
    errorPattern: '[System: Synthesis failed.',
    progressMsg: 'Synthesizing final response...',
    name: 'Synthesis Step',
    description: 'Synthesizes all refined responses into a final answer.',
    synthesisJump: true
  }
};

/**
 * Returns the configuration for a specific step.
 */
export function getStepConfig(stepId: StepId): StepConfig {
  return STEP_CONFIGS[stepId];
}

/**
 * Returns agent names array from Work based on stepId.
 */
export function getWorkNames(work: Work, stepId: StepId): string[] | undefined {
  const config = STEP_CONFIGS[stepId];
  if (!config.namesKey) return undefined;
  return work[config.namesKey] as string[] | undefined;
}

/**
 * Returns updated Work with new agent name at index.
 */
export function setWorkName(work: Work, stepId: StepId, index: number, name: string): Work {
  const config = STEP_CONFIGS[stepId];
  if (!config.namesKey) return work;
  
  const currentNames = (work[config.namesKey] as string[]) || [];
  const newNames = [...currentNames];
  newNames[index] = name;
  
  return { ...work, [config.namesKey]: newNames };
}

/**
 * Checks if content contains an error pattern for this step.
 */
export function hasStepContentError(content: string | null | undefined, stepId: StepId): boolean {
  if (!content) return false;
  return content.includes(STEP_CONFIGS[stepId].errorPattern);
}

/**
 * Shared logic for the "Synthesis Jump" behavior.
 * This hides loading indicators and unpauses the UI when the first chunk of synthesis arrives.
 * Consolidated from synthesisHelpers.ts.
 * 
 * @param setIsLoading - State setter for loading status
 * @param setIsPaused - State setter for pause status
 * @param onJump - Optional callback for additional jump logic (e.g., updating agent status)
 */
export function handleSynthesisJump(
  setIsLoading: (b: boolean) => void,
  setIsPaused: (b: boolean) => void,
  onJump?: () => void
) {
  logger.info('SYNTHESIS JUMP - First chunk received, hiding LoadingIndicator');
  setIsLoading(false);
  setIsPaused(false);
  onJump?.();
}
