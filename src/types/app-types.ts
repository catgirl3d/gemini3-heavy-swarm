import { type Content } from '@google/genai';

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
  id: string; // Unique stable identifier for tracking role model assignments
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

export type RoleType = 'roles' | 'criticRoles';

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



export interface SavedRole {
    id: string;
    name: string;
    instruction: string;
    model?: string;
}

export type SimulateError = 'none' | '429' | '500' | '503' | 'timeout';

/**
 * Provider-specific model storage for roles and steps.
 * Allows switching between providers while preserving model selections.
 */
export interface ProviderModels {
  // Step models per provider
  stepModels?: {
    [ProviderType.Gemini]?: {
      initial?: string;
      refinement?: string;
      synthesis?: string;
    };
    [ProviderType.OpenRouter]?: {
      initial?: string;
      refinement?: string;
      synthesis?: string;
    };
  };
  // Role profile models per provider
  // CRITICAL: Uses role.id instead of array index to prevent cache desynchronization
  roleModels?: {
    [profileId: string]: {
      [ProviderType.Gemini]?: {
        roles?: Record<string, string>; // role.id -> model
        criticRoles?: Record<string, string>; // role.id -> model
      };
      [ProviderType.OpenRouter]?: {
        roles?: Record<string, string>; // role.id -> model
        criticRoles?: Record<string, string>; // role.id -> model
      };
    };
  };
}

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
  // Provider-specific model storage
  providerModels?: ProviderModels;
}

export interface Source {
  uri: string;
  title: string;
}

export interface SynthesisErrorState {
  flag: true;
  message?: string;
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

export type WorkResultUpdates = {
  text?: string;
  thought?: string;
  usage?: TokenUsage | null;
};

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
  | `${typeof STEPS.SYNTHESIS}_thoughts`
  | `${typeof STEPS.INITIAL}_usage`
  | `${typeof STEPS.REFINEMENT}_usage`
  | `${typeof STEPS.SYNTHESIS}_usage`
  | `${typeof STEPS.SYNTHESIS}_sources`
  | `${typeof STEPS.SYNTHESIS}_error`
  // Error count tracking for retry simulation
  // All steps use indexed arrays. Synthesis uses slot 0.
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

export type WorkStepStatus = 'pending' | 'working' | 'done' | 'error' | 'stale';

export interface WorkStepMetadata {
  id: string;
  status: WorkStepStatus;
  label?: string;
  staleFromStepId?: StepId;
}

export type SwarmSessionPhase =
  | 'running'
  | 'streaming-final'
  | 'awaiting-user'
  | 'recoverable-error'
  | 'done'
  | 'stopped';

export type SwarmSessionStatus = SwarmSessionPhase;

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
   * Work payload for a swarm run. When stored on Message.work it is a committed
   * historical snapshot; active model turns render from SwarmSession.work instead.
   *
   * Work owns synthesis payloads:
   * - final text: results[STEPS.SYNTHESIS]?.[0]
   * - sources: results.synthesis_step_sources
   * - error state: results.synthesis_step_error
   */
  // Generic storage for step results. Keys match StepId (e.g., 'initial_step', 'refinement_step', 'synthesis_step')
  results?: {
    [STEPS.INITIAL]?: (string | null)[];
    [STEPS.REFINEMENT]?: (string | null)[];
    [STEPS.SYNTHESIS]?: (string | null)[];
    
    // Unified step metadata (thoughts, token usage, etc.)
    initial_step_thoughts?: (string | null)[];
    refinement_step_thoughts?: (string | null)[];
    synthesis_step_thoughts?: (string | null)[];

    initial_step_usage?: (TokenUsage | null)[];
    refinement_step_usage?: (TokenUsage | null)[];
    synthesis_step_usage?: (TokenUsage | null)[];

    synthesis_step_sources?: Source[];
    synthesis_step_error?: SynthesisErrorState | null;
    initial_step_error_counts?: number[];
    refinement_step_error_counts?: number[];
    synthesis_step_error_counts?: number[];
    
    // Index signature for dynamic step keys (StepRunner extensibility)
    [key: string]: unknown;
  };

  
  // Metadata about the steps that ran
  stepMetadata?: WorkStepMetadata[];

  agentNames?: string[];
  criticNames?: string[];
  /** 
   * SNAPSHOT ONLY: agent states committed into Message.work for history rendering.
   * Live status is owned by SwarmSession.agentStates.
   */
  agentStates?: AgentState[];
  /** 
   * Debug information captured during step execution.
   * Contains system instructions, chat history, and user prompts for debugging.
   */
  debugInfo?: DebugInfo;
  isStopped?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  /**
   * User turns store their submitted text here. Model turns keep only a structural
   * placeholder; synthesis text comes from active session work or the committed
   * message.work snapshot.
   */
  parts: { text: string }[];
  image?: string;
  /** Stable snapshot committed from a SwarmSession for history rendering and explicit hydration only. */
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

export interface SwarmSession {
  messageId: string;
  work: Work;
  agentStates: AgentState[];
  phase: SwarmSessionPhase;
  loadingStatus: string;
  errorMessage: string | null;
  updatedAt: number;
}

export interface ServerStatus {
  hasServerKey: boolean;
  hasOpenRouterKey: boolean;
  proxyMode: string;
  isLoaded: boolean;
}
