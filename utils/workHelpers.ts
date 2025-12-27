import { Work, TokenUsage, AgentState } from '@/types';
import { StepId } from '@/types/steps';

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
 * Safely extracts synthesis thought (single value, not an array).
 * 
 * @param work - The Work object containing synthesis metadata
 * @returns The synthesis thought string, or null if not available or not a string.
 */
export function getSynthesisThought(work: Work): string | null {
  const raw = work.results?.['synthesis_step_thought' as keyof NonNullable<Work['results']>];
  return typeof raw === 'string' ? raw : null;
}

/**
 * Safely extracts synthesis token usage (single value, not an array).
 * 
 * @param work - The Work object containing synthesis metadata
 * @returns The synthesis token usage object, or null if not available or invalid structure.
 */
export function getSynthesisUsage(work: Work): TokenUsage | null {
  const raw = work.results?.['synthesis_step_usage' as keyof NonNullable<Work['results']>];
  return raw && typeof raw === 'object' && 'totalTokens' in raw ? raw as TokenUsage : null;
}

/**
 * Safely extracts synthesis result (can be string or object with text/error/sources).
 * 
 * @param work - The Work object containing synthesis results
 * @returns The synthesis result as either:
 *          - A string (legacy format)
 *          - An object with optional text, error, and sources properties
 *          - null if not available
 */
export function getSynthesisResult(work: Work): { text?: string; error?: boolean } | string | null {
  const raw = work.results?.['synthesis_step' as keyof NonNullable<Work['results']>];
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && ('text' in raw || 'error' in raw)) {
    return raw as { text?: string; error?: boolean };
  }
  return null;
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
 * @param agentIndex - Agent index (ignored for synthesis_step)
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
  
  let updatedStepData: unknown;
  
  if (stepId === 'synthesis_step') {
    const existing = currentResults[stepId];
    // Explicit array check prevents incorrect spreading if existing is an array (legacy bug)
    const base = existing && typeof existing === 'object' && !Array.isArray(existing) 
      ? (existing as Record<string, unknown>) 
      : {};
    updatedStepData = { ...base, text };
  } else {
    const currentArray = (currentResults[stepId] as string[] | undefined) ?? [];
    const newArray = [...currentArray];
    newArray[agentIndex] = text;
    updatedStepData = newArray;
  }

  return {
    ...work,
    results: {
      ...currentResults,
      [stepId]: updatedStepData
    }
  };
}
