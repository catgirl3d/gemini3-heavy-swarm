import { Content } from '@google/genai';

export enum ProviderType {
  Gemini = 'gemini',
  OpenRouter = 'openrouter',
}

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
  model?: string;
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
    model?: string;
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
    model?: string;
}

export type SimulateError = 'none' | '429' | '500' | '503' | 'timeout';

export interface AppSettings {
  provider: ProviderType;
  numAgents: number;
  apiKey?: string;
  model: string;
  openRouterApiKey?: string;
  openRouterModel: string;
  activeProfileId: string;
  profiles: PromptProfile[];
  devMode: boolean;
  debugMode: boolean;
  simulateInitialError: SimulateError;
  simulateRefinementError: SimulateError;
  simulateSynthesisError: SimulateError; // Error simulation for testing
  simulateInitialErrorAttempts: number;
  simulateRefinementErrorAttempts: number;
  simulateSynthesisErrorAttempts: number;
  pauseAfterInitial: boolean;
  pauseAfterRefinement: boolean;
  useSearchInInitial: boolean;
  useSearchInRefinement: boolean;
  useSearchInSynthesis: boolean;
  temperature: number;
  maxOutputTokens: number;
  unsafeTemperature?: boolean;
  dynamicAgentRoles: boolean;
  activeRoleProfileId: string;
  roleProfiles: RoleProfile[];
  savedInstructions: SavedInstruction[];
  savedRoles: SavedRole[];
  initialModel?: string;
  refinementModel?: string;
  synthesisModel?: string;
}

export interface Source {
  uri: string;
  title: string;
}

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  /** 
   * Number of tokens used for "thoughts" in thinking models.
   * Only present for models with thinking capabilities (e.g., Gemini 2.0 Flash Thinking).
   */
  thoughtsTokenCount?: number;
  /**
   * Number of tokens from cached content (context caching).
   * Useful for understanding cost savings from caching.
   */
  cachedContentTokenCount?: number;
  /**
   * Number of tokens in tool-use prompts.
   * Only present when tools are used in the request.
   */
  toolUsePromptTokenCount?: number;
  /**
   * Whether the token counts are estimated (client-side) or final (from API).
   */
  isEstimated?: boolean;
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
  | `${typeof STEPS.SYNTHESIS}_usage`
  // Error count tracking for retry simulation
  // Note: All steps use plural '_error_counts' suffix for naming consistency,
  // but data structure differs by step type:
  // - Multi-agent steps (initial, refinement): number[] (array of counts per agent)
  // - Single-agent step (synthesis): number (scalar count)
  | `${typeof STEPS.INITIAL}_error_counts`
  | `${typeof STEPS.REFINEMENT}_error_counts`
  | `${typeof STEPS.SYNTHESIS}_error_counts`;

/**
 * Debug information structure captured during step execution.
 * Contains system instructions, chat history, and user prompt for debugging.
 */
export interface StepDebugInfo {
  systemInstruction: string;
  history: Content[];
  userTurn: Content;
}

/**
 * Debug information stored per step.
 * - Multi-agent steps (initial, refinement): array of debug info per agent
 * - Single-agent step (synthesis): single debug info object
 */
export type DebugInfo = {
  [STEPS.INITIAL]?: StepDebugInfo[];
  [STEPS.REFINEMENT]?: StepDebugInfo[];
  [STEPS.SYNTHESIS]?: StepDebugInfo;
  [key: string]: StepDebugInfo | StepDebugInfo[] | undefined;
};


export interface Work {
  /**
   * SNAPSHOT ONLY: content of message work.
   * `agentStates` here creates a historical record. Live updates use global state.
   */
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
    status: 'pending' | 'working' | 'done' | 'error';
    label?: string;
  }[];

  agentNames?: string[];
  criticNames?: string[];
  /** 
   * SNAPSHOT ONLY: Final agent states after a step/regeneration completes.
   * Do NOT use this for live status updates in the UI (use global agentStates instead).
   */
  agentStates?: AgentState[];
  /** 
   * Debug information captured during step execution.
   * Contains system instructions, chat history, and user prompts for debugging.
   */
  debugInfo?: DebugInfo;
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
  agentIndex?: number; // Track agent index within the step
  messageId?: string; // Scope state to specific message to prevent global leakage
}

export interface ServerStatus {
  hasServerKey: boolean;
  hasOpenRouterKey: boolean;
  proxyMode: string;
  isLoaded: boolean;
}
