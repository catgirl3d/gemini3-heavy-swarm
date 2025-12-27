import { StepDescriptor, StepContext, StepId, StreamConfig, StreamCallbacks, StreamResult } from '@/types/steps';
import { AgentState } from '@/types';
import { createAgentStates, updateAgentState, updateAgentStateById } from '@/services/steps/utils/agentStateUtils';
import { simulateStreaming, getDevModeText, DEV_MODE_DURATIONS } from '@/services/steps/utils/devModeUtils';
import { extractTextFromParts, extractTokenUsage } from '@/services/steps/utils/streamUtils';
import { getErrorLabel, checkGlobalRateLimitFailure } from '@/services/steps/utils/errorUtils';
import { getGenerationConfig } from '@/services/geminiConfig';
import { GroundingChunk } from '@google/genai';

export abstract class BaseStep implements StepDescriptor {
  abstract id: StepId;
  abstract name: string;
  abstract description: string;
  abstract ui: { visibleInModal: boolean; regenerateLabel?: string };

  abstract execute(context: StepContext): Promise<unknown>;
  abstract regenerate?(context: StepContext, agentIndex: number): Promise<unknown>;

  // --- Shared utility methods ---

  protected createAgentStates(
    numAgents: number,
    settings: StepContext['settings'],
    config: { stepId: StepId; status: AgentState['status']; statusLabel: string }
  ): AgentState[] {
    return createAgentStates(numAgents, settings, config);
  }

  protected updateAgentState(states: AgentState[], index: number, updates: Partial<AgentState>): AgentState[] {
    return updateAgentState(states, index, updates);
  }

  protected updateAgentStateById(states: AgentState[], id: string, updates: Partial<AgentState>): AgentState[] {
    return updateAgentStateById(states, id, updates);
  }

  protected async simulateDevMode(
    text: string,
    signal: AbortSignal,
    onChunk: (currentText: string) => void,
    durationMs = 2000
  ): Promise<string> {
    return simulateStreaming(text, { totalDurationMs: durationMs, signal, onChunk });
  }

  protected getDevModeText(step: StepId, agentIndex?: number): string {
    return getDevModeText(step, agentIndex);
  }

  protected extractStreamContent = extractTextFromParts;
  protected extractTokenUsage = extractTokenUsage;
  protected getErrorLabel = getErrorLabel;
  protected checkGlobalRateLimitFailure = checkGlobalRateLimitFailure;

  /**
   * Ensures work.results is initialized. Use this to avoid repeated null checks.
   */
  protected ensureResults(work: StepContext['work']): asserts work is StepContext['work'] & { results: NonNullable<StepContext['work']['results']> } {
    if (!work.results) work.results = {};
  }

  /**
   * Extracts unique sources from grounding chunks.
   * Returns undefined if no valid sources are found.
   */
  protected extractSources(groundingChunks: GroundingChunk[]): { uri: string; title: string }[] | undefined {
    if (groundingChunks.length === 0) return undefined;
    
    const sources = groundingChunks
      .map((chunk) => chunk.web)
      .filter((web): web is { uri: string; title: string } => !!web && !!web.uri)
      .filter((web, index, self) => index === self.findIndex(w => w.uri === web.uri));
    
    return sources.length > 0 ? sources : undefined;
  }

  /**
   * Ensures usage array is initialized for a step.
   * Returns the initialized usage array (or object if numAgents is 1).
   */
  protected ensureStepUsage(
    work: StepContext['work'], 
    stepId: StepId, 
    numAgents: number
  ): unknown[] | unknown {
    const key = `${stepId}_usage`;
    if (!work.results[key]) {
      work.results[key] = numAgents > 1 ? Array(numAgents).fill(null) : null;
    }
    return work.results[key];
  }

  /**
   * Ensures debugInfo structure is initialized for a step.
   * Returns the initialized debugInfo array (or object).
   */
  protected ensureDebugInfo(
    work: StepContext['work'], 
    stepId: StepId,
    isArray = true
  ): any[] | Record<string, any> {
    if (!work.debugInfo) work.debugInfo = {};
    if (!work.debugInfo[stepId]) {
      work.debugInfo[stepId] = isArray ? [] : {};
    }
    return work.debugInfo[stepId] as any;
  }

  protected async runModelStream(
    config: StreamConfig,
    callbacks: StreamCallbacks
  ): Promise<StreamResult> {
    const { ai, settings, model, contents, systemInstruction, tools, signal, agentIndex, devModeDuration } = config;
    let fullText = '';
    let fullThought = '';
    const allGroundingChunks: GroundingChunk[] = [];

    if (settings.devMode) {
      const dummyText = this.getDevModeText(this.id, agentIndex);
      fullText = await this.simulateDevMode(
        dummyText,
        signal,
        (chunk) => {
          callbacks.onChunk(chunk, '', null);
        },
        devModeDuration ?? (DEV_MODE_DURATIONS[this.id] || 1000)
      );
    } else {
      if (!ai) throw new Error("API Key not found");

      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          ...getGenerationConfig(model, settings.temperature, settings.unsafeTemperature),
          systemInstruction,
          tools,
        },
      });

      for await (const chunk of stream) {
        if (signal.aborted) throw new Error('Aborted');

        const { text, thought } = this.extractStreamContent(chunk.candidates?.[0]?.content?.parts);
        fullText += text;
        fullThought += thought;

        const usage = this.extractTokenUsage(chunk.usageMetadata);
        
        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
          allGroundingChunks.push(...groundingChunks);
        }

        callbacks.onChunk(fullText, fullThought, usage);
      }
    }

    return { 
      text: fullText, 
      thought: fullThought, 
      groundingChunks: allGroundingChunks 
    };
  }
}
