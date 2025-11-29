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
}

export interface AppSettings {
  numAgents: number;
  model: string;
  activeProfileId: string;
  profiles: PromptProfile[];
  devMode: boolean;
  debugMode: boolean;
  pauseAfterInitial: boolean;
  temperature: number;
  dynamicAgentRoles: boolean;
  activeRoleProfileId: string;
  roleProfiles: RoleProfile[];
}

export interface Source {
  uri: string;
  title: string;
}

export interface Work {
  initialResponses: (string | null)[];
  refinedResponses: (string | null)[];
  agentNames?: string[];
  agentStates?: AgentState[];
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  image?: string;
  sources?: Source[];
  work?: Work;
}

export interface AgentState {
  id: string;
  name: string;
  status: 'waiting' | 'working' | 'done';
  label: string;
}