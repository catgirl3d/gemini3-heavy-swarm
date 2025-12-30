import { StepDescriptor, StepContext, StepId, STEPS, StreamConfig, StreamCallbacks, StreamResult, AgentInstruction, MultiAgentConfig } from '@/types/steps';
import { Tool, Content, GroundingChunk } from '@google/genai';
import { getStepConfig, StepConfig } from '@/utils/swarm/stepConstants';
import { AgentState, Source, TokenUsage, Work } from '@/types';
import { createAgentStates, updateAgentState, updateAgentStateById } from './utils/agentStateUtils';
import { simulateStreaming, getDevModeText, DEV_MODE_DURATIONS } from './utils/devModeUtils';
import { extractTextFromParts, extractTokenUsage } from './utils/streamUtils';
import { getErrorLabel, checkGlobalRateLimitFailure, checkGlobalStepFailure, getFriendlyErrorMessage } from './utils/errorUtils';
import { getGenerationConfig } from '@/services/proxy/geminiConfig';
import { Logger } from '@shared/utils/logger';
import { AppError, ErrorCode } from '@/utils/errors/AppError';
import { withRetry } from '@/utils/common/retryStrategy';
import { useAgentStore } from '@/stores/agentStore';
import { updateAgentStatus, updateAgentStatusIfChanged } from '@/utils/swarm/statusHelpers';

export abstract class BaseStep implements StepDescriptor {
  abstract id: StepId;

  abstract name: string;
  abstract description: string;
  abstract ui: { visibleInModal: boolean; regenerateLabel?: string };

  abstract execute(context: StepContext): Promise<unknown>;
  abstract regenerate?(context: StepContext, agentIndex: number, agentStates: AgentState[]): Promise<unknown>;

  // --- Shared utility methods ---

  protected createAgentStates(
    numAgents: number,
    settings: StepContext['settings'],
    config: { stepId: StepId; status: AgentState['status']; statusLabel: string; messageId?: string }
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
  protected getFriendlyErrorMessage = getFriendlyErrorMessage;
  protected checkGlobalRateLimitFailure = checkGlobalRateLimitFailure;
  protected checkGlobalStepFailure = checkGlobalStepFailure;



  /**
   * Ensures work.results is initialized. Use this to avoid repeated null checks.
   */
  protected ensureResults(work: StepContext['work']): asserts work is StepContext['work'] & { results: NonNullable<StepContext['work']['results']> } {
    if (!work.results) work.results = {};
  }

  /**
   * Centralized stream chunk handler for execute and regenerate.
   * Updates results, thoughts, usage, and UI consistently.
   */
  protected handleStreamChunk(
    context: StepContext,
    index: number,
    text: string,
    thought: string,
    usage: any,
    options: {
      statusMsg?: string;
      agentStates?: AgentState[];
      localResults?: string[];
      isFirstChunk?: boolean;
      streamToMessage?: boolean;
    }
  ) {
    const { work, onMessageUpdate, settings } = context;
    const stepId = this.id;

    // Ensure storage is ready
    this.ensureResults(work);

    // Update main text results
    if (options.localResults) {
      options.localResults[index] = text;
      work.results[stepId] = [...options.localResults];
    } else {
      // In regeneration, localResults is usually missing, so update work.results directly
      const current = work.results[stepId];
      if (index === -1) {
          // Synthesis/Single agent
          // Always maintain object shape for synthesis - { text, sources? }
          if (typeof current === 'object' && !Array.isArray(current) && current !== null) {
              (work.results[stepId] as any) = { ...current, text };
          } else {
              // Initialize as object from first chunk
              (work.results[stepId] as any) = { text };
          }
      } else {
          // Multi-agent array
          const newArray = Array.isArray(current) ? [...current] : Array(settings.numAgents).fill('');
          // Ensure array is large enough (e.g. if numAgents changed or migration)
          if (newArray.length < settings.numAgents) {
            const padding = Array(settings.numAgents - newArray.length).fill('');
            newArray.push(...padding);
          }
          newArray[index] = text;
          work.results[stepId] = newArray;
      }
    }

    // Update thoughts
    if (thought) {
      const thoughtsKey = index === -1 ? `${stepId}_thought` : `${stepId}_thoughts`;
      if (index === -1) {
        work.results[thoughtsKey] = thought;
      } else {
        if (!work.results[thoughtsKey] || !Array.isArray(work.results[thoughtsKey])) {
          work.results[thoughtsKey] = Array(settings.numAgents).fill('');
        }
        (work.results[thoughtsKey] as string[])[index] = thought;
      }
    }

    // Update usage
    if (usage) {
      const usageKey = `${stepId}_usage`;
      if (index === -1) {
        work.results[usageKey] = usage;
      } else {
        this.ensureStepUsage(work, stepId, settings.numAgents);
        (work.results[usageKey] as any[])[index] = usage;
      }
    }

    // Optional UI updates
     if (options.statusMsg) {
        const targetIndex = index === -1 ? 0 : index;
        // Use conditional update to prevent redundant store updates during streaming
        updateAgentStatusIfChanged(stepId, targetIndex, 'working', context.messageId, options.statusMsg);
     }

     // SYNC: Ensure work results are updated in the global store for live streaming visibility
     // Use atomic update to prevent race conditions during parallel execution
     useAgentStore.getState().updateWorkResult(stepId, index, { text, thought, usage });

     if (text.length > 0 && onMessageUpdate && options.streamToMessage) {
       onMessageUpdate(text, options.isFirstChunk ?? false);
     }
  }

  /**
   * Updates an agent's state using labels from stepConfig.
   */
  protected updateAgentStatus(
    states: AgentState[], 
    index: number, 
    status: keyof StepConfig['labels'],
    customLabel?: string
  ): AgentState[] {
    const config = getStepConfig(this.id);
    return this.updateAgentState(states, index, { 
      status,
      label: customLabel ?? config.labels[status],
      stepId: this.id,
      messageId: states[index]?.messageId
    });
  }

  /**
   * Updates an agent's state for a retry attempt and notifies progress.
   * Returns the updated states array.
   */
  protected handleRetryProgress(context: StepContext, index: number, attempt: number, states: AgentState[]): AgentState[] {
    // Maintain current status for synthesis to prevent UI flickering during retries.
    const currentStatus = states[index]?.status || 'working';
    const nextStatus = this.id === STEPS.SYNTHESIS ? currentStatus : 'working';
    const label = `Retrying (Attempt ${attempt})...`;

    const updated = this.updateAgentStatus(states, index, nextStatus, label);
    
    // CRITICAL: Restore loading indicator when any retry starts
    useAgentStore.getState().setIsLoading(true);

    updateAgentStatus(
      this.id,
      index,
      nextStatus as any,
      context.messageId,
      label
    );

    return updated;
  }

  /**
   * Standardized initialization of agent states and first progress update.
   */
  protected initializeAgentStates(context: StepContext): AgentState[] {
    const { settings, messageId } = context;
    const config = getStepConfig(this.id);
    
    const states = this.createAgentStates(settings.numAgents, settings, {
      stepId: this.id,
      status: 'working',
      statusLabel: config.labels.working,
      messageId
    });
    
    // Initialize ALL agents in the store
    states.forEach((s, i) => {
      updateAgentStatus(
        this.id,
        i,
        'working',
        messageId,
        config.labels.working,
        s.name
      );
    });

    return states;
  }

  /**
   * Processes settled outcomes from multiple agents, handles errors, and updates states.
   */
  protected processSettledOutcomes(
    context: StepContext,
    outcomes: PromiseSettledResult<string>[],
    results: string[],
    agentStates: AgentState[]
  ): { updatedStates: AgentState[]; failures: unknown[] } {
    const { settings } = context;
    const failures: unknown[] = [];
    let updatedStates = [...agentStates];

    outcomes.forEach((outcome, i) => {
      const logger = new Logger(this.id, settings.debugMode);
      if (outcome.status === 'rejected') {
        const reason = outcome.reason;
        failures.push(reason);
        logger.error(`Agent ${i + 1} failed:`, reason);
        
        logger.debug(`[Agent ${i}] FAILURE DETAILS:`, {
          error: reason instanceof Error ? reason.message : String(reason),
          textLength: results[i]?.length || 0,
          hasContent: (results[i]?.length || 0) > 0
        });
        

        
        const errorLabel = this.getErrorLabel(reason, getStepConfig(this.id).labels.error);
        updatedStates = this.updateAgentState(updatedStates, i, { 
          status: 'error',
          label: errorLabel,
          stepId: this.id,
          messageId: updatedStates[i]?.messageId
        });

        // Update Store
        updateAgentStatus(
          this.id,
          i,
          'error',
          context.messageId,
          errorLabel
        );
      }
    });

    return { updatedStates, failures };
  }

  /**
   * Performs final work result updates and global failure checks.
   */
  protected finalizeStep(
    context: StepContext,
    results: string[],
    agentStates: AgentState[],
    failures: unknown[]
  ): string[] {
    const { work, settings } = context;
    
    if (this.checkGlobalRateLimitFailure(failures, settings.numAgents)) {
        work.results[this.id] = [...results];
        useAgentStore.getState().setCurrentWork({ ...work });
        throw failures[0];
    }

    if (this.checkGlobalStepFailure(failures, settings.numAgents)) {
      work.results[this.id] = [...results];
      useAgentStore.getState().setCurrentWork({ ...work });
      throw failures[0];
    }

    work.results[this.id] = [...results];
    useAgentStore.getState().setCurrentWork({ ...work });
    
    return results;
  }

  /**
   * Extracts unique sources from grounding chunks.
   * Returns undefined if no valid sources are found.
   */
  protected extractSources(groundingChunks: GroundingChunk[]): Source[] | undefined {
    if (!groundingChunks || groundingChunks.length === 0) return undefined;
    
    const uniqueSources = new Map<string, Source>();
    
    groundingChunks.forEach(chunk => {
      if (chunk.web?.uri) {
        uniqueSources.set(chunk.web.uri, {
          uri: chunk.web.uri,
          title: chunk.web.title || chunk.web.uri
        });
      }
    });

    return uniqueSources.size > 0 ? Array.from(uniqueSources.values()) : undefined;
  }

  /**
   * Ensures usage array is initialized for a step.
   * Returns the initialized usage array (or object if numAgents is 1).
   */
  protected ensureStepUsage(
    work: StepContext['work'], 
    stepId: StepId, 
    numAgents: number
  ): unknown[] {
    const key = `${stepId}_usage`;
    if (!work.results[key]) {
      // Always initialize as an array to allow indexed access
      work.results[key] = Array(numAgents).fill(null);
    }
    return work.results[key] as unknown[];
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

  /**
   * Orchestrates parallel execution of multiple agents.
   * Handles state initialization, parallel model streaming, chunk processing,
   * error handling, and results finalization.
   */
  protected async executeMultiAgent(
    context: StepContext,
    config: MultiAgentConfig
  ): Promise<string[]> {
    const { ai, settings, work, signal } = context;
    const stepId = this.id;

    // Initialize results array
    const results: string[] = Array(settings.numAgents).fill('');
    this.ensureResults(work);

    // Standardized initialization of agent states
    let currentAgentStates = this.initializeAgentStates(context);
    const stepConfig = getStepConfig(stepId);

    // Execute agents in parallel
    const agentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
      const { systemInstruction, userTurn, mainChatHistory } = config.prepareAgent(i);

      // Capture debug info
      this.ensureDebugInfo(work, stepId);
      work.debugInfo[stepId][i] = { systemInstruction, history: mainChatHistory, userTurn };

      const { text: fullText } = await this.runModelStream(
        {
          ai, settings, model: settings.model,
          contents: [...mainChatHistory, userTurn],
          systemInstruction,
          tools: config.tools,
          signal,
          agentIndex: i,
          simulateError: config.simulateError,
        },
        {
          onChunk: (text, thought, usage) => {
            this.handleStreamChunk(context, i, text, thought, usage, {
              statusMsg: stepConfig.progressMsg,
              agentStates: currentAgentStates,
              localResults: results
            });
          },
          onRetry: (attempt) => {
            currentAgentStates = this.handleRetryProgress(context, i, attempt, currentAgentStates);
          }
        }
      );

      currentAgentStates = this.updateAgentStatus(currentAgentStates, i, 'done');
      
      updateAgentStatus(
        this.id,
        i,
        'done',
        context.messageId
      );

      return fullText;
    });

    const outcomes = await Promise.allSettled(agentPromises);
    
    // Standardized failure processing
    const { updatedStates, failures } = this.processSettledOutcomes(context, outcomes, results, currentAgentStates);
    
    return this.finalizeStep(context, results, updatedStates, failures);
  }

  protected async runModelStream(
    config: StreamConfig,
    callbacks: StreamCallbacks
  ): Promise<StreamResult> {
    const { ai, settings, model, contents, systemInstruction, tools, signal, agentIndex, devModeDuration, simulateError } = config;
    const logger = new Logger(`${this.id}${agentIndex !== undefined ? `:Agent${agentIndex}` : ''}`, settings.debugMode);

    let fullText = '';
    let fullThought = '';
    const allGroundingChunks: GroundingChunk[] = [];
    let lastUsage: TokenUsage | null = null;

    logger.debug('Starting model stream', { model, devMode: settings.devMode });

    if (settings.devMode) {
      logger.debug('Using DEV MODE (simulated response)');
      const dummyText = this.getDevModeText(this.id, agentIndex);
      fullText = await this.simulateDevMode(
        dummyText,
        signal,
        (chunk) => {
          callbacks.onChunk(chunk, '', null);
        },
        devModeDuration ?? (DEV_MODE_DURATIONS[this.id] || 1000)
      );
      logger.debug('DEV MODE complete', { textLength: fullText.length });
    } else {
      if (!ai) throw new AppError("API Key not found", ErrorCode.INVALID_SETTINGS);

      logger.debug('Starting API stream request');
      
      try {
        await withRetry(async (attempt) => {
          // Simulation mode for testing error UI (controlled via config/settings)
          if (simulateError && simulateError !== 'none') {
            // Throw simulated error on first attempt to test recovery UI
            if (attempt === 1) {
              logger.debug(`SIMULATION: Throwing simulated ${simulateError} error for testing (Attempt ${attempt})`);
              
              switch (simulateError) {
                case '429':
                  throw new AppError('Resource has been exhausted (e.g. check quota). (429)', ErrorCode.RATE_LIMIT, null, 429);
                case '503':
                  throw new AppError('The service is currently overloaded. (503)', ErrorCode.SERVICE_OVERLOADED, null, 503);
                case '500':
                  throw new AppError('Internal error encountered. (500)', ErrorCode.PROXY_ERROR, null, 500);
                case 'timeout':
                  throw new AppError('Network request failed: fetch timed out', ErrorCode.NETWORK_ERROR);
                default:
                  throw new Error(`${simulateError} Simulated error`);
              }
            }
          }

          // Reset accumulators for each attempt to ensure clean regeneration if retried
          fullText = '';
          fullThought = '';
          allGroundingChunks.length = 0;
          lastUsage = null;
          let chunkCount = 0;

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
            if (signal.aborted) {
              logger.debug('Aborted by signal');
              throw new Error('Aborted');
            }

            chunkCount++;
            const { text, thought } = this.extractStreamContent(chunk.candidates?.[0]?.content?.parts);
            
            // Log first chunk details or when thought content appears
            const isFirstThought = thought && !fullThought;
            if (chunkCount === 1 || isFirstThought) {
              logger.debug(`Chunk #${chunkCount}`, { 
                textLen: text.length, 
                thoughtLen: thought.length,
                hasText: text.length > 0,
                hasThought: thought.length > 0,
                isFirstThought
              });
            }

            fullText += text;
            fullThought += thought;

            const usage = this.extractTokenUsage(chunk.usageMetadata);
            if (usage) {
              lastUsage = usage;
            }
            
            const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (groundingChunks) {
              allGroundingChunks.push(...groundingChunks);
            }

            callbacks.onChunk(fullText, fullThought, usage);
          }
        }, {
          onRetry: (err, attempt, delay) => {
            logger.warn(`Retry attempt ${attempt} for agent ${agentIndex ?? 'main'} after ${delay}ms due to: ${err.message}`);
            callbacks.onRetry?.(attempt, err);
          },
          signal
        });
      } catch (err) {
        throw AppError.from(err);
      }
      
      logger.debug('Stream complete', { textLength: fullText.length, thoughtLength: fullThought.length });
    }

    return { 
      text: fullText, 
      thought: fullThought, 
      groundingChunks: allGroundingChunks,
      usage: lastUsage
    };
  }

  /**
   * Shared regeneration logic for multi-agent steps (Initial, Refinement).
   * Handles complete lifecycle: status initialization, streaming, final status updates, and error handling.
   * This method is fully self-contained - callers don't need to manage statuses externally.
   */
  protected async runAgentRegeneration(
    context: StepContext,
    agentIndex: number,
    instruction: AgentInstruction,
    agentStates: AgentState[],
    tools?: Tool[],
    onFirstTextChunk?: () => void
  ): Promise<{ text: string; work: Work; groundingChunks?: GroundingChunk[] }> {
    const { ai, settings, work, signal, messageId } = context;
    if (!ai) throw new AppError("API Key not found", ErrorCode.INVALID_SETTINGS);

    const { systemInstruction, userTurn, mainChatHistory } = instruction;
    let currentAgentStates = agentStates;

    // Capture debug info for regeneration
    this.ensureDebugInfo(work, this.id);
    (work.debugInfo[this.id] as any)[agentIndex] = {
      systemInstruction,
      history: mainChatHistory,
      userTurn
    };

    const config = getStepConfig(this.id);
    
    // Set initial 'working' status - Step manages its own lifecycle
    updateAgentStatus(this.id, agentIndex, 'working', messageId);
    
    try {
      const { text: fullText, usage: finalUsage, groundingChunks } = await this.runModelStream(
        {
          ai, settings, model: settings.model,
          contents: [...mainChatHistory, userTurn],
          systemInstruction,
          tools: tools ?? [{ googleSearch: {} }],
          signal,
          agentIndex,
        },
        {
          onChunk: (text, thought, usage) => {
            // Trigger first text chunk callback (for synthesis jump)
            if (text.length > 0 && onFirstTextChunk) {
              onFirstTextChunk();
              onFirstTextChunk = undefined; // Only call once
            }
            
            this.handleStreamChunk(context, agentIndex, text, thought, usage, {
              isFirstChunk: false,
              streamToMessage: true,
              agentStates: currentAgentStates,
              statusMsg: config.progressMsg
            });
          },
          onRetry: (attempt) => {
            currentAgentStates = this.handleRetryProgress(context, agentIndex, attempt, currentAgentStates);
          }
        }
      );
      
      // CRITICAL: Save final usage after streaming completes
      // This ensures token usage displays correctly for regenerated agents
      if (finalUsage) {
        this.ensureStepUsage(work, this.id, settings.numAgents);
        (work.results[`${this.id}_usage`] as any[])[agentIndex] = finalUsage;
        
        // Also update the store atomically for immediate UI update
        useAgentStore.getState().updateWorkResult(this.id, agentIndex, { usage: finalUsage });
      }
      
      // Set final 'done' status after successful completion
      updateAgentStatus(this.id, agentIndex, 'done', messageId);

      // META UPDATE: Ensure step is marked as done for StepRunner
      this.updateStepMetadata(work, 'done');
      
      // Update store with final snapshot
      useAgentStore.getState().setCurrentWork({ ...work });
      
      return { text: fullText, work, groundingChunks };
    } catch (error) {
      // Step fully owns error handling - set status AND update work.results
      const errorLabel = this.getErrorLabel(error, config.labels.error);
      updateAgentStatus(this.id, agentIndex, 'error', messageId, errorLabel);
      
      // Update work.results with error information
      this.ensureResults(work);
      const currentResults = Array.isArray(work.results[this.id]) 
        ? [...(work.results[this.id] as string[])]
        : Array(settings.numAgents).fill('');
      
      // Preserve any partial text that was streamed before error
      // Preserve any partial text that was streamed before error
      work.results[this.id] = currentResults;
      
      // Update store with error state
      useAgentStore.getState().setCurrentWork({ ...work });
      
      // Re-throw to let caller handle additional UI updates (e.g., message parts)
      throw error;
    }
  }

  /**
   * Thin wrapper around runAgentRegeneration for synthesis step.
   * Handles synthesis-specific behaviors: sources extraction and onSynthesisJump callback.
   */
  protected async runSynthesisRegeneration(
    context: StepContext,
    instruction: { systemInstruction: string; userTurn: Content; mainChatHistory: Content[] },
    agentStates: AgentState[],
    tools?: Tool[]
  ): Promise<{ text: string; sources?: Source[]; work: Work }> {
    const { systemInstruction, userTurn, mainChatHistory } = instruction;
    
    // Synthesis always uses agentIndex 0
    const agentIndex = 0;
    const agentInstruction: AgentInstruction = { systemInstruction, userTurn, mainChatHistory };
    
    // Delegate to base regeneration logic
    const result = await this.runAgentRegeneration(
      context,
      agentIndex,
      agentInstruction,
      agentStates,
      tools,
      () => context.onSynthesisJump?.() // Pass callback for synthesis jump
    );
    
    // Extract sources from grounding chunks
    const sources = this.extractSources(result.groundingChunks);
    
    // Update work.results to include sources
    if (sources && sources.length > 0) {
      this.ensureResults(result.work);
      const currentResult = result.work.results?.[this.id];
      if (typeof currentResult === 'object') {
        result.work.results![this.id] = { ...currentResult, sources } as any;
      }
    }
    
    return { text: result.text, sources, work: result.work };
  }

  /**
   * Helper to update step metadata (status) in the Work object.
   * critical for ensuring StepRunner skips completed steps during Resume.
   */
  protected updateStepMetadata(work: Work, status: 'done' | 'error' = 'done'): void {
    const config = getStepConfig(this.id);
    if (!work.stepMetadata) work.stepMetadata = [];
    const metaIdx = work.stepMetadata.findIndex(m => m.id === this.id);
    if (metaIdx >= 0) {
        work.stepMetadata[metaIdx] = { ...work.stepMetadata[metaIdx], status };
    } else {
        work.stepMetadata.push({ id: this.id, status, label: config.name });
    }
  }
}
