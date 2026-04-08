import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('cross-spawn', () => ({
  default: spawnMock,
}));

import {
  buildWorkflowPrompt,
  generateWorkflowFromPrompt,
  parseClaudeCliEnvelope,
  parseGeminiCliEnvelope,
  parseWorkflowDefinition,
} from '../services/ScaffoldGenerator.js';

describe('ScaffoldGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockChild({ stdoutText = '', stderrText = '', exitCode = 0 } = {}) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };

    queueMicrotask(() => {
      if (stdoutText) child.stdout.write(stdoutText);
      if (stderrText) child.stderr.write(stderrText);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', exitCode);
    });

    return child;
  }

  it('buildWorkflowPrompt includes the user description', () => {
    const prompt = buildWorkflowPrompt('Create a billing triage workflow');
    expect(prompt).toContain('Create a billing triage workflow');
    expect(prompt).toContain('Output ONLY valid JSON');
  });

  it('parseClaudeCliEnvelope surfaces structured Claude CLI errors from stdout', () => {
    const envelope = parseClaudeCliEnvelope(JSON.stringify({
      type: 'result',
      is_error: true,
      result: "You've hit your limit · resets 8pm",
    }));

    expect(envelope.isError).toBe(true);
    expect(envelope.text).toContain("You've hit your limit");
  });

  it('parseGeminiCliEnvelope surfaces structured Gemini CLI errors and responses', () => {
    const envelope1 = parseGeminiCliEnvelope(JSON.stringify({
      response: "Here is your JSON layout",
      error: null,
    }));
    expect(envelope1.isError).toBe(false);
    expect(envelope1.text).toContain("Here is your JSON layout");

    const envelope2 = parseGeminiCliEnvelope(JSON.stringify({
      error: { message: "Resource Exhausted" },
    }));
    expect(envelope2.isError).toBe(true);
  });

  it('parseWorkflowDefinition strips markdown fences', () => {
    const workflow = parseWorkflowDefinition(
      '```json\n{"name":"Test Workflow","nodes":[{"id":"node-1"}],"edges":[]}\n```',
      'TestProvider'
    );

    expect(workflow.name).toBe('Test Workflow');
    expect(workflow.nodes).toHaveLength(1);
  });

  it('prefers Claude when Claude scaffold succeeds', async () => {
    const runClaude = vi.fn().mockResolvedValue({
      name: 'Claude Workflow',
      nodes: [{ id: 'node-1' }],
      edges: [],
    });
    const runCodex = vi.fn();

    const workflow = await generateWorkflowFromPrompt({
      prompt: 'Create a simple workflow',
      claudeBin: 'claude.exe',
      codexBin: 'codex.exe',
      runClaude,
      runCodex,
    });

    expect(workflow.name).toBe('Claude Workflow');
    expect(runClaude).toHaveBeenCalledOnce();
    expect(runCodex).not.toHaveBeenCalled();
  });

  it('falls back to Codex when Claude fails', async () => {
    const runClaude = vi.fn().mockRejectedValue(new Error("You've hit your limit · resets 8pm"));
    const runCodex = vi.fn().mockResolvedValue({
      name: 'Codex Workflow',
      nodes: [{ id: 'node-1' }],
      edges: [],
    });

    const workflow = await generateWorkflowFromPrompt({
      prompt: 'Create a simple workflow',
      claudeBin: 'claude.exe',
      codexBin: 'codex.exe',
      runClaude,
      runCodex,
    });

    expect(workflow.name).toBe('Codex Workflow');
    expect(runClaude).toHaveBeenCalledOnce();
    expect(runCodex).toHaveBeenCalledOnce();
  });

  it('falls back to Gemini when Claude and Codex fail', async () => {
    const runClaude = vi.fn().mockRejectedValue(new Error("Claude limit"));
    const runCodex = vi.fn().mockRejectedValue(new Error("Codex limit"));
    const runGemini = vi.fn().mockResolvedValue({
      name: 'Gemini Workflow',
      nodes: [{ id: 'node-1' }],
      edges: [],
    });

    const workflow = await generateWorkflowFromPrompt({
      prompt: 'Create a simple workflow',
      claudeBin: 'claude.exe',
      codexBin: 'codex.exe',
      geminiBin: 'gemini.exe',
      runClaude,
      runCodex,
      runGemini,
    });

    expect(workflow.name).toBe('Gemini Workflow');
    expect(runClaude).toHaveBeenCalledOnce();
    expect(runCodex).toHaveBeenCalledOnce();
    expect(runGemini).toHaveBeenCalledOnce();
  });

  it('returns a combined provider error when both providers fail', async () => {
    const runClaude = vi.fn().mockRejectedValue(Object.assign(new Error("You've hit your limit"), {
      provider: 'claude',
      statusCode: 503,
    }));
    const runCodex = vi.fn().mockRejectedValue(Object.assign(new Error('Codex exited 1'), {
      provider: 'codex',
      statusCode: 500,
    }));

    await expect(generateWorkflowFromPrompt({
      prompt: 'Create a simple workflow',
      claudeBin: 'claude.exe',
      codexBin: 'codex.exe',
      runClaude,
      runCodex,
    })).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('falls back to a local deterministic workflow when all providers are unavailable', async () => {
    const runClaude = vi.fn().mockRejectedValue(Object.assign(new Error("You've hit your limit"), {
      provider: 'claude',
      statusCode: 503,
    }));
    const runCodex = vi.fn().mockRejectedValue(Object.assign(new Error('403 Forbidden'), {
      provider: 'codex',
      statusCode: 503,
    }));
    const runGemini = vi.fn().mockRejectedValue(Object.assign(new Error('Resource Exhausted'), {
      provider: 'gemini',
      statusCode: 503,
    }));

    const workflow = await generateWorkflowFromPrompt({
      prompt: 'Create a customer support workflow that routes billing and technical requests.',
      claudeBin: 'claude.exe',
      codexBin: 'codex.exe',
      geminiBin: 'gemini.exe',
      runClaude,
      runCodex,
      runGemini,
    });

    expect(workflow.name).toContain('Workflow');
    expect(workflow.nodes[0].data.isTriageNode).toBe(true);
    expect(workflow.nodes.map((node) => node.data.label)).toContain('Billing Agent');
    expect(workflow.nodes.map((node) => node.data.label)).toContain('Technical Support Agent');
    expect(workflow.edges).toHaveLength(2);
  });

  it('uses --tools none for Claude scaffold generation', async () => {
    const workflowJson = {
      name: 'CLI Workflow',
      description: 'Generated from Claude CLI',
      nodes: [
        {
          id: 'node-1',
          type: 'agent',
          data: {
            label: 'Triage Agent',
            systemPrompt: 'Route work',
            isTriageNode: true,
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    spawnMock.mockImplementation(() => makeMockChild({
      stdoutText: JSON.stringify({
        type: 'result',
        is_error: false,
        result: JSON.stringify(workflowJson),
      }),
    }));

    const workflow = await generateWorkflowFromPrompt({
      prompt: 'Create a simple workflow',
      claudeBin: 'claude.exe',
    });

    const spawnArgs = spawnMock.mock.calls[0][1];
    const toolsFlagIndex = spawnArgs.indexOf('--tools');
    const legacyToolsFlag = ['--allowed', 'Tools'].join('');

    expect(workflow.name).toBe('CLI Workflow');
    expect(toolsFlagIndex).toBeGreaterThan(-1);
    expect(spawnArgs[toolsFlagIndex + 1]).toBe('none');
    expect(spawnArgs).not.toContain(legacyToolsFlag);
  });
});
