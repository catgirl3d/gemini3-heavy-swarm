export interface PromptProfile {
  id: string;
  name: string;
  initialInstruction: string;
  refinementInstruction: string;
  synthesizerInstruction: string;
}

export interface AgentRole {
  name: string;
  instruction: string;
}

export interface RoleProfile {
    id: string;
    name: string;
    roles: AgentRole[];
    criticRoles?: AgentRole[];
}

/** Pipeline step identifiers. Note: 'refinement_step' is distinct from 'refinement_prompt' InstructionType */
export const STEPS = {
  INITIAL: 'initial_step',
  REFINEMENT: 'refinement_step',
  SYNTHESIS: 'synthesis_step'
} as const;

export type StepId = typeof STEPS[keyof typeof STEPS];

/**
 * Constants for prompt instruction types.
 * Used for saved instructions and settings UI.
 */
export const PROMPT_TYPES = {
  INITIAL: 'initial_prompt',
  REFINEMENT: 'refinement_prompt',
  SYNTHESIS: 'synthesis_prompt'
} as const;

export type PromptTypeId = typeof PROMPT_TYPES[keyof typeof PROMPT_TYPES];

export interface SavedInstruction {
    id: string;
    name: string;
    /** Instruction types for UI/settings. Note: 'refinement_prompt' differs from StepId 'refinement_step' */
    type: PromptTypeId;
    content: string;
}

/**
 * Legacy instruction format from older versions of the application.
 * Used during migration to properly type-cast old data.
 */
export interface LegacySavedInstruction {
    id: string;
    name: string;
    type: 'initial' | 'refinement' | 'synthesizer'; // Old type names
    content: string;
}

export interface SavedRole {
    id: string;
    name: string;
    instruction: string;
}

export type SimulateError = 'none' | '429' | '500' | '503' | 'timeout';

export interface AppSettings {
  numAgents: number;
  apiKey?: string;
  model: string;
  activeProfileId: string;
  profiles: PromptProfile[];
  devMode: boolean;
  debugMode: boolean;
  simulateSynthesisError: SimulateError; // Error simulation for testing
  pauseAfterInitial: boolean;
  pauseAfterRefinement: boolean;
  temperature: number;
  unsafeTemperature?: boolean;
  dynamicAgentRoles: boolean;
  activeRoleProfileId: string;
  roleProfiles: RoleProfile[];
  savedInstructions: SavedInstruction[];
  savedRoles: SavedRole[];
}

export interface Source {
  uri: string;
  title: string;
}

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

/**
 * Type-safe keys for accessing work.results.
 * Prevents typos and ensures only valid result keys are used.
 */
export type WorkResultKey = 
  | typeof STEPS.INITIAL 
  | typeof STEPS.REFINEMENT 
  | typeof STEPS.SYNTHESIS
  | `${typeof STEPS.INITIAL}_thoughts`
  | `${typeof STEPS.REFINEMENT}_thoughts`
  | `${typeof STEPS.SYNTHESIS}_thought`
  | `${typeof STEPS.INITIAL}_usage`
  | `${typeof STEPS.REFINEMENT}_usage`
  | `${typeof STEPS.SYNTHESIS}_usage`;

export interface Work {
  // Generic storage for step results. Keys match StepId (e.g., 'initial_step', 'refinement_step', 'synthesis_step')
  results?: {
    [STEPS.INITIAL]?: (string | null)[];
    [STEPS.REFINEMENT]?: (string | null)[];
    [STEPS.SYNTHESIS]?: { text?: string; error?: boolean; errorMessage?: string; sources?: Source[] };
    
    // Unified step metadata (thoughts, token usage, etc.)
    initial_step_thoughts?: (string | null)[];
    refinement_step_thoughts?: (string | null)[];
    synthesis_step_thought?: string | null;

    initial_step_usage?: (TokenUsage | null)[];
    refinement_step_usage?: (TokenUsage | null)[];
    synthesis_step_usage?: TokenUsage | null;
    
    // Index signature for dynamic step keys (StepRunner extensibility)
    [key: string]: unknown;
  };

  
  // Metadata about the steps that ran
  stepMetadata?: {
    id: string;
    status: 'pending' | 'working' | 'done';
    label?: string;
  }[];

  agentNames?: string[];
  criticNames?: string[];
  agentStates?: AgentState[];
  debugInfo?: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  parts: { text: string }[];
  image?: string;
  sources?: Source[];
  work?: Work;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'waiting' | 'working' | 'done' | 'error';
  label: string;
  stepId?: StepId; // Track which step this status belongs to
}

export interface ServerStatus {
  hasServerKey: boolean;
  proxyMode: string;
  isLoaded: boolean;
}
