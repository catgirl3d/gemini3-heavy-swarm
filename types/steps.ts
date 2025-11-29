import { AppSettings, Message, AgentState, Work } from './index';
import { GoogleGenAI } from '@google/genai';

export type StepId = string;

export interface StepContext {
  ai: GoogleGenAI | null;
  settings: AppSettings;
  history: Message[];
  userInput: string;
  image: string | null;
  imageFile: File | null;
  
  // The current state of work (results from previous steps)
  work: Work;
  
  // Callbacks for side effects
  onProgress: (status: string, agents: AgentState[], work: Work, isPaused?: boolean) => void;
  onMessageUpdate: (text: string, isFinal: boolean) => void;
  
  // Signal to abort execution
  signal: AbortSignal;
}

export interface StepDescriptor {
  // Unique identifier (e.g., 'initial', 'refinement', 'synthesis')
  id: StepId;
  
  // Display name for UI/Logging
  name: string;
  
  // Description of what this step does
  description?: string;

  // Configuration for the UI (optional)
  ui?: {
    // If true, this step's output is shown in the "Show Work" modal
    visibleInModal: boolean;
    // Label for the "Regenerate" button context
    regenerateLabel?: string;
  };

  /**
   * Main execution logic.
   * Returns the data produced by this step (e.g., array of strings).
   * The step is responsible for calling onProgress to update UI during execution.
   */
  execute: (context: StepContext) => Promise<any>;

  /**
   * Optional: Logic to regenerate a specific agent's output for this step.
   * If omitted, this step cannot be regenerated individually.
   */
  regenerate?: (
    context: StepContext, 
    agentIndex: number
  ) => Promise<string>;
}