// server/services/CodexSdkAdapter.js
// Thin wrapper around @openai/codex-sdk so SwarmEngine can adopt a structured
// Codex path without depending directly on SDK-specific option shapes.

import { Codex } from '@openai/codex-sdk';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function pickDefinedEntries(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== null));
}

export function buildCodexSdkClientOptions(options = {}) {
  const {
    codexPath = null,
    baseUrl = null,
    apiKey = null,
    config = null,
    env = null,
  } = options;

  return pickDefinedEntries([
    ['codexPathOverride', codexPath || undefined],
    ['baseUrl', baseUrl || undefined],
    ['apiKey', apiKey || undefined],
    ['config', isPlainObject(config) ? config : undefined],
    ['env', isPlainObject(env) ? env : undefined],
  ]);
}

export function createCodexSdkClient(options = {}, CodexCtor = Codex) {
  return new CodexCtor(buildCodexSdkClientOptions(options));
}

export function buildCodexSdkThreadOptions(options = {}) {
  const {
    model = null,
    sandboxMode = null,
    workingDirectory = null,
    skipGitRepoCheck = null,
    modelReasoningEffort = null,
    networkAccessEnabled = null,
    webSearchMode = null,
    webSearchEnabled = null,
    approvalPolicy = null,
    additionalDirectories = null,
  } = options;

  return pickDefinedEntries([
    ['model', model || undefined],
    ['sandboxMode', sandboxMode || undefined],
    ['workingDirectory', workingDirectory || undefined],
    ['skipGitRepoCheck', typeof skipGitRepoCheck === 'boolean' ? skipGitRepoCheck : undefined],
    ['modelReasoningEffort', modelReasoningEffort || undefined],
    ['networkAccessEnabled', typeof networkAccessEnabled === 'boolean' ? networkAccessEnabled : undefined],
    ['webSearchMode', webSearchMode || undefined],
    ['webSearchEnabled', typeof webSearchEnabled === 'boolean' ? webSearchEnabled : undefined],
    ['approvalPolicy', approvalPolicy || undefined],
    ['additionalDirectories', Array.isArray(additionalDirectories) && additionalDirectories.length > 0
      ? additionalDirectories
      : undefined],
  ]);
}

export function getCodexSdkThread(client, { threadId = null, threadOptions = {} } = {}) {
  if (!client) {
    throw new Error('Codex SDK client is required');
  }

  const normalizedThreadOptions = buildCodexSdkThreadOptions(threadOptions);
  if (threadId) {
    return client.resumeThread(threadId, normalizedThreadOptions);
  }

  return client.startThread(normalizedThreadOptions);
}

export async function runCodexSdkTurnStreamed({
  client,
  input,
  threadId = null,
  threadOptions = {},
  turnOptions = {},
} = {}) {
  const thread = getCodexSdkThread(client, { threadId, threadOptions });
  const { events } = await thread.runStreamed(input, turnOptions);
  return { thread, events };
}

export function normalizeCodexSdkItem(item = {}) {
  if (!item || typeof item !== 'object') {
    return { kind: 'unknown', raw: item };
  }

  switch (item.type) {
    case 'agent_message':
      return {
        kind: 'agent_message',
        id: item.id ?? null,
        text: String(item.text ?? ''),
      };

    case 'reasoning':
      return {
        kind: 'reasoning',
        id: item.id ?? null,
        text: String(item.text ?? ''),
      };

    case 'command_execution':
      return {
        kind: 'command_execution',
        id: item.id ?? null,
        command: String(item.command ?? ''),
        aggregatedOutput: String(item.aggregated_output ?? ''),
        exitCode: item.exit_code ?? null,
        status: item.status ?? 'in_progress',
      };

    case 'file_change':
      return {
        kind: 'file_change',
        id: item.id ?? null,
        status: item.status ?? 'completed',
        changes: Array.isArray(item.changes)
          ? item.changes.map((change) => ({
            path: String(change?.path ?? ''),
            kind: change?.kind ?? 'update',
          }))
          : [],
      };

    case 'mcp_tool_call':
      return {
        kind: 'mcp_tool_call',
        id: item.id ?? null,
        server: String(item.server ?? ''),
        tool: String(item.tool ?? ''),
        toolName: [item.server, item.tool].filter(Boolean).join('.'),
        arguments: item.arguments ?? null,
        result: item.result ?? null,
        error: item.error?.message ?? null,
        status: item.status ?? 'in_progress',
      };

    case 'web_search':
      return {
        kind: 'web_search',
        id: item.id ?? null,
        query: String(item.query ?? ''),
      };

    case 'todo_list':
      return {
        kind: 'todo_list',
        id: item.id ?? null,
        items: Array.isArray(item.items)
          ? item.items.map((todo) => ({
            text: String(todo?.text ?? ''),
            completed: Boolean(todo?.completed),
          }))
          : [],
      };

    case 'error':
      return {
        kind: 'error',
        id: item.id ?? null,
        message: String(item.message ?? ''),
      };

    default:
      return {
        kind: item.type ?? 'unknown',
        raw: item,
      };
  }
}
