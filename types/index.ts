export interface AppSettings {
  numAgents: number;
  model: string;
  initialInstruction: string;
  refinementInstruction: string;
  synthesizerInstruction: string;
  devMode: boolean;
  debugMode: boolean;
  pauseAfterInitial: boolean;
}

export interface Source {
  uri: string;
  title: string;
}

export interface Work {
  initialResponses: (string | null)[];
  refinedResponses: (string | null)[];
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