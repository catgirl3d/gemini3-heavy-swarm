import { type StepDescriptor, type StepContext, type StepId, STEPS, type StreamConfig, type StreamCallbacks, type StreamResult, type AgentInstruction, type MultiAgentConfig } from '@/types/steps';
import { type SimulateError, ProviderType, type RoleType } from '@/types';
import { type Tool, type Content } from '@google/genai';
import { getStepConfig, type StepConfig } from '@/utils/swarm/stepConstants';
import type { GroundingChunk } from './utils/streamUtils';
import { type AgentState, type Source, type TokenUsage, type Work, type StepDebugInfo } from '@/types';
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
import { createFirstTextJumpTracker } from '@/utils/swarm/jumpHelper';

type WorkResults = NonNullable<Work['results']>;
type SynthesisResult = NonNullable<WorkResults[typeof STEPS.SYNTHESIS]>;

const isSynthesisResult = (value: unknown): value is SynthesisResult => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

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
   * Returns the storage key used for persistent error simulation counts.
   *
   * The key name is always plural for consistency across single-agent and
   * multi-agent steps. The stored value shape (scalar vs array) is determined
   * by the caller's context, not by the key name itself.
   */
  protected getErrorCountKey(): string {
    return `${this.id}_error_counts`;
  }

  /**
   * Returns the model for the current step.
   * If a step-specific model is set in settings, it is used, otherwise falls back to the global model.
   */
  protected getStepModel(context: StepContext): string {
    const { settings, ai } = context;
    const stepId = this.id;
    if (stepId === STEPS.INITIAL && settings.initialModel) return settings.initialModel;
    if (stepId === STEPS.REFINEMENT && settings.refinementModel) return settings.refinementModel;
    if (stepId === STEPS.SYNTHESIS && settings.synthesisModel) return settings.synthesisModel;
    return ai?.getDefaultModel(settings) || settings.model;
  }

  /**
   * Returns the model for the current agent based on role and step configuration.
   * Priority: Role model > Step model > Global model
   */
  protected getRoleModel(context: StepContext, agentIndex: number, roleType: RoleType): string {
    const { settings } = context;
    // Early return if no role profiles
    if (!settings.roleProfiles || settings.roleProfiles.length === 0) {
        return this.getStepModel(context);
    }

    // 1. Try to get role-specific model
    const activeRoleProfile = settings.roleProfiles.find(p => p.id === settings.activeRoleProfileId) || settings.roleProfiles[0];
    if (!activeRoleProfile) {
        return this.getStepModel(context);
    }

    const roleList = roleType === 'roles' ? activeRoleProfile.roles : activeRoleProfile.criticRoles;
    const roleIndex = roleList?.length ? agentIndex % roleList.length : agentIndex;
    const role = roleList?.[roleIndex];
    
    if (role?.model) {
        return role.model;
    }
    
    // 2. Fallback to step model (which falls back to global)
    return this.getStepModel(context);
  }



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
    usage: TokenUsage | null,
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

    /**
     * INDEX NORMALIZATION
     * - 'index' is the execution index (0 to N). For synthesis, it's always 0.
     * - 'storageIndex' is the persistence index. 
     * - CRITICAL: Synthesis ALWAYS uses -1 in results storage to maintain its 
     *   distinct object-based structure {text, sources} vs agent result arrays.
     */
    const storageIndex = (stepId === STEPS.SYNTHESIS) ? -1 : index;

    // Update main text results
    if (options.localResults) {
      options.localResults[index] = text;
      work.results[stepId] = [...options.localResults];
    } else {
      // In regeneration, localResults is usually missing, so update work.results directly
      const current = work.results[stepId];
      if (storageIndex === -1) {
          /**
           * SYNTHESIS DATA STRUCTURE
           * Synthesis results are stored as a single object (not a string array)
           * because they optionally contain metadata like 'sources' or 'error' info.
           * This object shape is expected by getStepResults() helpers.
           */
          // Synthesis/Single agent
          // Always maintain object shape for synthesis - { text, sources? }
          if (isSynthesisResult(current)) {
              work.results[STEPS.SYNTHESIS] = { ...current, text };
          } else {
              // Initialize as object from first chunk
              work.results[STEPS.SYNTHESIS] = { text };
          }
      } else {
          // Multi-agent array (Drafters/Critics)
          const newArray = Array.isArray(current) ? [...current] : Array(settings.numAgents).fill('');
          // Ensure array is large enough (e.g. if numAgents changed or migration)
          if (newArray.length <= storageIndex) {
            const padding = Array(Math.max(settings.numAgents, storageIndex+1) - newArray.length).fill('');
            newArray.push(...padding);
          }
          newArray[storageIndex] = text;
          work.results[stepId] = newArray;
      }
    }

    // Update thoughts
    if (thought) {
      const thoughtsKey = storageIndex === -1 ? `${stepId}_thought` : `${stepId}_thoughts`;
      if (storageIndex === -1) {
        work.results[thoughtsKey] = thought;
      } else {
        if (!work.results[thoughtsKey] || !Array.isArray(work.results[thoughtsKey])) {
          work.results[thoughtsKey] = Array(settings.numAgents).fill('');
        }
        (work.results[thoughtsKey] as string[])[storageIndex] = thought;
      }
    }


    // Update usage
    if (usage) {
      const usageKey = `${stepId}_usage`;
      if (storageIndex === -1) {
        work.results[usageKey] = usage;
      } else {
        this.ensureStepUsage(work, stepId, settings.numAgents)[storageIndex] = usage;
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
     /**
      * SYNC WARNING
      * We MUST use storageIndex here. If we use 'index' (0) for synthesis, the store
      * will incorrectly create an array [text] instead of an object {text, sources}.
      * This breaks 'synthesisText' retrieval in the UI (ShowWork).
      */
     useAgentStore.getState().updateWorkResult(stepId, storageIndex, { text, thought, usage });

     const hasContent = text.length > 0;
     const hasThought = !!(thought && thought.length > 0);
     const hasUsage = !!usage;

     // Allow UI updates even if text is empty!
     // Issue: Some providers (like OpenRouter with reasoning models) send 'thought' or 'usage' chunks 
     // BEFORE any actual text content. If we only gate this on (text.length > 0), the UI (TokenUsage panel, 
     // Thinking state) will remain stale until the first text character arrives.
     // This ensures the "Show Work" token counter updates immediately during the reasoning phase.
     if ((hasContent || hasThought || hasUsage) && onMessageUpdate && options.streamToMessage) {
       onMessageUpdate(text, options.isFirstChunk ?? false, thought, usage);
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
    const currentStatus: AgentState['status'] = states[index]?.status || 'working';
    const nextStatus: AgentState['status'] = this.id === STEPS.SYNTHESIS ? currentStatus : 'working';
    const label = `Retrying (Attempt ${attempt})...`;

    const updated = this.updateAgentStatus(states, index, nextStatus, label);
    
    // CRITICAL: Restore loading indicator when any retry starts
    useAgentStore.getState().setIsLoading(true);

    updateAgentStatus(
      this.id,
      index,
      nextStatus,
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
        
        logger.debug(`[Agent ${i + 1}] FAILURE DETAILS:`, {
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
  ): (TokenUsage | null)[] {
    this.ensureResults(work);
    const key = `${stepId}_usage`;
    if (!Array.isArray(work.results[key])) {
      // Always initialize as an array to allow indexed access
      work.results[key] = Array(numAgents).fill(null);
    }
    return work.results[key] as (TokenUsage | null)[];
  }

  /**
   * Ensures debugInfo structure is initialized for a step.
   * Returns the initialized debugInfo array (or object).
   */
  protected ensureDebugInfo(
    work: StepContext['work'], 
    stepId: StepId,
    isArray = true
  ): StepDebugInfo[] | StepDebugInfo {
    if (!work.debugInfo) work.debugInfo = {};
    if (!work.debugInfo[stepId]) {
      // Type assertion needed: DebugInfo's index signature requires intersection of array & object types
      // which is impossible to satisfy. This is safe because we control initialization via isArray.
      (work.debugInfo as Record<string, StepDebugInfo | StepDebugInfo[]>)[stepId] = 
        isArray ? [] : ({} as StepDebugInfo);
    }
    return work.debugInfo[stepId] as StepDebugInfo[] | StepDebugInfo;
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

    // Initialize persistent error counts if simulating errors
    if (config.simulateError && config.simulateError !== 'none') {
      const errorKey = this.getErrorCountKey();
      if (!Array.isArray(work.results[errorKey])) {
        work.results[errorKey] = Array(settings.numAgents).fill(0);
      }
    }

    // Standardized initialization of agent states
    let currentAgentStates = this.initializeAgentStates(context);
    const stepConfig = getStepConfig(stepId);

    // Execute agents in parallel
    const agentPromises = Array(settings.numAgents).fill(0).map(async (_, i) => {
      const { systemInstruction, userTurn, mainChatHistory } = config.prepareAgent(i);

      // Capture debug info
      this.ensureDebugInfo(work, stepId);
      work.debugInfo[stepId][i] = { systemInstruction, history: mainChatHistory, userTurn };

      // Determine model for this specific agent based on role
      const agentModel = this.getRoleModel(context, i, stepId === STEPS.INITIAL ? 'roles' : 'criticRoles');

      const { text: fullText } = await this.runModelStream(
        {
          ai, settings, model: agentModel,
          contents: [...mainChatHistory, userTurn],
          systemInstruction,
          tools: config.tools,
          signal,
          agentIndex: i,
          simulateError: config.simulateError,
          simulateErrorAttempts: config.simulateErrorAttempts,
          work: context.work,
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
    const { ai, settings, model, contents, systemInstruction, tools, signal, agentIndex, devModeDuration, simulateError, simulateErrorAttempts, work: configWork } = config;
    const logger = new Logger(`${this.id}${agentIndex !== undefined ? `:Agent${agentIndex + 1}` : ''}`, settings.debugMode);

    // Persistent error simulation logic (works across manual regenerations)
    if (simulateError && simulateError !== 'none') {
      const maxErrorAttempts = simulateErrorAttempts ?? 1;

      // Use work from config (passed from context) or fallback to store
      const targetWork = configWork || useAgentStore.getState().currentWork;
      
      if (targetWork) {
        this.ensureResults(targetWork);
        const errorKey = this.getErrorCountKey();
        
        let currentCount: number;
        if (agentIndex === undefined) {
          currentCount = (targetWork.results[errorKey] as number) || 0;
        } else {
          /**
           * ERROR SIMULATION PERSISTENCE MODEL
           * Synthesis models use a scalar 'number' for errors (since there is only 1 agent).
           * Multi-agent steps (Initial/Refinement) use an 'Array<number>'.
           * 
           * MIGRATION LOGIC:
           * If we encounter a scalar where an array is expected (e.g. if a step was 
           * converted from single to multi-agent), we migrate it on-the-fly to 
           * prevent regeneration from seeing a stale "failed" state globally.
           */
          if (!Array.isArray(targetWork.results[errorKey])) {
            const previousValue = (targetWork.results[errorKey] as number) || 0;
            const migratedArray = Array(settings.numAgents).fill(0);
            if (agentIndex === 0) migratedArray[0] = previousValue;
            targetWork.results[errorKey] = migratedArray;
            logger.debug(`SIMULATION: Migrated scalar error count (${previousValue}) to array for agent ${agentIndex}`);
          }
          currentCount = (targetWork.results[errorKey] as number[])[agentIndex] || 0;
        }

        if (currentCount < maxErrorAttempts) {
          // Increment and save count
          if (agentIndex === undefined) {
            targetWork.results[errorKey] = currentCount + 1;
          } else {
            (targetWork.results[errorKey] as number[])[agentIndex] = currentCount + 1;
          }
          
          // Update store to persist count
          useAgentStore.getState().setCurrentWork({ ...targetWork });

          logger.debug(`SIMULATION: Throwing simulated ${simulateError} error (Persistent Attempt ${currentCount + 1}/${maxErrorAttempts})`);
          
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
        } else {
          logger.debug(`SIMULATION: Success after ${maxErrorAttempts} persistent failed attempts`);
        }
      }
    }

    let fullText = '';
    let fullThought = '';
    const allGroundingChunks: GroundingChunk[] = [];
    let lastUsage: TokenUsage | null = null;
    let chunkCount = 0;
    let hadAnyText = false;
    let hadAnyThought = false;
    let hadAnyUsage = false;
    let lastChunkTextLen = 0;
    let lastChunkThoughtLen = 0;
    let lastChunkHadText = false;
    let lastChunkHadThought = false;
    let lastChunkHadUsage = false;

    if (settings.devMode) {
      logger.debug('Using DEV MODE (simulated response)');
      const dummyText = this.getDevModeText(this.id, agentIndex);
      fullText = await this.simulateDevMode(
        dummyText,
        signal,
        (chunk) => {
          chunkCount++;
          lastChunkTextLen = chunk.length;
          lastChunkThoughtLen = 0;
          lastChunkHadText = chunk.length > 0;
          lastChunkHadThought = false;
          lastChunkHadUsage = false;
          if (lastChunkHadText) {
            hadAnyText = true;
          }

          callbacks.onChunk(chunk, '', null);
        },
        devModeDuration ?? (DEV_MODE_DURATIONS[this.id] || 1000)
      );
      logger.debug('DEV MODE complete', { textLength: fullText.length });
    } else {
      if (!ai) throw new AppError("API Key not found", ErrorCode.INVALID_SETTINGS);

      // Centralized routing log - shows exactly how the request is being routed
      const isProxy = ai.isProxy;
      const route = isProxy ? 'proxy' : 'direct';
      const providerName = ai.name === 'proxy' ? ProviderType.Gemini : ai.name;

      logger.info(`> [ROUTING] MODEL: ${model} | PROVIDER: ${providerName} | ROUTE: ${route} <`, {
        step: this.id,
        agent: agentIndex,
        devMode: settings.devMode
      });
      
      try {
        await withRetry(async () => {
          // Reset accumulators for each attempt to ensure clean regeneration if retried
          fullText = '';
          fullThought = '';
          allGroundingChunks.length = 0;
          lastUsage = null;
          chunkCount = 0;
          hadAnyText = false;
          hadAnyThought = false;
          hadAnyUsage = false;
          lastChunkTextLen = 0;
          lastChunkThoughtLen = 0;
          lastChunkHadText = false;
          lastChunkHadThought = false;
          lastChunkHadUsage = false;

          const config = {
            ...getGenerationConfig(model, settings.temperature, settings.maxOutputTokens, settings.unsafeTemperature),
            systemInstruction,
            tools,
          };

          logger.info(`[Direct SDK Call] Starting stream for model: ${model}`, { config });

          const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              ...getGenerationConfig(model, settings.temperature, settings.maxOutputTokens, settings.unsafeTemperature),
              systemInstruction,
              tools,
            },
          });

          for await (const chunk of stream.stream) {
            if (signal.aborted) {
              logger.debug('Aborted by signal');
              throw new Error('Aborted');
            }

            chunkCount++;
            
            const { text, thought, usage, groundingChunks } = chunk;
            lastChunkTextLen = text.length;
            lastChunkThoughtLen = thought?.length || 0;
            lastChunkHadText = text.length > 0;
            lastChunkHadThought = (thought?.length || 0) > 0;
            lastChunkHadUsage = !!usage;
            if (lastChunkHadText) {
              hadAnyText = true;
            }
            if (lastChunkHadThought) {
              hadAnyThought = true;
            }
            if (lastChunkHadUsage) {
              hadAnyUsage = true;
            }
            
            // Log first chunk details or when thought content appears
            const isFirstThought = thought && !fullThought;
            if (chunkCount === 1 || isFirstThought) {
              logger.debug(`Chunk #${chunkCount}`, { 
                textLen: text.length, 
                thoughtLen: thought?.length || 0,
                hasText: text.length > 0,
                hasThought: (thought?.length || 0) > 0,
                isFirstThought
              });
            }

            fullText += text;
            if (thought) {
              fullThought += thought;
            }

            if (usage) {
              lastUsage = usage;
            }
            
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
        
      logger.debug('Stream complete', {
        chunkCount,
        textLength: fullText.length,
        thoughtLength: fullThought.length,
        hadAnyText,
        hadAnyThought,
        hadAnyUsage,
        lastChunkTextLen,
        lastChunkThoughtLen,
        lastChunkHadText,
        lastChunkHadThought,
        lastChunkHadUsage,
      });
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
    roleType?: RoleType,
    tools?: Tool[],
    onFirstTextChunk?: () => void,
    simulateError?: SimulateError,
    simulateErrorAttempts?: number
  ): Promise<{ text: string; work: Work; groundingChunks?: GroundingChunk[] }> {
    const { ai, settings, work, signal, messageId } = context;
    if (!ai) throw new AppError("API Key not found", ErrorCode.INVALID_SETTINGS);

    const { systemInstruction, userTurn, mainChatHistory } = instruction;
    let currentAgentStates = agentStates;

    // Capture debug info for regeneration
    this.ensureDebugInfo(work, this.id);
    (work.debugInfo[this.id] as StepDebugInfo[])[agentIndex] = {
      systemInstruction,
      history: mainChatHistory,
      userTurn
    };

    const config = getStepConfig(this.id);
    
    // Create jump tracker if callback is provided (used for synthesis regeneration)
    const jumpTracker = createFirstTextJumpTracker(onFirstTextChunk);
    
    // Set initial 'working' status - Step manages its own lifecycle
    updateAgentStatus(this.id, agentIndex, 'working', messageId);

    // Clear previous usage to avoid displaying stale data during regeneration
    this.ensureStepUsage(work, this.id, settings.numAgents)[agentIndex] = null;
    
    /**
     * STATE CLEARING FOR REGENERATION
     * When regenerating, we MUST clear BOTH text and usage.
     * 
     * CRITICAL for Synthesis:
     * If synthesis text is NOT cleared, ShowWork will see 'isWorking=true' AND 
     * 'hasContent=true' (from the old text) and collapse the cards IMMEDIATELY
     * before the new first chunk arrives. Clearing text ensures cards stay open
     * until the new synthesis actually starts producing text.
     */
    const storageIndex = (this.id === STEPS.SYNTHESIS) ? -1 : agentIndex;
    if (this.id === STEPS.SYNTHESIS) {
      // Maintain object structure {text, sources} but clear text
      const current = work.results[this.id];
      work.results[this.id] = typeof current === 'object' && !Array.isArray(current) && current !== null
        ? { ...current, text: '' } 
        : { text: '' };
    } else {
      // Multi-agent array - clear specific agent's text
      const arr = Array.isArray(work.results[this.id]) 
        ? [...work.results[this.id] as string[]] 
        : Array(settings.numAgents).fill('');
      arr[agentIndex] = '';
      work.results[this.id] = arr;
    }
    
    // Clear store as well (usage AND text)
    useAgentStore.getState().updateWorkResult(this.id, storageIndex, { usage: null, text: '' });
    
    // Determine model
    const model = roleType 
        ? this.getRoleModel(context, agentIndex, roleType)
        : this.getStepModel(context);

    try {
      const { text: fullText, usage: finalUsage, groundingChunks } = await this.runModelStream(
        {
          ai, settings, model,
          contents: [...mainChatHistory, userTurn],
          systemInstruction,
          tools: tools ?? [{ googleSearch: {} }],
          signal,
          agentIndex,
          simulateError,
          simulateErrorAttempts,
          work: context.work
        },
        {
          onChunk: (text, thought, usage) => {
            // Use jumpTracker to manage first text chunk detection
            const shouldTriggerCallback = jumpTracker.processChunk(text);
            
            // CRITICAL: Update store with text BEFORE triggering callback
            // ShowWork's useEffect needs synthesisText to be present
            this.handleStreamChunk(context, agentIndex, text, thought, usage, {
              isFirstChunk: false,
              streamToMessage: true,
              agentStates: currentAgentStates,
              statusMsg: config.progressMsg
            });
            
            // Trigger first text chunk callback AFTER store is updated (for synthesis jump)
            if (shouldTriggerCallback) {
              jumpTracker.executeJump();
            }
          },
          onRetry: (attempt) => {
            jumpTracker.reset(); // Reset tracker on retry
            currentAgentStates = this.handleRetryProgress(context, agentIndex, attempt, currentAgentStates);
          }
        }
      );
      
      // CRITICAL: Save final usage after streaming completes
      // This ensures token usage displays correctly for regenerated agents
      if (finalUsage) {
        this.ensureStepUsage(work, this.id, settings.numAgents)[agentIndex] = finalUsage;
        
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
    tools?: Tool[],
    simulateError?: SimulateError,
    simulateErrorAttempts?: number
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
      undefined, // No roleType for synthesis
      tools,
      () => context.onSynthesisJump?.(), // Pass callback for synthesis jump
      simulateError,
      simulateErrorAttempts
    );
    
    // Extract sources from grounding chunks
    const sources = this.extractSources(result.groundingChunks);
    
    // Update work.results to include sources
    if (sources && sources.length > 0) {
      this.ensureResults(result.work);
      const currentResult = result.work.results?.[this.id];
      if (isSynthesisResult(currentResult)) {
        result.work.results[STEPS.SYNTHESIS] = { ...currentResult, sources };
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
