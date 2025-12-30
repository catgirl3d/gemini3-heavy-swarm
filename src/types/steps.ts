import { AppSettings, Message, AgentState, Work, StepId, TokenUsage, STEPS, SimulateError } from '@/types/index';
export type { StepId };
export { STEPS };
import { GoogleGenAI, Content, Tool, GroundingChunk } from '@google/genai';
import { ProxyGenAI } from '@/services/proxy/ProxyGenAI';
import type { AppError } from '@/utils/errors/AppError';

export interface StreamConfig {
  ai: GoogleGenAI | ProxyGenAI | null;
  settings: AppSettings;
  model: string;
  contents: Content[];
  systemInstruction: string;
  tools?: Tool[];
  signal: AbortSignal;
  agentIndex?: number;
  /** Duration in milliseconds for dev mode simulation. Default: 1000ms */
  devModeDuration?: number;
  /** Optional error message to throw inside the retry block for testing */
  simulateError?: SimulateError;
}

export interface StreamCallbacks {
  onChunk: (text: string, thought: string, usage: TokenUsage | null) => void;
  onRetry?: (attempt: number, error: AppError) => void;
}

export interface StreamResult {
  text: string;
  thought: string;
  groundingChunks: GroundingChunk[];
  usage: TokenUsage | null;
}

/** Pipeline step identifiers. Note: 'refinement_step' is distinct from 'refinement_prompt' InstructionType */

export interface StepContext {
  ai: GoogleGenAI | ProxyGenAI | null;
  settings: AppSettings;
  history: Message[];
  userInput: string;
  image: string | null;
  imageFile: File | null;
  
  // The current state of work (results from previous steps)
  work: Work;
  
  // Callbacks for side effects
  /**
   * Update the final message stream.
   * @param text - The latest text chunk or full text
   * @param isFirstChunk - Whether this is the first chunk of the stream
   */
  onMessageUpdate: (text: string, isFirstChunk: boolean) => void;
  
  /**
   * Optional: Called when synthesis step receives its first text chunk.
   * Triggers UI updates like hiding loading indicators and unpausing.
   * Note: Card collapse is handled automatically by ShowWork components 
   * reacting to the synthesizer agent status change.
   */
  onSynthesisJump?: () => void;
  
  // Signal to abort execution
  signal: AbortSignal;

  // Unique identifier for the message being processed
  messageId: string;

  // Optional pause support (for regeneration flows)
  pauseResolverRef?: import('react').MutableRefObject<((value: void | PromiseLike<void>) => void) | null>;
  onPause?: () => void;
}

export interface StepDescriptor {
  // Unique identifier (e.g., 'initial_step', 'refinement_step', 'synthesis_step')
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
  execute: (context: StepContext) => Promise<unknown>;

  /**
   * Optional: Logic to regenerate a specific agent's output for this step.
   * If omitted, this step cannot be regenerated individually.
   */
  regenerate?: (
    context: StepContext,
    agentIndex: number,
    agentStates: AgentState[]
  ) => Promise<unknown>;
}

export interface AgentInstruction {
  systemInstruction: string;
  userTurn: Content;
  mainChatHistory: Content[];
}

export interface MultiAgentConfig {
  prepareAgent: (index: number) => AgentInstruction;
  tools?: Tool[];
  simulateError?: SimulateError;
}
