import { ExecutionHistoryStore } from '../stores/ExecutionHistoryStore.js';
import { ConfigStore } from './ConfigStore.js';
import { buildWorkflowArtifact } from './WorkflowArtifactBuilder.js';
import buildPackResult from './PackResultBuilder.js';
import { buildWorkflowResult } from './workflowContracts.js';

export const TERMINAL_EXECUTION_STATUSES = new Set(['completed', 'stopped', 'failed']);
const STRUCTURED_AGENT_SPAWN_MODES = new Set(['stream-json', 'codex-sdk']);

let _historyStore = null;

function getHistoryStore(appLocals = null) {
  if (appLocals?.executionHistoryStore) {
    return appLocals.executionHistoryStore;
  }
  if (!_historyStore) {
    _historyStore = new ExecutionHistoryStore(ConfigStore.CONFIG_DIR);
    _historyStore.init().catch(() => {});
  }
  return _historyStore;
}

function normalizeAgentStates(agentStates) {
  if (agentStates instanceof Map) return agentStates;
  if (agentStates && typeof agentStates === 'object') {
    return new Map(Object.entries(agentStates));
  }
  return new Map();
}

function buildOutputEntriesFromMessages(nodeId, messages = [], state = null) {
  const entries = [];
  const groupedByTurn = new Map();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const rawText = String(message?.text ?? message?.content ?? '');
    if (!rawText.trim()) continue;

    const spawnMode = message?.spawnMode ?? state?.spawnMode ?? null;
    const turnId = message?.turnId ?? null;
    const shouldGroupByTurn = Boolean(turnId) && STRUCTURED_AGENT_SPAWN_MODES.has(spawnMode);

    if (!shouldGroupByTurn) {
      entries.push({
        id: `chat-${nodeId}-${index}-${message?.timestamp ?? 'na'}`,
        text: rawText,
        timestamp: message?.timestamp ?? null,
        turnId,
        spawnMode,
      });
      continue;
    }

    const existing = groupedByTurn.get(turnId);
    if (!existing) {
      const nextEntry = {
        id: `turn-${nodeId}-${turnId}`,
        text: rawText,
        timestamp: message?.timestamp ?? null,
        turnId,
        spawnMode,
      };
      groupedByTurn.set(turnId, nextEntry);
      entries.push(nextEntry);
      continue;
    }

    existing.text += rawText;
    existing.timestamp = message?.timestamp ?? existing.timestamp;
    existing.spawnMode = spawnMode ?? existing.spawnMode;
  }

  return entries;
}

function buildAgentOutputsFromExecution(execution, swarmEngine = null) {
  const agentOutputs = {};
  const groupedMessages = {};
  const chatMessages = Array.isArray(execution?.chatMessages) ? execution.chatMessages : [];

  for (const msg of chatMessages) {
    if (msg.role !== 'assistant' || !msg.nodeId) continue;
    if (!groupedMessages[msg.nodeId]) groupedMessages[msg.nodeId] = [];
    groupedMessages[msg.nodeId].push(msg);
  }

  const agentStates = normalizeAgentStates(execution?.agentStates);
  const nodeIds = new Set(Object.keys(groupedMessages));
  for (const [nodeId, state] of agentStates.entries()) {
    if (!nodeId) continue;
    if (state?.status && state.status !== 'idle') {
      nodeIds.add(nodeId);
    }
  }
  for (const node of execution?.workflowDef?.nodes ?? []) {
    if (node?.type !== 'agent' || !node.id) continue;
    const state = agentStates.get(node.id);
    if ((groupedMessages[node.id]?.length ?? 0) > 0 || (state?.status && state.status !== 'idle')) {
      nodeIds.add(node.id);
    }
  }

  for (const nodeId of nodeIds) {
    const messages = groupedMessages[nodeId] ?? [];
    const state = agentStates.get(nodeId);
    const nodeDef = execution?.workflowDef?.nodes?.find((node) => node.id === nodeId);
    const timestamps = messages.map((msg) => msg.timestamp).filter(Boolean).sort((a, b) => a - b);
    const finalText = typeof swarmEngine?._resolveAgentFinalText === 'function'
      ? swarmEngine._resolveAgentFinalText(execution, nodeId, messages, state)
      : messages.map((msg) => msg.text || msg.content || '').filter(Boolean).join('\n\n');

    if (!finalText && messages.length === 0 && !state) continue;

    agentOutputs[nodeId] = {
      label: nodeDef?.data?.label || nodeId,
      finalText,
      outputEntries: typeof swarmEngine?._buildAgentOutputEntries === 'function'
        ? swarmEngine._buildAgentOutputEntries(execution, nodeId, messages, state)
        : buildOutputEntriesFromMessages(nodeId, messages, state),
      handoffPayloads: Array.isArray(state?.handoffPayloads) ? state.handoffPayloads : [],
      status: state?.status || 'unknown',
      provider: state?.runtimeProvider || state?.provider || null,
      messageCount: messages.length,
      firstMessageAt: timestamps[0] ? new Date(timestamps[0]).toISOString() : null,
      lastMessageAt: timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
    };
  }

  return agentOutputs;
}

function buildPackLike(packRun) {
  if (!packRun) return null;
  return {
    id: packRun.packId,
    packVersion: packRun.packVersion,
    visibleSteps: packRun.visibleSteps ?? [],
    outputSchema: packRun.outputSchema ?? {},
    artifactDefinitions: packRun.artifactDefinitions ?? [],
  };
}

export function buildLiveExecutionResults(execution, workflowName = '', swarmEngine = null) {
  const agentOutputs = buildAgentOutputsFromExecution(execution, swarmEngine);
  const status = execution?.status || 'unknown';
  const startedAt = execution?.startedAt ?? execution?.budget?.startedAt ?? null;
  const endedAt = TERMINAL_EXECUTION_STATUSES.has(status)
    ? (execution?.endedAt ?? new Date().toISOString())
    : null;
  const durationMs = startedAt && endedAt
    ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
    : null;
  const normalizedWorkflowName = workflowName || execution?.workflowDef?.name || 'Workflow';

  const packRun = execution?.packMetadata ?? null;
  const packLike = buildPackLike(packRun);
  const aggregatedArtifact = TERMINAL_EXECUTION_STATUSES.has(status)
    ? buildWorkflowArtifact({
        workflowName: normalizedWorkflowName,
        workflowDescription: execution?.workflowDef?.description || '',
        executionId: execution?.executionId,
        status,
        startedAt,
        endedAt,
        durationMs,
        agentOutputs,
      })
    : '';

  return {
    executionId: execution?.executionId,
    workflowName: normalizedWorkflowName,
    status,
    agentOutputs,
    chatMessages: Array.isArray(execution?.chatMessages) ? execution.chatMessages : [],
    aggregatedArtifact,
    ...(execution?.workflowRun ? { workflowRun: execution.workflowRun } : {}),
    ...(execution?.workflowRun
      ? {
          workflowResult: buildWorkflowResult({
            workflowDef: execution?.workflowDef,
            workflowRun: execution.workflowRun,
            workflowContext: execution?.workflowContext,
            agentOutputs,
            aggregatedArtifact,
            status,
          }),
        }
      : {}),
    ...(packRun ? { packRun } : {}),
    ...(packLike ? { packResult: buildPackResult(packLike, execution, agentOutputs, aggregatedArtifact) } : {}),
    meta: {
      startedAt,
      endedAt,
      durationMs,
      nodesRun: normalizeAgentStates(execution?.agentStates).size,
    },
  };
}

async function lookupHistoryExecution(executionId, workflowIdHint, appLocals) {
  const store = getHistoryStore(appLocals);
  let entry = null;
  let workflowName = '';

  if (workflowIdHint) {
    entry = await store.getEntry(workflowIdHint, executionId);
    if (entry) {
      try {
        const wfStore = appLocals.workflowStore;
        if (wfStore) {
          const wf = await wfStore.get(workflowIdHint);
          workflowName = wf?.name || '';
        }
      } catch {}
    }
  } else {
    const wfStore = appLocals.workflowStore;
    if (wfStore) {
      try {
        const workflows = await wfStore.list();
        for (const wf of workflows) {
          entry = await store.getEntry(wf.id, executionId);
          if (entry) {
            workflowName = wf.name || '';
            break;
          }
        }
      } catch {}
    }
  }

  if (!entry) return null;
  return { data: entry, workflowName };
}

export async function lookupExecution(executionId, workflowIdHint, appLocals, swarmEngine) {
  const liveStatus = swarmEngine?.getStatus?.(executionId);
  if (liveStatus) {
    const liveExecution = typeof swarmEngine?.getExecution === 'function'
      ? swarmEngine.getExecution(executionId)
      : null;
    const liveWorkflowId = workflowIdHint || liveStatus.workflowId || liveExecution?.workflowId || null;

    if (TERMINAL_EXECUTION_STATUSES.has(liveStatus.status)) {
      const liveChatCount = Array.isArray(liveExecution?.chatMessages) ? liveExecution.chatMessages.length : 0;
      if (liveChatCount === 0) {
        const persisted = await lookupHistoryExecution(executionId, liveWorkflowId, appLocals);
        if (persisted) {
          return { source: 'history', data: persisted.data, workflowName: persisted.workflowName };
        }
      }
    }

    let workflowName = liveExecution?.workflowDef?.name || '';
    try {
      const store = appLocals.workflowStore;
      if (store && liveWorkflowId) {
        const wf = await store.get(liveWorkflowId);
        workflowName = wf?.name || '';
      }
    } catch {}

    return { source: 'live', data: liveExecution ?? liveStatus, workflowName };
  }

  const persisted = await lookupHistoryExecution(executionId, workflowIdHint, appLocals);
  if (!persisted) return null;
  return { source: 'history', data: persisted.data, workflowName: persisted.workflowName };
}

export function buildExecutionResultsPayload(result, swarmEngine) {
  if (!result) return null;
  if (result.source === 'live') {
    return buildLiveExecutionResults(result.data, result.workflowName, swarmEngine);
  }

  const entry = result.data;
  const packLike = buildPackLike(entry.packRun);
  return {
    executionId: entry.executionId,
    workflowName: result.workflowName,
    status: entry.status,
    agentOutputs: entry.agentOutputs || {},
    aggregatedArtifact: entry.aggregatedArtifact || '',
    ...(entry.workflowRun ? { workflowRun: entry.workflowRun } : {}),
    ...(entry.workflowResult ? { workflowResult: entry.workflowResult } : {}),
    ...(entry.packRun ? { packRun: entry.packRun } : {}),
    ...(packLike ? { packResult: buildPackResult(packLike, entry, entry.agentOutputs || {}, entry.aggregatedArtifact || '') } : {}),
    meta: {
      startedAt: entry.startedAt ?? null,
      endedAt: entry.endedAt ?? null,
      durationMs: entry.durationMs ?? null,
      nodesRun: entry.nodesRun ?? 0,
    },
  };
}
