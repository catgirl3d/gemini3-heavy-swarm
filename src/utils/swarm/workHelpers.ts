import { type Work, type TokenUsage, type AgentState, type WorkStepMetadata, type WorkStepStatus, type DebugInfo, type StepDebugInfo, type Source, type SynthesisErrorState } from '@/types';
import { type StepId, STEPS } from '@/types/steps';
import { getStepConfig } from '@/utils/swarm/stepConstants';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const cloneResultEntry = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(entry => cloneResultEntry(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, cloneResultEntry(entryValue)])
    );
  }

  return value;
};

const hasVisibleStepContent = (work: Work, stepId: StepId): boolean => {
  return getStepResults(work, stepId).some(result => typeof result === 'string' && result.length > 0);
};

export const markAgentStatesForSteps = (
  agentStates: AgentState[] | undefined,
  stepIds: Set<StepId>,
): AgentState[] | undefined => {
  if (!agentStates || stepIds.size === 0) {
    return agentStates ? agentStates.map(agent => ({ ...agent })) : undefined;
  }

  return agentStates.map(agent => {
    if (!agent.stepId || !stepIds.has(agent.stepId)) {
      return { ...agent };
    }

    return {
      ...agent,
      status: 'stale',
      label: getStepConfig(agent.stepId).labels.stale,
    };
  });
};

/**
 * Safely extracts array-based results for a specific step from the Work object.
 * Centralizes the logic to avoid duplication and manual runtime checks in UI/Services.
 * 
 * @param work - The Work object containing step results
 * @param stepId - The step identifier (e.g., 'initial_step', 'refinement_step')
 * @returns Array of results (string | null). Always returns an array, never null.
 *          Returns empty array [] if data is missing or not an array.
 */
export function getStepResults(work: Work, stepId: StepId): (string | null)[] {
  const raw = work.results?.[stepId as keyof NonNullable<Work['results']>];
  return Array.isArray(raw) ? (raw as (string | null)[]) : [];
}

/**
 * Safely extracts displayable content for any step.
 */
export function getStepContent(
  work: Work | undefined,
  stepId: StepId,
  agentIndex: number
): string | null {
  if (!work) return null;

  const result = getStepResults(work, stepId)[agentIndex];
  return typeof result === 'string' ? result : null;
}

/**
 * Safely extracts thought process data for a specific step.
 * 
 * @param work - The Work object containing step metadata
 * @param stepId - The step identifier
 * @returns Array of thoughts (string | null). Always returns an array, never null.
 *          Returns empty array [] if data is missing or not an array.
 *          Array length may differ from results array - always use optional chaining when accessing by index.
 */
export function getStepThoughts(work: Work, stepId: StepId): (string | null)[] {
  const key = `${stepId}_thoughts` as keyof NonNullable<Work['results']>;
  const raw = work.results?.[key];
  return Array.isArray(raw) ? (raw as (string | null)[]) : [];
}

/**
 * Safely extracts token usage data for a specific step.
 * 
 * @param work - The Work object containing step metadata
 * @param stepId - The step identifier
 * @returns Array of token usage objects (TokenUsage | null). Always returns an array, never null.
 *          Returns empty array [] if data is missing or not an array.
 *          Array length may differ from results array - always use optional chaining when accessing by index.
 */
export function getStepUsage(work: Work, stepId: StepId): (TokenUsage | null)[] {
  const key = `${stepId}_usage` as keyof NonNullable<Work['results']>;
  const raw = work.results?.[key];
  return Array.isArray(raw) ? (raw as (TokenUsage | null)[]) : [];
}

/**
 * Safely extracts canonical synthesis text.
 */
export const getSynthesisText = (work: Work | undefined): string => {
  if (!work) return '';

  const synthesisText = getStepResults(work, STEPS.SYNTHESIS)[0];
  return typeof synthesisText === 'string' ? synthesisText : '';
};

/**
 * Safely extracts synthesis sources sidecar.
 */
export function getSynthesisSources(work: Work | undefined): Source[] | undefined {
  const raw = work?.results?.[`${STEPS.SYNTHESIS}_sources` as keyof NonNullable<Work['results']>];
  return Array.isArray(raw) ? raw as Source[] : undefined;
}

/**
 * Safely extracts synthesis error sidecar.
 */
export function getSynthesisErrorState(work: Work | undefined): SynthesisErrorState | null {
  const raw = work?.results?.[`${STEPS.SYNTHESIS}_error` as keyof NonNullable<Work['results']>];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !('flag' in raw) || raw.flag !== true) {
    return null;
  }

  if ('message' in raw && raw.message !== undefined && typeof raw.message !== 'string') {
    return null;
  }

  return raw as SynthesisErrorState;
}

export function getStepMeta(work: Work | undefined, stepId: StepId): WorkStepMetadata | undefined {
  return work?.stepMetadata?.find(meta => meta.id === stepId);
}

export function setStepMetaStatus(
  work: Work,
  stepId: StepId,
  status: WorkStepStatus,
  options?: {
    label?: string;
    staleFromStepId?: StepId;
  }
): Work {
  const nextWork = cloneWork(work);
  const existingMeta = getStepMeta(nextWork, stepId);
  const nextMeta: WorkStepMetadata = {
    id: stepId,
    label: options?.label ?? existingMeta?.label,
    status,
    ...(status === 'stale' && options?.staleFromStepId ? { staleFromStepId: options.staleFromStepId } : {}),
  };

  if (!nextWork.stepMetadata) {
    nextWork.stepMetadata = [nextMeta];
    return nextWork;
  }

  const metaIndex = nextWork.stepMetadata.findIndex(meta => meta.id === stepId);
  if (metaIndex >= 0) {
    nextWork.stepMetadata[metaIndex] = nextMeta;
  } else {
    nextWork.stepMetadata.push(nextMeta);
  }

  return nextWork;
}

export function getDownstreamSteps(stepId: StepId): StepId[] {
  switch (stepId) {
    case STEPS.INITIAL:
      return [STEPS.REFINEMENT, STEPS.SYNTHESIS];
    case STEPS.REFINEMENT:
      return [STEPS.SYNTHESIS];
    case STEPS.SYNTHESIS:
    default:
      return [];
  }
}

export function markDownstreamStale(work: Work, changedStepId: StepId): Work {
  const staleStepIds = new Set<StepId>();
  const nextWork = getDownstreamSteps(changedStepId).reduce((currentWork, downstreamStepId) => {
    const meta = getStepMeta(currentWork, downstreamStepId);
    const shouldMarkStale = hasVisibleStepContent(currentWork, downstreamStepId)
      || meta?.status === 'done'
      || meta?.status === 'error'
      || meta?.status === 'stale';

    if (!shouldMarkStale) {
      return currentWork;
    }

    staleStepIds.add(downstreamStepId);
    return setStepMetaStatus(currentWork, downstreamStepId, 'stale', {
      label: meta?.label,
      staleFromStepId: changedStepId,
    });
  }, cloneWork(work));

  return {
    ...nextWork,
    ...(nextWork.agentStates ? { agentStates: markAgentStatesForSteps(nextWork.agentStates, staleStepIds) } : {}),
  };
}

export function snapshotWorkWithAgents(work: Work, agentStates: AgentState[]): Work {
  return {
    ...cloneWork(work),
    agentStates: agentStates.map(agent => ({ ...agent })),
  };
}

/**
 * Returns a Work object with guaranteed initialized results.
 * Pure function - does not mutate the input.
 * 
 * @param work - The source Work object
 * @returns Work object with initialized results (may be the same object if results already exist)
 */
export function withEnsuredResults(work: Work): Work & { results: NonNullable<Work['results']> } {
  if (work.results) return work as Work & { results: NonNullable<Work['results']> };
  return { ...work, results: {} };
}

/**
 * Returns a new Work object with updated step result.
 * Pure function - does not mutate the input.
 * 
 * @param work - The source Work object (not modified)
 * @param stepId - The step identifier
 * @param agentIndex - Agent index
 * @param text - The text content to store
 * @returns New Work object with updated results
 */
export function updateStepResult(
  work: Work,
  stepId: StepId,
  agentIndex: number,
  text: string
): Work {
  const currentResults = work.results ?? {};
  const currentArray = Array.isArray(currentResults[stepId])
    ? [...currentResults[stepId] as (string | null)[]]
    : [];
  const newArray = [...currentArray];
  newArray[agentIndex] = text;

  return {
    ...work,
    results: {
      ...currentResults,
      [stepId]: newArray
    }
  };
}

/**
 * Perform an atomic update of multiple components of an agent's work (text, thought, usage).
 * Pure function - returns a new Work object.
 */
export function updateAgentWork(
  work: Work,
  stepId: StepId,
  agentIndex: number,
  updates: {
    text?: string;
    thought?: string;
    usage?: TokenUsage | null;
  }
): Work {
  const results: NonNullable<Work['results']> = {
    ...(work.results ?? {}),
  };
  const nextWork: Work = {
    ...work,
    results,
    // Step metadata is still mutated in-place in step execution code, so keep it detached
    // from the previous Work snapshot even while we structurally share other unchanged fields.
    stepMetadata: work.stepMetadata ? work.stepMetadata.map(meta => ({ ...meta })) : undefined,
  };
  const currentStepResult = results[stepId];
  const thoughtsKey = `${stepId}_thoughts`;
  const usageKey = `${stepId}_usage`;
  const numAgents = Math.max(
    Array.isArray(currentStepResult) ? currentStepResult.length : 0,
    agentIndex + 1
  );

  // 1. Update Text
  if (updates.text !== undefined) {
    const arr: (string | null)[] = Array.isArray(results[stepId])
      ? [...results[stepId] as (string | null)[]]
      : Array<string | null>(numAgents).fill('');
    arr[agentIndex] = updates.text;
    results[stepId] = arr;
  }

  // 2. Update Thoughts
  if (updates.thought !== undefined) {
    const arr: (string | null)[] = Array.isArray(results[thoughtsKey])
      ? [...results[thoughtsKey] as (string | null)[]]
      : Array<string | null>(numAgents).fill('');
    arr[agentIndex] = updates.thought;
    results[thoughtsKey] = arr;
  }

  // 3. Update Usage
  if (updates.usage !== undefined) {
    const arr: (TokenUsage | null)[] = Array.isArray(results[usageKey])
      ? [...results[usageKey] as (TokenUsage | null)[]]
      : Array<TokenUsage | null>(numAgents).fill(null);
    arr[agentIndex] = updates.usage;
    results[usageKey] = arr;
  }

  return nextWork;
}


/**
 * Clones Work snapshot data to prevent accidental mutations of persisted state.
 * Recursively clones plain-data payloads inside results/debugInfo while leaving non-plain
 * references intact.
 *
 * @param work - The source Work object
 * @returns A new Work object with cloned nested structures
 */
export function cloneWork(work: Work): Work {
  const clonedResults = work.results
    ? Object.fromEntries(
        Object.entries(work.results).map(([key, value]) => [key, cloneResultEntry(value)])
      )
    : undefined;

  return {
    ...work,
    results: clonedResults,
    debugInfo: work.debugInfo
      ? Object.fromEntries(
          Object.entries(work.debugInfo).map(([key, value]) => [key, cloneResultEntry(value) as StepDebugInfo | StepDebugInfo[]])
        ) as DebugInfo
      : undefined,
    agentStates: work.agentStates ? work.agentStates.map(agent => ({ ...agent })) : undefined,
    stepMetadata: work.stepMetadata ? work.stepMetadata.map(meta => ({ ...meta })) : undefined,
    agentNames: work.agentNames ? [...work.agentNames] : undefined,
    criticNames: work.criticNames ? [...work.criticNames] : undefined,
  };
}

/**
 * Determines if the Synthesis step is complete.
 * Prefers stepMetadata if available, falls back to agentStates.
 * This ensures consistent behavior across all UI components.
 * 
 * @param work - The Work object containing step metadata
 * @param agentStates - Array of agent states from the store
 * @returns true if synthesis is complete, false otherwise
 */
export function isSynthesisComplete(
  work: Work | undefined,
  agentStates: AgentState[]
): boolean {
  // Primary source: stepMetadata (persisted in history)
  const metaStatus = work?.stepMetadata?.find(m => m.id === STEPS.SYNTHESIS)?.status;
  if (metaStatus) return metaStatus === 'done';
  
  // Fallback: live agentStates (for active generations)
  return agentStates.some(a => a.stepId === STEPS.SYNTHESIS && a.status === 'done');
}
