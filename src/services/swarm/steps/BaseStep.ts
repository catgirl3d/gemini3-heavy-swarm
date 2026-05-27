import { type StepDescriptor, type StepContext, type StepId, STEPS, type StreamConfig, type StreamCallbacks, type StreamResult, type AgentInstruction, type MultiAgentConfig } from '@/types/steps';
import { type SimulateError, ProviderType, type RoleType } from '@/types';
import { type Tool } from '@google/genai';
import { getStepConfig, type StepConfig } from '@/utils/swarm/stepConstants';
import type { GroundingChunk } from './utils/streamUtils';
import { type AgentState, type Source, type TokenUsage, type Work, type StepDebugInfo, type WorkResultUpdates } from '@/types';
import { createAgentStates, updateAgentState, updateAgentStateById } from './utils/agentStateUtils';
import { simulateStreaming, getDevModeText, DEV_MODE_DURATIONS } from './utils/devModeUtils';
import { extractTextFromParts, extractTokenUsage } from './utils/streamUtils';
import { getErrorLabel, getFriendlyErrorMessage } from './utils/errorUtils';
import { getGenerationConfig } from '@/services/proxy/geminiConfig';
import { Logger } from '@shared/utils/logger';
import { AppError, ErrorCode } from '@/utils/errors/AppError';
import { withRetry } from '@/utils/common/retryStrategy';
import { useAgentStore } from '@/stores/agentStore';
import { updateAgentStatus, updateAgentStatusIfChanged } from '@/utils/swarm/statusHelpers';
import { createFirstTextJumpTracker } from '@/utils/swarm/jumpHelper';
import { LiveWorkSyncBuffer } from './utils/liveWorkSyncBuffer';

// Small delay to batch token-level stream noise while keeping the first visible chunk immediate.
const LIVE_WORK_SYNC_THROTTLE_MS = 75;

export abstract class BaseStep implements StepDescriptor {
  private readonly liveWorkSyncBuffer = new LiveWorkSyncBuffer({
    throttleMs: LIVE_WORK_SYNC_THROTTLE_MS,
    onFlush: (messageId, stepId, agentIndex, updates) => {
      useAgentStore.getState().updateSessionWorkResult(messageId, stepId, agentIndex, updates);
    },
  });

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
  /**
   * Returns the storage key used for persistent error simulation counts.
   */
  protected getErrorCountKey(): string {
    return `${this.id}_error_counts`;
  }

  protected getStepSlotCount(stepId: StepId, numAgents: number, agentIndex = 0): number {
    if (stepId === STEPS.SYNTHESIS) {
      return 1;
    }

    return Math.max(numAgents, agentIndex + 1);
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
    return ai?.getDefaultModel(settings) || settings.geminiModel;
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

  protected syncLiveWork(context: Pick<StepContext, 'messageId'>, work: Work): void {
    const nextWork = { ...work };
    if (!context.messageId) {
      return;
    }

    useAgentStore.getState().replaceSessionWork(context.messageId, nextWork);
  }

  protected syncLiveWorkResult(
    context: Pick<StepContext, 'messageId'>,
    stepId: StepId,
    agentIndex: number,
    updates: WorkResultUpdates,
    options?: { forceImmediate?: boolean }
  ): void {
    if (!context.messageId) {
      return;
    }

    this.liveWorkSyncBuffer.buffer(context.messageId, stepId, agentIndex, updates, options);
  }

  protected flushLiveWorkResult(
    context: Pick<StepContext, 'messageId'>,
    stepId: StepId,
    agentIndex: number,
  ): void {
    if (!context.messageId) {
      return;
    }

    this.liveWorkSyncBuffer.flush(context.messageId, stepId, agentIndex);
  }

  protected discardLiveWorkResultBuffer(
    context: Pick<StepContext, 'messageId'>,
    stepId: StepId,
    agentIndex: number,
  ): void {
    if (!context.messageId) {
      return;
    }

    this.liveWorkSyncBuffer.discard(context.messageId, stepId, agentIndex);
  }

  protected discardStepLiveWorkBuffers(context: Pick<StepContext, 'messageId'>, stepId: StepId): void {
    if (!context.messageId) {
      return;
    }

    this.liveWorkSyncBuffer.discardStep(context.messageId, stepId);
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
    const slotCount = this.getStepSlotCount(stepId, settings.numAgents, index);

    // Update main text results
    if (options.localResults) {
      options.localResults[index] = text;
      work.results[stepId] = [...options.localResults];
    } else {
      // In regeneration, localResults is usually missing, so update work.results directly
      const current = work.results[stepId];
      const newArray = Array.isArray(current) ? [...current] : Array(slotCount).fill('');
      if (newArray.length <= index) {
        const padding = Array(index + 1 - newArray.length).fill('');
        newArray.push(...padding);
      }
      newArray[index] = text;
      work.results[stepId] = newArray;
    }

    // Update thoughts
    if (thought) {
      const thoughtsKey = `${stepId}_thoughts`;
      const currentThoughts = Array.isArray(work.results[thoughtsKey])
        ? [...work.results[thoughtsKey] as string[]]
        : Array(slotCount).fill('');
      if (currentThoughts.length <= index) {
        const padding = Array(index + 1 - currentThoughts.length).fill('');
        currentThoughts.push(...padding);
      }
      currentThoughts[index] = thought;
      work.results[thoughtsKey] = currentThoughts;
    }


    // Update usage
    if (usage) {
      this.ensureStepUsage(work, stepId, slotCount)[index] = usage;
    }

    // Optional UI updates
    if (options.statusMsg) {
      // Use conditional update to prevent redundant store updates during streaming
      updateAgentStatusIfChanged(stepId, index, 'working', context.messageId, options.statusMsg);
    }

    // SYNC: Ensure work results are updated in the global store for live streaming visibility
    // Use atomic update to prevent race conditions during parallel execution
    const liveWorkUpdates: WorkResultUpdates = {};
    if (text.length > 0) {
      liveWorkUpdates.text = text;
    }
    if (thought.length > 0) {
      liveWorkUpdates.thought = thought;
    }
    if (usage) {
      liveWorkUpdates.usage = usage;
    }

    if (Object.keys(liveWorkUpdates).length > 0) {
      this.syncLiveWorkResult(context, stepId, index, liveWorkUpdates);
    }

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
    
    context.onRetryProgress?.();

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
   * Hydrates per-step agent states from work.agentStates when available.
   * Missing indices fall back to waiting placeholders for this step.
   */
  protected hydrateAgentStates(context: StepContext): AgentState[] {
    const { settings, messageId, work } = context;
    const config = getStepConfig(this.id);

    const states = this.createAgentStates(settings.numAgents, settings, {
      stepId: this.id,
      status: 'waiting',
      statusLabel: config.labels.waiting,
      messageId
    });

    (work.agentStates ?? []).forEach(agent => {
      if (agent.stepId !== this.id || typeof agent.agentIndex !== 'number' || agent.agentIndex < 0 || agent.agentIndex >= states.length) {
        return;
      }

      states[agent.agentIndex] = {
        ...states[agent.agentIndex],
        ...agent,
        stepId: this.id,
        agentIndex: agent.agentIndex,
        messageId: messageId ?? agent.messageId,
      };
    });

    return states;
  }

  /**
   * Standardized initialization of the agent states that will run now.
   * Already-completed sibling agents keep their existing state for partial stale reruns.
   */
  protected initializeAgentStates(context: StepContext, agentIndicesToRun?: number[]): AgentState[] {
    const { messageId } = context;
    const config = getStepConfig(this.id);
    const states = this.hydrateAgentStates(context);
    const indicesToRun = new Set(agentIndicesToRun ?? states.map((_, index) => index));

    states.forEach((state, i) => {
      if (!indicesToRun.has(i)) {
        return;
      }

      states[i] = {
        ...state,
        status: 'working',
        label: config.labels.working,
        stepId: this.id,
        agentIndex: i,
        messageId,
      };

      updateAgentStatus(
        this.id,
        i,
        'working',
        messageId,
        config.labels.working,
        states[i].name
      );
    });

    return states;
  }

  /**
   * Resets one agent slot before a fresh stream starts so stale text/thought/usage
   * do not remain visible while the agent is already marked as working.
   */
  protected resetAgentSlotForFreshStream(
    context: StepContext,
    agentIndex: number,
    slotCount: number,
    options?: { localResults?: string[] }
  ): void {
    const { work } = context;
    this.ensureResults(work);

    const currentResults = Array.isArray(work.results[this.id])
      ? [...work.results[this.id] as (string | null)[]]
      : Array(slotCount).fill('');
    if (currentResults.length <= agentIndex) {
      currentResults.push(...Array(agentIndex + 1 - currentResults.length).fill(''));
    }
    const hadText = currentResults[agentIndex] !== '';
    currentResults[agentIndex] = '';
    work.results[this.id] = currentResults;
    if (options?.localResults) {
      options.localResults[agentIndex] = '';
    }

    const thoughtsKey = `${this.id}_thoughts`;
    const currentThoughts = Array.isArray(work.results[thoughtsKey])
      ? [...work.results[thoughtsKey] as (string | null)[]]
      : Array<string | null>(slotCount).fill('');
    if (currentThoughts.length <= agentIndex) {
      currentThoughts.push(...Array<string | null>(agentIndex + 1 - currentThoughts.length).fill(''));
    }
    const hadThought = currentThoughts[agentIndex] !== '';
    currentThoughts[agentIndex] = '';
    work.results[thoughtsKey] = currentThoughts;

    const stepUsage = this.ensureStepUsage(work, this.id, slotCount);
    const hadUsage = stepUsage[agentIndex] !== null;
    stepUsage[agentIndex] = null;

    if (hadText || hadThought || hadUsage) {
      this.syncLiveWorkResult(context, this.id, agentIndex, { text: '', thought: '', usage: null }, { forceImmediate: true });
    }
  }

  protected getAgentIndicesToRun(work: Work, agentStates: AgentState[], slotCount: number): number[] {
    const stepStatus = work.stepMetadata?.find(meta => meta.id === this.id)?.status;
    if (stepStatus !== 'stale') {
      return Array.from({ length: slotCount }, (_, index) => index);
    }

    const incompleteIndices = agentStates
      .filter(agent => agent.status !== 'done')
      .map(agent => agent.agentIndex)
      .filter((index): index is number => typeof index === 'number');

    return incompleteIndices;
  }

  /**
   * Processes settled outcomes from multiple agents, handles errors, and updates states.
   */
  protected processSettledOutcomes(
    context: StepContext,
    outcomes: PromiseSettledResult<string>[],
    results: string[],
    agentStates: AgentState[],
    executionIndices?: number[]
  ): { updatedStates: AgentState[]; failures: unknown[] } {
    const { settings } = context;
    const failures: unknown[] = [];
    let updatedStates = [...agentStates];

    outcomes.forEach((outcome, i) => {
      const agentIndex = executionIndices?.[i] ?? i;
      const logger = new Logger(this.id, settings.debugMode);
      if (outcome.status === 'rejected') {
        const reason = outcome.reason;
        failures.push(reason);
        logger.error(`Agent ${agentIndex + 1} failed:`, reason);
        
        logger.debug(`[Agent ${agentIndex + 1}] FAILURE DETAILS:`, {
          error: reason instanceof Error ? reason.message : String(reason),
          textLength: results[agentIndex]?.length || 0,
          hasContent: (results[agentIndex]?.length || 0) > 0
        });
        

        
        const errorLabel = this.getErrorLabel(reason, getStepConfig(this.id).labels.error);
        updatedStates = this.updateAgentState(updatedStates, agentIndex, { 
          status: 'error',
          label: errorLabel,
          stepId: this.id,
          messageId: updatedStates[agentIndex]?.messageId
        });

        // Mirror the failed agent state into the live session store.
        updateAgentStatus(
          this.id,
          agentIndex,
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
    failures: unknown[],
  ): string[] {
    const { work } = context;

    // Fail-fast on any agent's failure during the step execution
    const shouldAbort = failures.length > 0;

    if (shouldAbort) {
        work.results[this.id] = [...results];
        this.discardStepLiveWorkBuffers(context, this.id);
        this.syncLiveWork(context, work);
        throw failures[0];
    }

    work.results[this.id] = [...results];
    this.discardStepLiveWorkBuffers(context, this.id);
    this.syncLiveWork(context, work);
    
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
   * Returns the initialized usage array.
   */
  protected ensureStepUsage(
    work: StepContext['work'], 
    stepId: StepId, 
    slotCount: number
  ): (TokenUsage | null)[] {
    this.ensureResults(work);
    const key = `${stepId}_usage`;
    if (!Array.isArray(work.results[key])) {
      // Always initialize as an array to allow indexed access
      work.results[key] = Array(slotCount).fill(null);
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

    this.ensureResults(work);
    const existingResults = Array.isArray(work.results[stepId])
      ? work.results[stepId] as (string | null)[]
      : [];
    const results: string[] = Array.from({ length: settings.numAgents }, (_, index) => existingResults[index] ?? '');

    // Initialize persistent error counts if simulating errors
    if (config.simulateError && config.simulateError !== 'none') {
      const errorKey = this.getErrorCountKey();
      if (!Array.isArray(work.results[errorKey])) {
        work.results[errorKey] = Array(settings.numAgents).fill(0);
      }
    }

    const hydratedAgentStates = this.hydrateAgentStates(context);
    const agentIndicesToRun = this.getAgentIndicesToRun(work, hydratedAgentStates, settings.numAgents);
    agentIndicesToRun.forEach((index) => {
      this.resetAgentSlotForFreshStream(context, index, this.getStepSlotCount(stepId, settings.numAgents, index), { localResults: results });
    });
    let currentAgentStates = this.initializeAgentStates(context, agentIndicesToRun);
    const stepConfig = getStepConfig(stepId);

    // Execute agents in parallel
    const agentPromises = agentIndicesToRun.map(async (i) => {
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
          messageId: context.messageId,
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
    const { updatedStates, failures } = this.processSettledOutcomes(context, outcomes, results, currentAgentStates, agentIndicesToRun);
    
    return this.finalizeStep(context, results, failures);
  }

  protected async runModelStream(
    config: StreamConfig,
    callbacks: StreamCallbacks
  ): Promise<StreamResult> {
    const { ai, settings, model, contents, systemInstruction, tools, signal, agentIndex, devModeDuration, simulateError, simulateErrorAttempts, work: configWork, messageId } = config;
    const logger = new Logger(`${this.id}${agentIndex !== undefined ? `:Agent${agentIndex + 1}` : ''}`, settings.debugMode);

    // Persistent per-agent simulated error logic shared by normal execution and regeneration.
    if (simulateError && simulateError !== 'none') {
      const maxErrorAttempts = simulateErrorAttempts ?? 1;

      // Persist simulated error counts on the current work snapshot passed into the stream.
      const targetWork = configWork;
      
      if (targetWork) {
        this.ensureResults(targetWork);
        const errorKey = this.getErrorCountKey();
        const errorCountIndex = agentIndex ?? 0;

        if (!Array.isArray(targetWork.results[errorKey])) {
          targetWork.results[errorKey] = Array(this.getStepSlotCount(this.id, settings.numAgents, errorCountIndex)).fill(0);
        }

        const currentCount = (targetWork.results[errorKey] as number[])[errorCountIndex] || 0;

        if (currentCount < maxErrorAttempts) {
          // Increment and save count
          (targetWork.results[errorKey] as number[])[errorCountIndex] = currentCount + 1;
          
          // Persist the updated counter without replacing unrelated live results.
          if (messageId) {
            const store = useAgentStore.getState();
            const latestSessionWork = store.sessionsByMessageId[messageId]?.work;
            const errorCounts = [...targetWork.results[errorKey] as number[]];
            const workToPersist: Work = latestSessionWork
              ? {
                  ...latestSessionWork,
                  results: {
                    ...(latestSessionWork.results ?? {}),
                    [errorKey]: errorCounts,
                  },
                }
              : targetWork;

            store.replaceSessionWork(messageId, workToPersist);
          }

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
          // Reset accumulators for each retry attempt so each stream attempt starts clean.
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
   * Shared regeneration logic for one agent slot within a step.
   * Used by multi-agent steps directly and by synthesis via its single slot.
   * Handles complete lifecycle: status initialization, streaming, slot-scoped live sync,
   * final status updates, and error handling.
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
    const stepWasStale = work.stepMetadata?.find(meta => meta.id === this.id)?.status === 'stale';

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
    
    // Set the live card to the step-specific in-progress label immediately on click,
    // before the first streamed chunk arrives.
    updateAgentStatus(this.id, agentIndex, 'working', messageId, config.progressMsg);

    const slotCount = this.getStepSlotCount(this.id, settings.numAgents, agentIndex);
    this.resetAgentSlotForFreshStream(context, agentIndex, slotCount);
    
    // Determine model
    const model = roleType 
        ? this.getRoleModel(context, agentIndex, roleType)
        : this.getStepModel(context);

    try {
      const { text: fullText, thought: fullThought, usage: finalUsage, groundingChunks } = await this.runModelStream(
        {
          ai, settings, model,
          contents: [...mainChatHistory, userTurn],
          systemInstruction,
          tools: tools ?? [{ googleSearch: {} }],
          signal,
          agentIndex,
          messageId,
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
        this.ensureStepUsage(work, this.id, slotCount)[agentIndex] = finalUsage;
      }

      const finalLiveWorkUpdates: WorkResultUpdates = {
        text: fullText,
        thought: fullThought,
        ...(finalUsage ? { usage: finalUsage } : {}),
      };

      // Flush the final per-agent result before marking the card done so parallel
      // regenerations do not overwrite each other with a stale full-work snapshot.
      this.syncLiveWorkResult(context, this.id, agentIndex, finalLiveWorkUpdates, { forceImmediate: true });
      
      // Set final 'done' status after successful completion
      currentAgentStates = this.updateAgentStatus(currentAgentStates, agentIndex, 'done');
      updateAgentStatus(this.id, agentIndex, 'done', messageId);

      const liveSessionAgents = messageId
        ? (useAgentStore.getState().sessionsByMessageId?.[messageId]?.agentStates ?? [])
        : [];
      const liveStepAgentStates = messageId
        ? liveSessionAgents.filter(agent => agent.stepId === this.id)
        : currentAgentStates;
      const stepAgentStates = liveStepAgentStates.length >= slotCount
        ? liveStepAgentStates
        : currentAgentStates;
      const allStepAgentsDone = stepAgentStates.length >= slotCount
        && stepAgentStates.every(agent => agent.status === 'done');

      // Keep stale multi-agent steps stale until every slot has been refreshed.
      if (!stepWasStale || this.id === STEPS.SYNTHESIS || allStepAgentsDone) {
        this.updateStepMetadata(work, 'done');
      }
      
      // Final result is already synced atomically; only clear the throttle buffer entry.
      this.discardLiveWorkResultBuffer(context, this.id, agentIndex);
      
      return { text: fullText, work, groundingChunks };
    } catch (error) {
      // Mark this agent slot as failed and keep the local work snapshot aligned with streamed state.
      const errorLabel = this.getErrorLabel(error, config.labels.error);
      updateAgentStatus(this.id, agentIndex, 'error', messageId, errorLabel);
      
      // Preserve the current lane contents locally and attach synthesis-specific error sidecars when needed.
      this.ensureResults(work);
      const currentResults = Array.isArray(work.results[this.id]) 
        ? [...(work.results[this.id] as string[])]
        : Array(slotCount).fill('');
      
      // Preserve any partial text that was streamed before error
      work.results[this.id] = currentResults;

      if (this.id === STEPS.SYNTHESIS) {
        delete work.results[`${this.id}_sources`];
        work.results[`${this.id}_error`] = {
          flag: true,
          message: this.getFriendlyErrorMessage(error),
        };
      }
      
      // Flush the current slot back into the live store without replacing sibling slots.
      const currentText = Array.isArray(work.results[this.id])
        ? (work.results[this.id] as (string | null)[])[agentIndex]
        : undefined;
      const currentThought = Array.isArray(work.results[`${this.id}_thoughts`])
        ? (work.results[`${this.id}_thoughts`] as (string | null)[])[agentIndex]
        : undefined;
      const currentUsage = Array.isArray(work.results[`${this.id}_usage`])
        ? (work.results[`${this.id}_usage`] as (TokenUsage | null)[])[agentIndex]
        : undefined;
      const partialLiveWorkUpdates: WorkResultUpdates = {
        ...(typeof currentText === 'string' ? { text: currentText } : {}),
        ...(typeof currentThought === 'string' ? { thought: currentThought } : {}),
        ...(currentUsage !== undefined ? { usage: currentUsage } : {}),
      };

      if (Object.keys(partialLiveWorkUpdates).length > 0) {
        this.syncLiveWorkResult(context, this.id, agentIndex, partialLiveWorkUpdates, { forceImmediate: true });
      }

      this.discardLiveWorkResultBuffer(context, this.id, agentIndex);
      
      // Re-throw to let caller handle additional UI updates (e.g., message parts)
      throw error;
    }
  }

  /**
   * Updates this step's metadata status inside the provided work snapshot.
   * Used by both full-step execution and per-agent regeneration flows.
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
