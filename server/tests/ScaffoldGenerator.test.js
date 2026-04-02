import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkflowPrompt,
  generateWorkflowFromPrompt,
  parseClaudeCliEnvelope,
  parseWorkflowDefinition,
} from '../services/ScaffoldGenerator.js';

describe('ScaffoldGenerator', () => {
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

    const workflow = await generateWorkflowFromPrompt({
      prompt: 'Create a customer support workflow that routes billing and technical requests.',
      claudeBin: 'claude.exe',
      codexBin: 'codex.exe',
      runClaude,
      runCodex,
    });

    expect(workflow.name).toContain('Workflow');
    expect(workflow.nodes[0].data.isTriageNode).toBe(true);
    expect(workflow.nodes.map((node) => node.data.label)).toContain('Billing Agent');
    expect(workflow.nodes.map((node) => node.data.label)).toContain('Technical Support Agent');
    expect(workflow.edges).toHaveLength(2);
  });
});
