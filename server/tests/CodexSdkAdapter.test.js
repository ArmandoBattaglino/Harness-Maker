import { describe, expect, it, vi } from 'vitest';
import {
  buildCodexSdkClientOptions,
  buildCodexSdkThreadOptions,
  createCodexSdkClient,
  getCodexSdkThread,
  normalizeCodexSdkItem,
  runCodexSdkTurnStreamed,
} from '../services/CodexSdkAdapter.js';

describe('CodexSdkAdapter', () => {
  it('buildCodexSdkClientOptions maps supported client fields', () => {
    const options = buildCodexSdkClientOptions({
      codexPath: 'C:\\bin\\codex.exe',
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      config: { show_raw_agent_reasoning: true },
      env: { PATH: 'C:\\bin' },
    });

    expect(options).toEqual({
      codexPathOverride: 'C:\\bin\\codex.exe',
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      config: { show_raw_agent_reasoning: true },
      env: { PATH: 'C:\\bin' },
    });
  });

  it('buildCodexSdkThreadOptions drops null and empty values', () => {
    const options = buildCodexSdkThreadOptions({
      model: 'gpt-5.4',
      workingDirectory: 'C:\\repo',
      networkAccessEnabled: true,
      approvalPolicy: 'never',
      additionalDirectories: [],
      sandboxMode: null,
    });

    expect(options).toEqual({
      model: 'gpt-5.4',
      workingDirectory: 'C:\\repo',
      networkAccessEnabled: true,
      approvalPolicy: 'never',
    });
  });

  it('createCodexSdkClient instantiates the provided constructor', () => {
    const FakeCodex = vi.fn();

    createCodexSdkClient({ codexPath: 'C:\\bin\\codex.exe' }, FakeCodex);

    expect(FakeCodex).toHaveBeenCalledWith({
      codexPathOverride: 'C:\\bin\\codex.exe',
    });
  });

  it('getCodexSdkThread starts a new thread when no threadId is present', () => {
    const client = {
      startThread: vi.fn(() => ({ id: null })),
      resumeThread: vi.fn(),
    };

    const thread = getCodexSdkThread(client, {
      threadOptions: { model: 'gpt-5.4', workingDirectory: 'C:\\repo' },
    });

    expect(thread).toEqual({ id: null });
    expect(client.startThread).toHaveBeenCalledWith({
      model: 'gpt-5.4',
      workingDirectory: 'C:\\repo',
    });
    expect(client.resumeThread).not.toHaveBeenCalled();
  });

  it('getCodexSdkThread resumes an existing thread when threadId is present', () => {
    const client = {
      startThread: vi.fn(),
      resumeThread: vi.fn(() => ({ id: 'thread-123' })),
    };

    const thread = getCodexSdkThread(client, {
      threadId: 'thread-123',
      threadOptions: { approvalPolicy: 'never' },
    });

    expect(thread).toEqual({ id: 'thread-123' });
    expect(client.resumeThread).toHaveBeenCalledWith('thread-123', {
      approvalPolicy: 'never',
    });
    expect(client.startThread).not.toHaveBeenCalled();
  });

  it('runCodexSdkTurnStreamed returns the thread and streamed events generator', async () => {
    async function* makeEvents() {
      yield { type: 'turn.started' };
      yield { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 2 } };
    }

    const thread = {
      runStreamed: vi.fn(async () => ({ events: makeEvents() })),
    };
    const client = {
      startThread: vi.fn(() => thread),
      resumeThread: vi.fn(),
    };

    const result = await runCodexSdkTurnStreamed({
      client,
      input: 'Diagnose the issue',
      threadOptions: { model: 'gpt-5.4' },
    });

    expect(result.thread).toBe(thread);
    expect(result.events).toBeTruthy();
    expect(thread.runStreamed).toHaveBeenCalledWith('Diagnose the issue', {});
  });

  it('normalizeCodexSdkItem maps command execution items', () => {
    expect(normalizeCodexSdkItem({
      id: 'cmd-1',
      type: 'command_execution',
      command: 'npm test',
      aggregated_output: 'ok',
      exit_code: 0,
      status: 'completed',
    })).toEqual({
      kind: 'command_execution',
      id: 'cmd-1',
      command: 'npm test',
      aggregatedOutput: 'ok',
      exitCode: 0,
      status: 'completed',
    });
  });

  it('normalizeCodexSdkItem maps MCP tool calls with a composed tool name', () => {
    expect(normalizeCodexSdkItem({
      id: 'tool-1',
      type: 'mcp_tool_call',
      server: 'filesystem',
      tool: 'read_file',
      arguments: { path: 'README.md' },
      status: 'in_progress',
    })).toEqual({
      kind: 'mcp_tool_call',
      id: 'tool-1',
      server: 'filesystem',
      tool: 'read_file',
      toolName: 'filesystem.read_file',
      arguments: { path: 'README.md' },
      result: null,
      error: null,
      status: 'in_progress',
    });
  });
});
