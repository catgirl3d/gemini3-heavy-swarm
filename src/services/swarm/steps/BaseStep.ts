import { StepDescriptor, StepContext, StepId, STEPS, StreamConfig, StreamCallbacks, StreamResult, AgentInstruction, MultiAgentConfig } from '@/types/steps';
import { Tool } from '@google/genai';
import { getStepConfig, StepConfig } from '@/utils/swarm/stepConstants';
import { AgentState } from '@/types';
import { createAgentStates, updateAgentState, updateAgentStateById } from './utils/agentStateUtils';
import { simulateStreaming, getDevModeText, DEV_MODE_DURATIONS } from './utils/devModeUtils';
import { extractTextFromParts, extractTokenUsage } from './utils/streamUtils';
import { getErrorLabel, checkGlobalRateLimitFailure, checkGlobalStepFailure } from './utils/errorUtils';
import { getGenerationConfig } from '@/services/proxy/geminiConfig';
import { GroundingChunk } from '@google/genai';
import { Logger } from '@shared/utils/logger';
import { AppError, ErrorCode } from '@/utils/errors/AppError';
import { withRetry } from '@/utils/common/retryStrategy';

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
  protected checkGlobalStepFailure = checkGlobalStepFailure;

  protected formatExecuteError(reason: unknown): string {
    const config = getStepConfig(this.id);
    const message = reason instanceof Error ? reason.message : 'Unknown error';
    return `\n\n[System: ${config.errorPrefix}. ${message}]`;
  }

  /**
   * Ensures work.results is initialized. Use this to avoid repeated null checks.
   */
  protected ensureResults(work: StepContext['work']): asserts work is StepContext['work'] & { results: NonNullable<StepContext['work']['results']> } {
    if (!work.results) work.results = {};
  }

  /**
   * Centralized stream chunk handler for execute and regenerate.
   * Updates results, thoughts, usage, and UI (onProgress/onMessageUpdate) consistently.
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
    const { work, onProgress, onMessageUpdate, settings } = context;
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
    if (options.statusMsg && options.agentStates) {
      onProgress(options.statusMsg, options.agentStates, { ...work });
    } else if (work.agentStates) {
      // In regeneration, if we have agentStates in work, update progress to trigger UI refresh
      const config = getStepConfig(this.id);
      onProgress(options.statusMsg ?? config.progressMsg, work.agentStates, { ...work });
    }
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
      stepId: this.id 
    });
  }

  /**
   * Updates an agent's state for a retry attempt and notifies progress.
   * Returns the updated states array.
   */
  protected handleRetryProgress(context: StepContext, index: number, attempt: number, states: AgentState[]): AgentState[] {
    const config = getStepConfig(this.id);
    
    // Maintain current status for synthesis to prevent UI flickering during retries.
    const currentStatus = states[index]?.status || 'working';
    const nextStatus = this.id === STEPS.SYNTHESIS ? currentStatus : 'working';

    const updated = this.updateAgentStatus(states, index, nextStatus, `Retrying (Attempt ${attempt})...`);
    context.onProgress(config.progressMsg, updated, { ...context.work });
    return updated;
  }

  /**
   * Standardized initialization of agent states and first progress update.
   */
  protected initializeAgentStates(context: StepContext): AgentState[] {
    const { settings, onProgress, work } = context;
    const config = getStepConfig(this.id);
    
    const states = this.createAgentStates(settings.numAgents, settings, {
      stepId: this.id,
      status: 'working',
      statusLabel: config.labels.working
    });
    
    onProgress(config.progressMsg, states, work);
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
        
        results[i] += this.formatExecuteError(reason);
        
        const errorLabel = this.getErrorLabel(reason, getStepConfig(this.id).labels.error);
        updatedStates = this.updateAgentState(updatedStates, i, { 
          status: 'error', 
          label: errorLabel, 
          stepId: this.id 
        });
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
    const { work, onProgress, settings } = context;
    
    if (this.checkGlobalRateLimitFailure(failures, settings.numAgents)) {
        work.results[this.id] = [...results];
        onProgress('Rate limit reached', agentStates, { ...work });
        throw failures[0];
    }

    if (this.checkGlobalStepFailure(failures, settings.numAgents)) {
      work.results[this.id] = [...results];
      const config = getStepConfig(this.id);
      onProgress(`${config.name} failed`, agentStates, { ...work });
      throw failures[0];
    }

    work.results[this.id] = [...results];
    onProgress('Step completed', agentStates, { ...work });
    
    return results;
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
    const { ai, settings, work, onProgress, signal } = context;
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
      onProgress(stepConfig.progressMsg, currentAgentStates, { ...work });
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
            // By default, we only throw on first attempt to test recovery.
            // But for a "maximally realistic" simulation, we throw an AppError that
            // precisely matches the expected failure pattern.
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
      groundingChunks: allGroundingChunks 
    };
  }

  /**
   * Shared regeneration logic for multi-agent steps (Initial, Refinement).
   * Handles debug info capture, streaming, and retry progress updates.
   */
  protected async runAgentRegeneration(
    context: StepContext,
    agentIndex: number,
    instruction: AgentInstruction,
    tools?: Tool[]
  ): Promise<string> {
    const { ai, settings, work, signal } = context;
    if (!ai) throw new AppError("API Key not found", ErrorCode.INVALID_SETTINGS);

    const { systemInstruction, userTurn, mainChatHistory } = instruction;

    // Capture debug info for regeneration
    this.ensureDebugInfo(work, this.id);
    (work.debugInfo[this.id] as any)[agentIndex] = {
      systemInstruction,
      history: mainChatHistory,
      userTurn
    };

    const { text: fullText } = await this.runModelStream(
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
          this.handleStreamChunk(context, agentIndex, text, thought, usage, {
            isFirstChunk: false
          });
        },
        onRetry: (attempt) => {
          if (work.agentStates) {
            work.agentStates = this.handleRetryProgress(context, agentIndex, attempt, work.agentStates);
          }
        }
      }
    );
    
    return fullText;
  }
}
