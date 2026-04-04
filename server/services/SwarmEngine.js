// server/services/SwarmEngine.js
// V3 Swarm Orchestrator — orchestration engine for multi-agent workflows.
// Manages workflow executions: spawns agent PTYs, routes handoffs, tracks budget.
// See DEC-014 for the swarmListeners tap design.

import { v4 as uuidv4 } from 'uuid';
import HandoffParser from './HandoffParser.js';
import { discoverCodexBinary, discoverGeminiBinary } from './BinaryDiscovery.js';

const SWARM_PROMPT_ECHO_MARKER = '--- END SWARM INPUT ---';
const SWARM_PROMPT_SUBMIT_DELAY_MS = 100;
const SWARM_PROMPT_READY_FALLBACK_MS = 2500;
const SWARM_PROMPT_LINE_INTERVAL_MS = 25;
const SWARM_PROMPT_INTERRUPT_DELAY_MS = 120;
const SWARM_RUNTIME_MENU_SUBMIT_DELAY_MS = 75;
const SWARM_ECHO_MARKER_TIMEOUT_MS = 10000;
const MAX_DONE_REINJECT_ATTEMPTS = 3;
const DEFAULT_SWARM_CODEX_MODEL = 'gpt-5.1-codex';
const DEFAULT_SWARM_GEMINI_MODEL = 'gemini-2.5-pro';
const RUNTIME_PROVIDER = {
  AUTO: 'auto',
  CLAUDE: 'claude',
  CODEX: 'codex',
  GEMINI: 'gemini',
};
const RUNTIME_BLOCKER_PATTERNS = [
  {
    type: 'rate_limited',
    provider: 'claude',
    matches: (text) =>
      text.includes("/rate-limit-options")
      || text.includes("you've hit your limit")
      || text.includes('you have hit your limit')
      || text.includes('usage limit reached'),
    message: 'Claude hit its usage limit before the swarm agent could continue.',
  },
  {
    type: 'provider_unavailable',
    provider: 'codex',
    matches: (text) =>
      text.includes('error: unexpected argument')
      && text.includes('usage: codex'),
    message: 'Codex rejected the configured Swarm launch arguments and could not start an interactive session.',
  },
  {
    type: 'provider_unavailable',
    provider: 'codex',
    matches: (text) =>
      text.includes('unsupported value')
      && text.includes('reasoning.effort'),
    message: 'Codex rejected the current model and reasoning-effort combination before the swarm task could run.',
  },
  {
    type: 'trust_required',
    provider: 'codex',
    matches: (text) =>
      text.includes('do you trust the contents of this directory')
      || text.includes('trust this folder')
      || text.includes('trust this directory'),
    message: 'Codex requires workspace trust before the swarm agent can continue.',
  },
  {
    type: 'rate_limited',
    provider: 'codex',
    matches: (text) =>
      text.includes("you've hit your usage limit")
      || text.includes('purchase more credits')
      || text.includes('try again at'),
    message: 'Codex hit its usage or credit limit before the swarm agent could continue.',
  },
  {
    type: 'prompt_rejected',
    provider: 'codex',
    matches: (text) =>
      text.includes('conversation interrupted - tell the model what to do differently')
      || text.includes('something went wrong? hit `/feedback` to report the issue'),
    message: 'Codex rejected the injected swarm steering prompt and could not continue the workflow in interactive mode.',
  },
  {
    type: 'rate_limited',
    provider: 'gemini',
    matches: (text) =>
      text.includes('resource exhausted')
      || text.includes('rate limit')
      || text.includes('quota exceeded')
      || text.includes('429'),
    message: 'Gemini hit its usage or rate limit before the swarm agent could continue.',
  },
  {
    type: 'provider_unavailable',
    provider: 'gemini',
    matches: (text) =>
      text.includes('not authenticated')
      || text.includes('please sign in')
      || text.includes('login required')
      || text.includes('GEMINI_API_KEY')
      || text.includes('authentication failed')
      || text.includes('api key'),
    message: 'Gemini requires authentication or an API key before the swarm agent can continue.',
  },
];
const RUNTIME_PROVIDER_PROFILES = {
  [RUNTIME_PROVIDER.CLAUDE]: { args: [] },
  [RUNTIME_PROVIDER.CODEX]: {
    buildArgs: () => {
      const args = ['--no-alt-screen', '-a', 'never', '-s', 'workspace-write'];
      const configuredModel = String(process.env.SWARM_CODEX_MODEL ?? '').trim();
      const runtimeModel = configuredModel || DEFAULT_SWARM_CODEX_MODEL;

      if (runtimeModel) {
        args.push('-m', runtimeModel);
      }

      if (process.env.SWARM_CODEX_SKIP_GIT_REPO_CHECK === '1') {
        args.push('--skip-git-repo-check');
      }

      return args;
    },
  },
  [RUNTIME_PROVIDER.GEMINI]: {
    buildArgs: () => {
      const args = [];
      const configuredModel = String(process.env.SWARM_GEMINI_MODEL ?? '').trim();
      const runtimeModel = configuredModel || DEFAULT_SWARM_GEMINI_MODEL;

      if (runtimeModel) {
        args.push('-m', runtimeModel);
      }

      return args;
    },
  },
};

function normalizeRuntimeProvider(provider) {
  const value = String(provider ?? '').trim().toLowerCase();
  if (value === RUNTIME_PROVIDER.CLAUDE || value === RUNTIME_PROVIDER.CODEX || value === RUNTIME_PROVIDER.GEMINI || value === RUNTIME_PROVIDER.AUTO) {
    return value;
  }
  return RUNTIME_PROVIDER.AUTO;
}

// ---------------------------------------------------------------------------
// WorkflowExecution shape (in-memory only, never persisted):
// {
//   executionId: string,
//   workflowId: string,
//   workflowDef: WorkflowDefinition,
//   status: 'running' | 'paused' | 'stopping' | 'stopped' | 'failed' | 'completed',
//   agentStates: Map<nodeId, { sessionId, status, handoffCount, lastOutputSnippet }>,
//   edgeCounters: Map<edgeId, number>,
//   workflowContext: {},
//   heartbeatTimer: NodeJS.Timer | null,
//   inboxItems: []
// }
// ---------------------------------------------------------------------------

class SwarmEngine {
  /**
   * @param {import('./SessionManager.js').SessionManager} sessionManager
   * @param {import('./WorkflowStore.js').WorkflowStore} workflowStore
   */
  constructor(sessionManager, workflowStore, circuitBreaker = null, budgetTracker = null) {
    this._sessionManager = sessionManager;
    this._workflowStore = workflowStore;
    this._circuitBreaker = circuitBreaker;
    this._budgetTracker = budgetTracker;
    this._executions = new Map();   // executionId -> WorkflowExecution
    this._wsBroadcast = null;       // function(executionId, event) — set by swarmHandler
    this._triggerManager = null;    // set by setTriggerManager() after TriggerManager is instantiated
  }

  /**
   * Set the WebSocket broadcast function.
   * Called by swarmHandler.js after wiring up the WS channel.
   * @param {Function} fn - (executionId: string, event: object) => void
   */
  setWsBroadcast(fn) {
    this._wsBroadcast = fn;
  }

  /**
   * Set the TriggerManager instance.
   * Called by server/index.js immediately after TriggerManager is instantiated,
   * so stopExecution() can clean up RSS pollers and webhooks for the execution.
   * @param {import('./TriggerManager.js').default} tm
   */
  setTriggerManager(tm) {
    this._triggerManager = tm;
  }

  _serializeAgentState(state = {}) {
    return {
      sessionId: state.sessionId ?? null,
      provider: state.provider ?? null,
      runtimeProvider: state.runtimeProvider ?? state.provider ?? null,
      status: state.status ?? 'idle',
      handoffCount: state.handoffCount ?? 0,
      lastOutputSnippet: state.lastOutputSnippet ?? '',
      ...(state.runtimeBlocker ? { runtimeBlocker: { ...state.runtimeBlocker } } : {}),
    };
  }

  _serializeRuntimeBlocker(blocker = null) {
    if (!blocker) return null;
    return {
      type: blocker.type,
      provider: blocker.provider,
      message: blocker.message,
      nodeId: blocker.nodeId ?? null,
      detectedAt: blocker.detectedAt ?? null,
    };
  }

  _buildRuntimeProviderStrategy(workflowDef, requestedProvider = null) {
    const normalized = normalizeRuntimeProvider(requestedProvider ?? workflowDef?.settings?.runtimeProvider);
    if (normalized === RUNTIME_PROVIDER.CLAUDE) {
      return {
        mode: RUNTIME_PROVIDER.CLAUDE,
        activeProvider: RUNTIME_PROVIDER.CLAUDE,
        fallbackProvider: null,
        allowFallback: false,
      };
    }
    if (normalized === RUNTIME_PROVIDER.CODEX) {
      return {
        mode: RUNTIME_PROVIDER.CODEX,
        activeProvider: RUNTIME_PROVIDER.CODEX,
        fallbackProvider: null,
        allowFallback: false,
      };
    }
    if (normalized === RUNTIME_PROVIDER.GEMINI) {
      return {
        mode: RUNTIME_PROVIDER.GEMINI,
        activeProvider: RUNTIME_PROVIDER.GEMINI,
        fallbackProvider: null,
        allowFallback: false,
      };
    }
    return {
      mode: RUNTIME_PROVIDER.AUTO,
      activeProvider: RUNTIME_PROVIDER.CLAUDE,
      fallbackProvider: RUNTIME_PROVIDER.CODEX,
      tertiaryProvider: RUNTIME_PROVIDER.GEMINI,
      allowFallback: true,
    };
  }

  async _resolveRuntimeProviderBinary(provider) {
    if (provider === RUNTIME_PROVIDER.CODEX) {
      if (this._sessionManager.codexBin) {
        return this._sessionManager.codexBin;
      }
      return discoverCodexBinary();
    }
    if (provider === RUNTIME_PROVIDER.GEMINI) {
      if (this._sessionManager.geminiBin) {
        return this._sessionManager.geminiBin;
      }
      return discoverGeminiBinary();
    }

    const claudeBin = this._sessionManager.claudeBin;
    if (!claudeBin) {
      throw new Error('claudeBin not set on SessionManager');
    }
    return claudeBin;
  }

  _buildRuntimeProviderArgs(provider) {
    // The runtime CLI entrypoints are interactive by default. Provider-specific
    // launch behavior is represented here so Swarm can select the correct
    // binary/launch profile without duplicating discovery logic.
    const profile = RUNTIME_PROVIDER_PROFILES[provider] ?? {};
    if (typeof profile.buildArgs === 'function') {
      return [...profile.buildArgs()];
    }
    return [...(profile.args ?? [])];
  }

  _buildRuntimeProviderBootstrapPrompt(provider, { fallbackFrom = null, fallbackReason = null } = {}) {
    let providerLabel = 'Claude';
    if (provider === RUNTIME_PROVIDER.CODEX) providerLabel = 'Codex';
    if (provider === RUNTIME_PROVIDER.GEMINI) providerLabel = 'Gemini';

    const lines = [
      `${providerLabel} runtime is active for this Swarm agent.`,
      'Continue the workflow using the shared task context below.',
    ];

    if (fallbackFrom) {
      let fallbackLabel = 'Claude';
      if (fallbackFrom === RUNTIME_PROVIDER.CODEX) fallbackLabel = 'Codex';
      if (fallbackFrom === RUNTIME_PROVIDER.GEMINI) fallbackLabel = 'Gemini';
      lines.unshift(`${providerLabel} replaced ${fallbackLabel} because the previous provider could not continue.`);
    }
    if (fallbackReason) {
      lines.push(`Fallback reason: ${fallbackReason}`);
    }

    return lines.join('\n');
  }

  _getBudgetSnapshot(execution) {
    let budget = { estimatedTokensUsed: 0, limitTokens: execution.workflowDef.settings?.budgetTokens || 0 };
    if (this._budgetTracker) {
      budget = {
        estimatedTokensUsed: this._budgetTracker.getTotal(execution.executionId),
        limitTokens: execution.workflowDef.settings?.budgetTokens || 0,
      };
    }
    return budget;
  }

  _broadcastExecutionSnapshot(execution) {
    if (!this._wsBroadcast || !execution) return;
    this._wsBroadcast(execution.executionId, {
      type: 'execution_status',
      ...this.getStatus(execution.executionId, execution),
    });
  }

  _broadcastAgentStatus(executionId, nodeId, state) {
    if (!this._wsBroadcast) return;
    this._wsBroadcast(executionId, {
      type: 'agent_status',
      nodeId,
      provider: state?.provider ?? null,
      runtimeProvider: state?.runtimeProvider ?? state?.provider ?? null,
      status: state?.status ?? 'idle',
      sessionId: state?.sessionId ?? null,
      lastOutputSnippet: state?.lastOutputSnippet ?? '',
      ...(state?.runtimeBlocker
        ? { runtimeBlocker: this._serializeRuntimeBlocker(state.runtimeBlocker) }
        : {}),
    });
  }

  _setExecutionStatus(execution, status) {
    if (!execution || execution.status === status) return;
    execution.status = status;
    this._broadcastExecutionSnapshot(execution);
  }

  _buildInitialWorkflowContext(workflowDef) {
    const initialContext =
      workflowDef?.initialContext && typeof workflowDef.initialContext === 'object'
        ? { ...workflowDef.initialContext }
        : {};

    const workflowName = workflowDef?.name || 'Workflow';
    const workflowDescription = workflowDef?.description || '';
    const defaultCurrentTask = workflowDescription
      ? `Execute the workflow goal described here: ${workflowDescription}`
      : `Execute the workflow "${workflowName}" and advance it through the agent graph.`;

    return {
      workflowName,
      workflowDescription,
      currentTask: initialContext.currentTask || defaultCurrentTask,
      ...initialContext,
    };
  }

  _normalizeParserChunk(rawChunk = '') {
    return rawChunk
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b[@-_][0-?]*[ -/]*[@-~]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  _detectRuntimeBlocker(rawChunk = '') {
    const normalized = this._normalizeParserChunk(rawChunk).toLowerCase();
    if (!normalized.trim()) return null;

    const match = RUNTIME_BLOCKER_PATTERNS.find((candidate) => candidate.matches(normalized));
    if (!match) return null;

    return {
      type: match.type,
      provider: match.provider,
      message: match.message,
      detectedAt: new Date().toISOString(),
    };
  }

  _isRuntimePromptReady(rawChunk = '', provider = null) {
    const normalized = this._normalizeParserChunk(rawChunk).toLowerCase();
    if (!normalized.trim()) return false;

    if (provider === RUNTIME_PROVIDER.CLAUDE) {
      return normalized.includes('bypass permissions on')
        || normalized.includes('ctrl+g to edit in notepad')
        || normalized.includes('/buddy');
    }

    if (provider === RUNTIME_PROVIDER.CODEX) {
      return normalized.includes('workspace-write')
        || normalized.includes('approval')
        || normalized.includes('model')
        || normalized.includes('esc to interrupt');
    }

    if (provider === RUNTIME_PROVIDER.GEMINI) {
      return normalized.includes('esc to interrupt');
    }

    return false;
  }

  _detectRuntimePromptIntervention(rawChunk = '', provider = null) {
    const normalized = this._normalizeParserChunk(rawChunk).toLowerCase();
    if (!normalized.trim() || (provider !== RUNTIME_PROVIDER.CODEX && provider !== RUNTIME_PROVIDER.GEMINI)) return null;
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    const hasHardUsageLimit =
      normalized.includes("you've hit your usage limit")
      || normalized.includes('purchase more credits')
      || normalized.includes('try again at');

    if (
      compact.includes('choosehowyoudlikecodextoproceed')
      && compact.includes('trynewmodel')
      && compact.includes('useexistingmodel')
    ) {
      return {
        type: 'model_selection_menu',
        provider: RUNTIME_PROVIDER.CODEX,
      };
    }

    if (
      !hasHardUsageLimit
      && (
      compact.includes('approachingratelimits')
      && compact.includes('keepcurrentmodel')
      && (compact.includes('switchtogpt') || compact.includes('codexmini'))
      )
    ) {
      return {
        type: 'rate_limit_menu_keep_current_model',
        provider: RUNTIME_PROVIDER.CODEX,
      };
    }

    if (provider === RUNTIME_PROVIDER.GEMINI) {
      if (
        compact.includes('doyoutrustthefollowingfolders')
        || compact.includes('trustingafolderallows')
      ) {
        return {
          type: 'gemini_trust_menu',
          provider: RUNTIME_PROVIDER.GEMINI,
        };
      }
    }

    return null;
  }

  _applyRuntimePromptIntervention(sessionId, state, intervention) {
    if (!sessionId || !state || !intervention) return false;

    if (
      intervention.type === 'model_selection_menu'
      || intervention.type === 'rate_limit_menu_keep_current_model'
      || intervention.type === 'gemini_trust_menu'
    ) {
      let handledKey = 'rateLimitMenuHandled';
      if (intervention.type === 'model_selection_menu') handledKey = 'modelSelectionMenuHandled';
      if (intervention.type === 'gemini_trust_menu') handledKey = 'geminiTrustMenuHandled';

      if (state[handledKey]) return false;
      state[handledKey] = true;

      if (intervention.type === 'gemini_trust_menu') {
        this._sessionManager.writeInput(sessionId, '\r');
      } else {
        // Prefer staying on the configured model when Codex renders an
        // interactive model-choice menu so Swarm can continue without silently
        // accepting a provider-driven model change.
        this._sessionManager.writeInput(sessionId, '\x1b[B');
        setTimeout(() => {
          this._sessionManager.writeInput(sessionId, '\r');
        }, SWARM_RUNTIME_MENU_SUBMIT_DELAY_MS);
      }

      return true;
    }

    return false;
  }

  _flushSwarmPrompt(sessionId, state = null) {
    const prompt = state?.pendingPrompt ?? null;
    if (!sessionId || !prompt) return;

    if (state) {
      if (state.promptReadyTimer) {
        clearTimeout(state.promptReadyTimer);
        state.promptReadyTimer = null;
      }
      // Clear any previous echo-marker timeout before setting a new one
      if (state.echoMarkerTimer) {
        clearTimeout(state.echoMarkerTimer);
        state.echoMarkerTimer = null;
      }
      state.pendingPrompt = null;
      state.ignoreParserUntil = SWARM_PROMPT_ECHO_MARKER;
      state.ignoreParserBuffer = '';

      // Fallback: if the echo marker is never observed (e.g. Claude's
      // interactive CLI does not echo pasted text), clear the gate after
      // a timeout so the parser can resume detecting __DONE__ / __HANDOFF__.
      state.echoMarkerTimer = setTimeout(() => {
        if (state.ignoreParserUntil) {
          state.ignoreParserUntil = null;
          state.ignoreParserBuffer = '';
        }
        state.echoMarkerTimer = null;
      }, SWARM_ECHO_MARKER_TIMEOUT_MS);
      if (state.echoMarkerTimer.unref) {
        state.echoMarkerTimer.unref();
      }
    }

    const payload = `${prompt}\n${SWARM_PROMPT_ECHO_MARKER}`;
    const writePayload = () => {
      if (state?.runtimeSession) {
        const shouldInterruptFirst =
          state?.provider === RUNTIME_PROVIDER.CODEX && (state?.promptSubmissionCount ?? 0) > 0;
        const lines = payload.split('\n');
        const baseDelay = shouldInterruptFirst ? SWARM_PROMPT_INTERRUPT_DELAY_MS : 0;

        if (shouldInterruptFirst) {
          this._sessionManager.writeInput(sessionId, '\x1b');
        }

        lines.forEach((line, index) => {
          setTimeout(() => {
            this._sessionManager.writeInput(sessionId, `${line}\n`);
          }, baseDelay + (index * SWARM_PROMPT_LINE_INTERVAL_MS));
        });
        return baseDelay + (lines.length * SWARM_PROMPT_LINE_INTERVAL_MS);
      }

      this._sessionManager.writeInput(sessionId, payload);
      return 0;
    };

    const submitAfterMs = writePayload();
    if (state) {
      state.promptSubmissionCount = (state.promptSubmissionCount ?? 0) + 1;
    }

    // Claude/Codex treat large multi-line writes as a paste operation. Submit on
    // the next tick so the interactive CLI executes the pasted swarm prompt.
    setTimeout(() => {
      this._sessionManager.writeInput(sessionId, '\r');
    }, submitAfterMs + SWARM_PROMPT_SUBMIT_DELAY_MS);
  }

  _writeSwarmPrompt(sessionId, prompt, state = null) {
    if (!sessionId || !prompt) return;

    if (!state) {
      this._flushSwarmPrompt(sessionId, { pendingPrompt: prompt });
      return;
    }

    state.pendingPrompt = prompt;

    if (state.promptReady) {
      this._flushSwarmPrompt(sessionId, state);
      return;
    }

    if (!state.promptReadyTimer) {
      state.promptReadyTimer = setTimeout(() => {
        state.promptReady = true;
        state.promptReadyTimer = null;
        this._flushSwarmPrompt(sessionId, state);
      }, SWARM_PROMPT_READY_FALLBACK_MS);
    }
  }

  _shouldFallback(execution, blocker, state) {
    if (!execution || !blocker || !state) return false;
    if (execution.providerStrategy?.mode !== RUNTIME_PROVIDER.AUTO) return false;
    if (!execution.providerStrategy?.allowFallback) return false;

    const currentProvider = state.provider;
    const blockerProvider = blocker.provider;

    if (currentProvider !== blockerProvider) return false;

    if (currentProvider === RUNTIME_PROVIDER.CLAUDE) {
      return blocker.type === 'rate_limited' || blocker.type === 'provider_unavailable';
    }
    if (currentProvider === RUNTIME_PROVIDER.CODEX) {
      return blocker.type === 'rate_limited' || blocker.type === 'provider_unavailable' || blocker.type === 'trust_required' || blocker.type === 'prompt_rejected';
    }

    return false;
  }

  async _attemptRuntimeFallback(executionId, nodeId, blocker) {
    const execution = this._executions.get(executionId);
    if (!execution) return false;

    const currentState = execution.agentStates.get(nodeId);
    if (!this._shouldFallback(execution, blocker, currentState)) {
      return false;
    }

    const previousSessionId = currentState?.sessionId ?? null;
    const previousTapFn = currentState?.tapFn ?? null;
    const currentProvider = currentState.provider;

    let nextProvider;
    if (currentProvider === RUNTIME_PROVIDER.CLAUDE) {
      nextProvider = RUNTIME_PROVIDER.CODEX;
    } else if (currentProvider === RUNTIME_PROVIDER.CODEX) {
      nextProvider = RUNTIME_PROVIDER.GEMINI;
    } else {
      return false;
    }

    try {
      await this._spawnAgentPty(executionId, nodeId, {
        requestedProvider: nextProvider,
        fallbackFrom: currentProvider,
        fallbackReason: blocker.message,
        previousSessionId,
        previousTapFn,
      });

      execution.lastFallback = {
        fromProvider: currentProvider,
        toProvider: nextProvider,
        reason: blocker.message,
        type: blocker.type,
        nodeId,
        detectedAt: blocker.detectedAt ?? new Date().toISOString(),
      };

      if (execution.providerStrategy) {
        execution.providerStrategy.activeProvider = nextProvider;
      }
      execution.runtimeBlocker = null;

      const latestState = execution.agentStates.get(nodeId);
      if (latestState) {
        latestState.runtimeBlocker = null;
      }

      this._syncExecutionStatusFromAgents(execution);
      this._broadcastExecutionSnapshot(execution);
      return true;
    } catch (error) {
      const failure = {
        fromProvider: RUNTIME_PROVIDER.CLAUDE,
        toProvider: RUNTIME_PROVIDER.CODEX,
        reason: error.message,
        type: 'fallback_failed',
        nodeId,
        detectedAt: new Date().toISOString(),
      };
      execution.lastFallback = failure;
      this._broadcastExecutionSnapshot(execution);
      return false;
    }
  }

  async _handleRuntimeBlocker(executionId, nodeId, blocker) {
    const execution = this._executions.get(executionId);
    if (!execution || !blocker) return false;

    const state = execution.agentStates.get(nodeId);
    if (!state) return false;

    const nextBlocker = {
      ...blocker,
      nodeId,
    };

    state.runtimeBlocker = nextBlocker;
    state.status = 'blocked';
    execution.runtimeBlocker = nextBlocker;
    this._broadcastAgentStatus(executionId, nodeId, state);
    this._setExecutionStatus(execution, 'blocked');

    const fallbackApplied = await this._attemptRuntimeFallback(executionId, nodeId, nextBlocker);
    if (!fallbackApplied) {
      this._broadcastExecutionSnapshot(execution);
    }

    return fallbackApplied;
  }

  _syncExecutionStatusFromAgents(execution) {
    if (!execution || ['stopping', 'stopped', 'failed', 'completed'].includes(execution.status)) {
      return execution?.status ?? null;
    }

    const agentStates = [...execution.agentStates.values()];
    const hasRuntimeBlocker =
      Boolean(execution.runtimeBlocker)
      || agentStates.some((state) => Boolean(state.runtimeBlocker));
    const hasRunning = agentStates.some((state) => state.status === 'running');
    const hasPaused = agentStates.some((state) => state.status === 'paused');
    const hasBlocked = agentStates.some((state) => state.status === 'blocked');
    const hasFailed = agentStates.some((state) => state.status === 'failed');

    if (hasFailed) {
      this._setExecutionStatus(execution, 'failed');
    } else if (hasBlocked || hasRuntimeBlocker) {
      this._setExecutionStatus(execution, 'blocked');
    } else if (hasRunning) {
      this._setExecutionStatus(execution, 'running');
    } else if (hasPaused) {
      this._setExecutionStatus(execution, 'paused');
    } else if (agentStates.length > 0) {
      this._setExecutionStatus(execution, 'completed');
      if (execution.heartbeatTimer) {
        clearInterval(execution.heartbeatTimer);
        execution.heartbeatTimer = null;
      }
    }

    return execution.status;
  }

  /**
   * Start a new workflow execution.
   * Implemented in Task #46.2.
   * @param {string} workflowId
   * @param {string} projectId
   * @param {string} projectPath
   * @returns {Promise<object>} execution status
   */
  async startExecution(workflowId, projectId, projectPath, runtimeOptions = {}) {
    // 1. Load workflow definition from store
    const wf = await this._workflowStore.get(workflowId);
    if (!wf) throw new Error('Workflow not found');

    const providerStrategy = this._buildRuntimeProviderStrategy(
      wf,
      runtimeOptions.provider ?? runtimeOptions.runtimeProvider
    );

    // 2. Build execution record
    const executionId = uuidv4();
    const execution = {
      executionId,
      workflowId,
      workflowDef: wf,
      projectId,
      projectPath,
      status: 'running',
      agentStates: new Map(),
      edgeCounters: new Map(),
      workflowContext: this._buildInitialWorkflowContext(wf),
      heartbeatTimer: null,
      inboxItems: [],
      runtimeBlocker: null,
      providerStrategy,
      runtimeProvider: providerStrategy.activeProvider,
      activeProvider: providerStrategy.activeProvider,
      lastFallback: null,
    };

    // 3. Store BEFORE spawning (so _spawnAgentPty can look it up)
    this._executions.set(executionId, execution);

    // 4. Find triage node: first node with isTriageNode === true, else first node
    const triageNode = wf.nodes.find((n) => n.data && n.data.isTriageNode === true) || wf.nodes[0];

    // 5. Spawn triage agent PTY
    await this._spawnAgentPty(executionId, triageNode.id, {
      requestedProvider: providerStrategy.mode,
    });

    // 6. Start heartbeat to keep agent PTYs alive
    this._startHeartbeat(executionId);

    this._broadcastExecutionSnapshot(execution);

    return executionId;
  }

  /**
   * Spawn an agent PTY session for a specific node in the workflow.
   * Implemented in Task #46.2.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<void>}
   */
  async _spawnAgentPty(executionId, nodeId, spawnOptions = {}) {
    const execution = this._executions.get(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const node = execution.workflowDef.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in workflow`);

    // Build handoff targets from outgoing edges
    const handoffTargets = execution.workflowDef.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);

    const requestedProvider = normalizeRuntimeProvider(
      spawnOptions.requestedProvider ?? spawnOptions.provider ?? execution.activeProvider
    );
    const candidateProviders = requestedProvider === RUNTIME_PROVIDER.AUTO
      ? [RUNTIME_PROVIDER.CLAUDE, RUNTIME_PROVIDER.CODEX, RUNTIME_PROVIDER.GEMINI]
      : [requestedProvider];

    const previousState = execution.agentStates.get(nodeId) ?? null;
    const previousSessionId = previousState?.sessionId ?? null;
    const previousTapFn = previousState?.tapFn ?? null;
    const parser = new HandoffParser();
    let lastError = null;

    for (let index = 0; index < candidateProviders.length; index += 1) {
      const provider = candidateProviders[index];
      const isFallbackAttempt = index > 0 || spawnOptions.fallbackFrom != null;

      try {
        const binaryPath = await this._resolveRuntimeProviderBinary(provider);
        const launchArgs = this._buildRuntimeProviderArgs(provider);
        const bootstrapPrompt = this._buildRuntimeProviderBootstrapPrompt(provider, {
          fallbackFrom: spawnOptions.fallbackFrom ?? null,
          fallbackReason: spawnOptions.fallbackReason ?? null,
        });
        const systemPrompt = this._buildSystemPrompt(
          node,
          execution.workflowContext,
          handoffTargets,
          provider
        );
        const combinedPrompt = [bootstrapPrompt, systemPrompt].filter(Boolean).join('\n\n');
        const codexInitialPrompt = provider === RUNTIME_PROVIDER.CODEX
          ? `${combinedPrompt}\n${SWARM_PROMPT_ECHO_MARKER}`
          : null;
        const session = await this._sessionManager.createSession(
          execution.projectId,
          execution.projectPath,
          binaryPath,
          {
            provider,
            args: launchArgs,
            bootstrapPrompt,
            initialPrompt: codexInitialPrompt,
          }
        );
        const sessionId = session.sessionId;

        const state = {
          sessionId,
          tapFn: null,         // set below after tapFn is defined
          status: 'running',
          handoffCount: 0,
          lastOutputSnippet: '',
          provider,
          runtimeProvider: provider,
          runtimeBlocker: null,
          ignoreParserUntil: codexInitialPrompt ? SWARM_PROMPT_ECHO_MARKER : null,
          ignoreParserBuffer: '',
          promptReady: false,
          pendingPrompt: null,
          promptReadyTimer: null,
          promptSubmissionCount: 0,
          runtimeSession: true,
          doneReinjectCount: 0,
          modelSelectionMenuHandled: false,
          rateLimitMenuHandled: false,
          echoMarkerTimer: null,
        };

        execution.activeProvider = provider;
        execution.runtimeProvider = provider;
        execution.providerStrategy = {
          ...execution.providerStrategy,
          activeProvider: provider,
        };
        execution.agentStates.set(nodeId, state);

        // Register session with BudgetTracker so getTotal(executionId) includes it
        if (this._budgetTracker) {
          this._budgetTracker.registerSession(executionId, sessionId);
        }

        const tapFn = (chunk) => {
          const currentState = execution.agentStates.get(nodeId);
          if (currentState && !currentState.promptReady && this._isRuntimePromptReady(chunk, currentState.provider)) {
            currentState.promptReady = true;
          }
          if (currentState) {
            currentState.lastOutputSnippet = (currentState.lastOutputSnippet + chunk).slice(-500);
            this._broadcastAgentStatus(executionId, nodeId, currentState);
          }

          const promptIntervention = currentState
            ? this._detectRuntimePromptIntervention(currentState.lastOutputSnippet, currentState.provider)
            : null;
          if (promptIntervention && this._applyRuntimePromptIntervention(sessionId, currentState, promptIntervention)) {
            return;
          }

          if (this._budgetTracker) {
            this._budgetTracker.track(sessionId, chunk);
            const limit = execution.workflowDef.settings?.budgetTokens || 0;
            if (limit > 0) {
              const result = this._budgetTracker.checkBudget(executionId, limit);
              if (result.exceeded && this._wsBroadcast) {
                this._wsBroadcast(executionId, {
                  type: 'budget_update',
                  estimatedTokensUsed: result.estimatedUsed,
                  limitTokens: limit,
                });
              }
            }
          }

          let chunkForParser = chunk;
          if (currentState?.ignoreParserUntil) {
            const normalized = this._normalizeParserChunk(chunk);
            currentState.ignoreParserBuffer = (currentState.ignoreParserBuffer + normalized).slice(-8192);
            const markerIndex = currentState.ignoreParserBuffer.indexOf(currentState.ignoreParserUntil);

            if (markerIndex === -1) {
              return;
            }

            const remainder = currentState.ignoreParserBuffer.slice(
              markerIndex + currentState.ignoreParserUntil.length
            );
            currentState.ignoreParserUntil = null;
            currentState.ignoreParserBuffer = '';
            // Cancel the fallback timer — the marker arrived in time
            if (currentState.echoMarkerTimer) {
              clearTimeout(currentState.echoMarkerTimer);
              currentState.echoMarkerTimer = null;
            }

            if (!remainder) {
              return;
            }

            chunkForParser = remainder;
          }

          const runtimeBlocker = this._detectRuntimeBlocker(chunkForParser);
          if (runtimeBlocker) {
            void this._handleRuntimeBlocker(executionId, nodeId, runtimeBlocker);
            return;
          }

          const events = parser.feed(chunkForParser);
          for (const evt of events) {
            if (evt.type === 'handoff') this._onHandoff(executionId, nodeId, evt);
            if (evt.type === 'done') this._onDone(executionId, nodeId);
          }
        };

        state.tapFn = tapFn;

        // Register tap on swarmListeners (DEC-014)
        const ptySession = this._sessionManager.getSession(sessionId);
        if (ptySession) {
          ptySession.swarmListeners.add(tapFn);
          state.runtimeSession = Object.prototype.hasOwnProperty.call(ptySession, 'pty');
          state.promptReady = !state.runtimeSession;
        }

        // Remove the previous provider session after the replacement is live.
        if (isFallbackAttempt && previousSessionId && previousSessionId !== sessionId) {
          if (previousTapFn) {
            const previousSession = this._sessionManager.getSession(previousSessionId);
            previousSession?.swarmListeners?.delete(previousTapFn);
          }
          await this._sessionManager.killSession(previousSessionId);
        }

        if (combinedPrompt && !codexInitialPrompt) {
          this._writeSwarmPrompt(sessionId, combinedPrompt, state);
        }

        if (isFallbackAttempt && this._wsBroadcast) {
          const fallbackFrom = spawnOptions.fallbackFrom ?? candidateProviders[0];
          execution.lastFallback = {
            fromProvider: fallbackFrom,
            toProvider: provider,
            reason: spawnOptions.fallbackReason ?? 'provider_fallback',
            nodeId,
            detectedAt: new Date().toISOString(),
          };
          this._wsBroadcast(executionId, {
            type: 'runtime_provider_switch',
            nodeId,
            fromProvider: fallbackFrom,
            toProvider: provider,
            reason: spawnOptions.fallbackReason ?? 'provider_fallback',
          });
        }

        this._broadcastAgentStatus(executionId, nodeId, state);
        this._syncExecutionStatusFromAgents(execution);
        return;
      } catch (error) {
        lastError = error;

        // Only the auto strategy may fall through to the next candidate.
        if (requestedProvider !== RUNTIME_PROVIDER.AUTO || index === candidateProviders.length - 1) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('Unable to spawn runtime provider');
  }

  /**
   * Ensure an agent PTY exists for a node, reusing an active one if available.
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {Promise<string>} sessionId of the active or newly spawned PTY
   */
  async _ensureAgentPty(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (execution) {
      const existing = execution.agentStates.get(nodeId);
      if (existing && existing.status !== 'done') {
        return existing.sessionId;
      }
    }
    await this._spawnAgentPty(executionId, nodeId);
    const state = this._executions.get(executionId)?.agentStates.get(nodeId);
    return state?.sessionId;
  }

  /**
   * Build the system prompt for an agent node.
   * Assembles role, workflow context, and handoff targets per OpenAI Swarm pattern.
   * Implemented in Task #46.3.
   * @param {object} node - workflow node definition
   * @param {object} workflowContext - current shared context dict
   * @param {string[]} handoffTargets - list of valid target agent IDs
   * @returns {string} assembled system prompt
   */
  _buildSystemPrompt(node, workflowContext, handoffTargets, provider = null) {
    const lines = [];

    if (provider === RUNTIME_PROVIDER.CODEX) {
      lines.push('You are running inside the Codex interactive CLI.');
      lines.push('Answer directly in terminal text and continue the swarm task without setup chatter.');
      lines.push('');
    }

    // Agent's own system prompt / role instructions
    const agentPrompt = (node.data && node.data.systemPrompt) || '';
    lines.push(agentPrompt);
    lines.push('');
    lines.push('--- SWARM PROTOCOL (mandatory - never skip) ---');

    // Workflow context section - omit entirely if empty
    const contextKeys = Object.keys(workflowContext);
    if (contextKeys.length > 0) {
      lines.push('Current workflow context:');
      for (const key of contextKeys) {
        lines.push(`${key}: ${workflowContext[key]}`);
      }
      lines.push('');
    }

    lines.push('You have an active task right now. Do real work before deciding you are done.');
    if (workflowContext.currentTask) {
      lines.push(`Current task: ${workflowContext.currentTask}`);
    }
    if (workflowContext.workflowDescription) {
      lines.push(`Workflow goal: ${workflowContext.workflowDescription}`);
    }
    lines.push('');

    // Handoff instructions - vary based on whether targets exist
    if (handoffTargets.length > 0) {
      lines.push('This agent is not terminal in the workflow.');
      lines.push('When your stage is complete, you MUST hand off to exactly one downstream agent.');
      if (handoffTargets.length === 1) {
        lines.push(`Your required downstream target is: ${handoffTargets[0]}`);
      } else {
        lines.push(`Choose exactly one downstream target from: ${handoffTargets.join(', ')}`);
      }
      lines.push('If another agent is better suited to continue, hand off with the most useful context you can provide.');
      lines.push('Do not emit __DONE__ immediately just because you understand the instructions.');
      lines.push('When your task is complete and must pass to another agent, output EXACTLY as the last line:');
      lines.push('__HANDOFF__:<targetId>:{"key": "value"}');
      lines.push('The final handoff token must be plain text on a single line with no bullets, quotes, code fences, or indentation.');
      lines.push('');
      lines.push(`Valid target IDs: ${handoffTargets.join(', ')}`);
      lines.push('Context update: a flat JSON object with primitive values only (string, number, or boolean). Max 50 keys, strings max 1024 chars. Keep it compact.');
      lines.push('');
      if (handoffTargets.length === 1) {
        lines.push('CONCRETE EXAMPLE (replace the placeholders with your real work):');
        lines.push(`For this workflow, <targetId> must be ${handoffTargets[0]}.`);
        lines.push('__HANDOFF__:<targetId>:{"summary": "your real work summary", "result": "your real findings"}');
      } else {
        lines.push('CONCRETE EXAMPLE (replace the placeholders with the chosen target and your real work):');
        lines.push(`Choose one target from: ${handoffTargets.join(', ')}`);
        lines.push('__HANDOFF__:<targetId>:{"summary": "your real work summary", "result": "your real findings"}');
      }
      lines.push('');
      lines.push('Do NOT output __DONE__ from this agent while downstream handoff targets still exist.');
    } else {
      lines.push('When fully done:');
      lines.push('__DONE__');
    }

    lines.push('');
    lines.push('Do NOT output the handoff or done token mid-response. Only as the very LAST line.');
    lines.push('--- END PROTOCOL ---');

    return lines.join('\n');
  }

  _buildContinueAfterDonePrompt(node, workflowContext, handoffTargets) {
    const agentLabel = node?.data?.label || node?.id || 'This agent';
    const lines = [
      `${agentLabel} is not the end of the workflow yet.`,
      'Do not stop at __DONE__ while downstream agents still need your output.',
    ];

    if (workflowContext?.currentTask) {
      lines.push(`Continue this task: ${workflowContext.currentTask}`);
    }

    if (handoffTargets.length === 1) {
      lines.push(`Finish your work, then hand off to ${handoffTargets[0]}.`);
    } else if (handoffTargets.length > 1) {
      lines.push(`Finish your work, then hand off to the most appropriate next agent: ${handoffTargets.join(', ')}.`);
    }

    lines.push('Your very last line must be a valid handoff token in this EXACT format:');
    lines.push(`Use ${handoffTargets[0]} in place of <targetId> for this workflow.`);
    lines.push('__HANDOFF__:<targetId>:{"summary": "your work summary here"}');
    lines.push('Use only flat JSON with primitive values (string, number, or boolean). Keep the handoff line compact.');
    lines.push('Output that final handoff token as plain text on a single line with no bullets, quotes, code fences, or indentation.');
    lines.push('Replace the summary value with an actual description of what you accomplished.');

    return lines.join('\n');
  }

  /**
   * Start the heartbeat timer for an execution.
   * Prevents idle sweeper from killing agent PTYs during active workflows.
   * Implemented in Task #46.3.
   * @param {string} executionId
   */
  _startHeartbeat(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    execution.heartbeatTimer = setInterval(() => {
      const exec = this._executions.get(executionId);
      if (!exec) return;

      for (const [nodeId, state] of exec.agentStates) {
        if (state.status === 'running') {
          this._sessionManager.writeInput(state.sessionId, '');
        }
      }
    }, 300000); // 5 minutes

    // Allow Node.js to exit even if heartbeat timer is active
    if (execution.heartbeatTimer.unref) {
      execution.heartbeatTimer.unref();
    }
  }

  /**
   * Handle a handoff event from one agent to another.
   * Merges context, increments edge counter, checks circuit breaker,
   * updates source agent state, and spawns/reuses target PTY.
   * Implemented in Task #62.1.
   * @param {string} executionId
   * @param {string} sourceNodeId
   * @param {object} event - { type: 'handoff', targetId, contextUpdate }
   */
  async _onHandoff(executionId, sourceNodeId, event) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const { targetId, contextUpdate } = event;

    // 1. Shallow merge context update (DEC-V3-05: OpenAI Swarm pattern)
    if (contextUpdate && typeof contextUpdate === 'object') {
      Object.assign(execution.workflowContext, contextUpdate);
    }

    // 2. Find edge ID (source-target pair)
    const edgeId = execution.workflowDef.edges.find(
      (e) => e.source === sourceNodeId && e.target === targetId
    )?.id ?? `${sourceNodeId}->${targetId}`;

    // 3. Increment edge counter
    const counter = (execution.edgeCounters.get(edgeId) ?? 0) + 1;
    execution.edgeCounters.set(edgeId, counter);

    // 4. Circuit breaker check (advisory only — does not stop execution)
    const threshold = execution.workflowDef.settings?.circuitBreakerThreshold ?? 10;
    if (this._circuitBreaker && this._circuitBreaker.check(edgeId, counter, threshold)) {
      if (this._wsBroadcast) {
        this._wsBroadcast(executionId, { type: 'circuit_breaker', edgeId, counter, threshold });
      }
    }

    // 5. Increment source agent handoffCount
    const sourceState = execution.agentStates.get(sourceNodeId);
    if (sourceState) {
      sourceState.handoffCount = (sourceState.handoffCount ?? 0) + 1;
    }

    // 6. Broadcast handoff event
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'handoff_started',
        sourceNodeId,
        targetNodeId: targetId,
        edgeId,
        counter,
      });
    }

    // 7. Spawn or reuse target agent PTY
    await this._ensureAgentPty(executionId, targetId);

    // 8. Inject updated context into target agent's PTY
    const targetState = execution.agentStates.get(targetId);
    if (targetState && targetState.sessionId) {
      const targetNode = execution.workflowDef.nodes.find((n) => n.id === targetId);
      if (targetNode) {
        const handoffTargets = execution.workflowDef.edges
          .filter((e) => e.source === targetId)
          .map((e) => e.target);
        const contextPrompt = this._buildSystemPrompt(
          targetNode, execution.workflowContext, handoffTargets
        );
        if (contextPrompt) {
          this._writeSwarmPrompt(targetState.sessionId, contextPrompt, targetState);
        }
      }
    }

    // 9. Update source agent status to 'done' after handoff
    if (sourceState) {
      sourceState.status = 'done';
      sourceState.runtimeBlocker = null;
      this._broadcastAgentStatus(executionId, sourceNodeId, sourceState);
    }

    // 10. Update target agent status to 'running'
    if (targetState) {
      targetState.status = 'running';
      targetState.runtimeBlocker = null;
      execution.runtimeBlocker = null;
      this._broadcastAgentStatus(executionId, targetId, targetState);
    }

    // 11. Broadcast handoff_completed (FR-V3-43)
    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'handoff_completed',
        sourceNodeId,
        targetNodeId: targetId,
      });
    }

    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Handle a done event from an agent.
   * Stub for Task #62.3 — broadcasts WS event.
   * @param {string} executionId
   * @param {string} nodeId
   */
  _onDone(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;

    const node = execution.workflowDef.nodes.find((candidate) => candidate.id === nodeId);
    const state = execution.agentStates.get(nodeId);
    const handoffTargets = execution.workflowDef.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target);

    if (state?.runtimeBlocker || execution.runtimeBlocker) {
      state.status = 'blocked';
      this._broadcastAgentStatus(executionId, nodeId, state);
      this._syncExecutionStatusFromAgents(execution);
      return;
    }

    if (state && handoffTargets.length > 0) {
      state.doneReinjectCount = (state.doneReinjectCount ?? 0) + 1;

      if (state.doneReinjectCount <= MAX_DONE_REINJECT_ATTEMPTS && state.sessionId) {
        this._writeSwarmPrompt(
          state.sessionId,
          this._buildContinueAfterDonePrompt(node, execution.workflowContext, handoffTargets),
          state
        );
        state.status = 'running';
        this._broadcastAgentStatus(executionId, nodeId, state);
        this._syncExecutionStatusFromAgents(execution);
        return;
      }

      // Max reinject attempts exhausted — force handoff to first downstream target
      // rather than leaving the workflow stuck in a reinject loop.
      const forcedTarget = handoffTargets[0];
      const syntheticEvent = {
        type: 'handoff',
        targetId: forcedTarget,
        contextUpdate: {
          currentTask: execution.workflowContext?.currentTask ?? '',
          forcedHandoff: 'true',
          reason: `Agent emitted __DONE__ ${state.doneReinjectCount} times without producing __HANDOFF__`,
        },
      };
      this._onHandoff(executionId, nodeId, syntheticEvent);
      return;
    }

    if (state) {
      state.status = 'done';
      state.runtimeBlocker = null;
    }
    execution.runtimeBlocker = null;
    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Stop a running workflow execution.
   * Kills all agent PTY sessions and clears the execution record.
   * @param {string} executionId
   */
  async stopExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution) return null;

    if (['stopped', 'failed', 'completed'].includes(execution.status)) {
      return this.getStatus(executionId, execution);
    }

    this._setExecutionStatus(execution, 'stopping');

    if (execution.heartbeatTimer) {
      clearInterval(execution.heartbeatTimer);
      execution.heartbeatTimer = null;
    }

    for (const [nodeId, state] of execution.agentStates) {
      if (['running', 'paused'].includes(state.status)) {
        state.status = 'stopping';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    }
    this._broadcastExecutionSnapshot(execution);

    for (const [, state] of execution.agentStates) {
      if (state.sessionId && state.tapFn) {
        const session = this._sessionManager.getSession(state.sessionId);
        if (session) {
          session.swarmListeners.delete(state.tapFn);
        }
      }
      // Clear echo-marker timeout to prevent leaked timers
      if (state.echoMarkerTimer) {
        clearTimeout(state.echoMarkerTimer);
        state.echoMarkerTimer = null;
      }
    }

    try {
      for (const [, state] of execution.agentStates) {
        if (state.sessionId) {
          await this._sessionManager.killSession(state.sessionId);
        }
      }
    } catch (error) {
      this._setExecutionStatus(execution, 'failed');
      throw error;
    }

    for (const [, state] of execution.agentStates) {
      if (!['done', 'failed'].includes(state.status)) {
        state.status = 'stopped';
      }
      if (state.promptReadyTimer) {
        clearTimeout(state.promptReadyTimer);
        state.promptReadyTimer = null;
      }
      state.sessionId = null;
      state.tapFn = null;
      state.runtimeBlocker = null;
    }

    execution.runtimeBlocker = null;

    for (const [nodeId, state] of execution.agentStates) {
      this._broadcastAgentStatus(executionId, nodeId, state);
    }

    if (this._triggerManager) {
      this._triggerManager.cleanupExecution(executionId);
    }

    if (this._budgetTracker) {
      this._budgetTracker.clearExecution(executionId);
    }

    this._setExecutionStatus(execution, 'stopped');
    return this.getStatus(executionId, execution);
  }

  /**
   * Pause all running agents in a workflow execution.
   * Sets each running agent's status to 'paused' and broadcasts the change.
   * Added in Task #67.
   * @param {string} executionId
   */
  pauseExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution || execution.status !== 'running') return null;
    for (const [nodeId, state] of execution.agentStates) {
      if (state.status === 'running') {
        if (state.sessionId) {
          this._sessionManager.writeInput(state.sessionId, '\x03');
        }
        state.status = 'paused';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    }
    this._syncExecutionStatusFromAgents(execution);
    return this.getStatus(executionId, execution);
  }

  /**
   * Resume all paused agents in a workflow execution.
   * Sets each paused agent's status back to 'running' and broadcasts the change.
   * Added in Task #67.
   * @param {string} executionId
   */
  resumeExecution(executionId) {
    const execution = this._executions.get(executionId);
    if (!execution || execution.status !== 'paused') return null;
    for (const [nodeId, state] of execution.agentStates) {
      if (state.status === 'paused') {
        if (state.sessionId) {
          this._sessionManager.writeInput(
            state.sessionId,
            'Resume the swarm workflow from the latest shared context and continue your task.\n'
          );
        }
        state.status = 'running';
        this._broadcastAgentStatus(executionId, nodeId, state);
      }
    }
    this._syncExecutionStatusFromAgents(execution);
    return this.getStatus(executionId, execution);
  }

  /**
   * Freeze a single agent for Human-in-the-Loop review.
   * Sets the agent status to 'paused', adds an inbox item, and broadcasts
   * hitl_required + agent_status events.
   * Added in Task #70.
   * @param {string} executionId
   * @param {string} nodeId
   * @param {object} inboxItem - metadata for the human reviewer
   */
  freezeAgent(executionId, nodeId, inboxItem) {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    const state = execution.agentStates.get(nodeId);
    if (!state) return;

    state.status = 'paused';

    // Add to inbox for human review
    execution.inboxItems.push({ ...inboxItem, nodeId, id: inboxItem.id ?? `hitl-${Date.now()}` });

    if (this._wsBroadcast) {
      this._wsBroadcast(executionId, {
        type: 'hitl_required',
        nodeId,
        item: execution.inboxItems[execution.inboxItems.length - 1],
      });
    }
    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Unfreeze a single agent after Human-in-the-Loop review is complete.
   * Sets the agent status back to 'running' and broadcasts agent_status event.
   * Added in Task #70.
   * @param {string} executionId
   * @param {string} nodeId
   */
  unfreezeAgent(executionId, nodeId) {
    const execution = this._executions.get(executionId);
    if (!execution) return;
    const state = execution.agentStates.get(nodeId);
    if (!state) return;

    state.status = 'running';

    this._broadcastAgentStatus(executionId, nodeId, state);
    this._syncExecutionStatusFromAgents(execution);
  }

  /**
   * Get the execution object for a given executionId (public API for internal routes).
   * Returns null if execution not found. Prevents routes from accessing private _executions field.
   * Added in Task #96 (BUG-96 fix).
   * @param {string} executionId
   * @returns {object | null}
   */
  getExecution(executionId) {
    return this._executions.get(executionId) || null;
  }

  /**
   * Get the current status of a workflow execution.
   * BUG-98 fix: return real budget data from budgetTracker instead of undefined e.budget.
   * @param {string} executionId
   * @returns {object|null} execution status or null if not found
   */
  getStatus(executionId, executionOverride = null) {
    const e = executionOverride || this._executions.get(executionId);
    if (!e) return null;

    return {
      executionId: e.executionId,
      workflowId: e.workflowId,
      status: e.status,
      runtimeProvider: e.runtimeProvider ?? e.activeProvider ?? null,
      activeProvider: e.activeProvider ?? e.runtimeProvider ?? null,
      providerStrategy: e.providerStrategy ? { ...e.providerStrategy } : null,
      lastFallback: e.lastFallback ? { ...e.lastFallback } : null,
      agentStates: Object.fromEntries(
        [...e.agentStates.entries()].map(([nodeId, state]) => [nodeId, this._serializeAgentState(state)])
      ),
      edgeCounters: Object.fromEntries(e.edgeCounters),
      budget: this._getBudgetSnapshot(e),
      inboxItems: e.inboxItems.map((item) => ({ ...item })),
      ...(e.runtimeBlocker ? { runtimeBlocker: this._serializeRuntimeBlocker(e.runtimeBlocker) } : {}),
    };
  }
}

export default SwarmEngine;
