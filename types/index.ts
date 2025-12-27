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

export interface SavedInstruction {
    id: string;
    name: string;
    /** Instruction types for UI/settings. Note: 'refinement_prompt' differs from StepId 'refinement_step' */
    type: 'initial_prompt' | 'refinement_prompt' | 'synthesis_prompt';
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

export interface AppSettings {
  numAgents: number;
  apiKey?: string;
  model: string;
  activeProfileId: string;
  profiles: PromptProfile[];
  devMode: boolean;
  debugMode: boolean;
  simulateSynthesisError: 'none' | '429' | '500' | '503' | 'timeout'; // Error simulation for testing
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
  | 'initial_step' 
  | 'refinement_step' 
  | 'synthesis_step'
  | 'initial_step_thoughts'
  | 'refinement_step_thoughts'
  | 'synthesis_step_thought'
  | 'initial_step_usage'
  | 'refinement_step_usage'
  | 'synthesis_step_usage';

export interface Work {
  // Generic storage for step results. Keys match StepId (e.g., 'initial_step', 'refinement_step', 'synthesis_step')
  results?: {
    initial_step?: (string | null)[];
    refinement_step?: (string | null)[];
    synthesis_step?: { text?: string; error?: boolean; errorMessage?: string; sources?: Source[] } | string;
    
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
/** Pipeline step identifiers. Note: 'refinement_step' is distinct from 'refinement_prompt' InstructionType */
export type StepId = 'initial_step' | 'refinement_step' | 'synthesis_step';

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
