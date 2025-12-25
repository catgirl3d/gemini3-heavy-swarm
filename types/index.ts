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

export interface Work {
  initialResponses: (string | null)[];
  refinedResponses: (string | null)[];
  
  initialThoughts?: (string | null)[];
  refinedThoughts?: (string | null)[];
  synthesisThought?: string | null;

  initialTokenUsage?: (TokenUsage | null)[];
  refinedTokenUsage?: (TokenUsage | null)[];
  synthesisTokenUsage?: TokenUsage | null;

  // Generic storage for step results. Keys match StepId (e.g., 'initial_step', 'refinement_step', 'synthesis_step')
  results?: Record<string, any>;
  
  // Metadata about the steps that ran
  stepMetadata?: {
    id: string;
    status: 'pending' | 'working' | 'done';
    label?: string;
  }[];

  agentNames?: string[];
  criticNames?: string[];
  agentStates?: AgentState[];
  debugInfo?: Record<string, any>;
}

export interface Message {
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