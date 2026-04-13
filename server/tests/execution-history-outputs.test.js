// tests/execution-history-outputs.test.js
// Tests for agentOutputs / aggregatedArtifact schema extensions and getEntry()

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ExecutionHistoryStore } from '../stores/ExecutionHistoryStore.js';

let tmpDir;
let store;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-hist-test-'));
  store = new ExecutionHistoryStore(tmpDir);
  await store.init();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('agentOutputs and aggregatedArtifact round-trip', () => {
  it('should persist and retrieve agentOutputs and aggregatedArtifact', async () => {
    const agentOutputs = {
      'node-1': {
        label: 'Research Agent',
        finalText: 'Some research results',
        outputEntries: [
          {
            id: 'turn-node-1-1',
            text: 'Some research results',
            timestamp: 1712484000000,
            turnId: 'node-1:1',
            spawnMode: 'stream-json',
          },
        ],
        handoffPayloads: [{ target: 'node-2', data: 'payload' }],
        status: 'completed',
        provider: 'anthropic',
        messageCount: 5,
        firstMessageAt: '2026-04-07T10:00:00Z',
        lastMessageAt: '2026-04-07T10:05:00Z',
      },
    };
    const aggregatedArtifact = '# Combined Output\n\nResearch results here.';

    const saved = await store.addEntry('wf-1', {
      executionId: 'exec-1',
      status: 'completed',
      agentOutputs,
      aggregatedArtifact,
    });

    expect(saved.agentOutputs).toEqual(agentOutputs);
    expect(saved.aggregatedArtifact).toBe(aggregatedArtifact);

    // Verify via getEntry
    const loaded = await store.getEntry('wf-1', 'exec-1');
    expect(loaded).not.toBeNull();
    expect(loaded.agentOutputs).toEqual(agentOutputs);
    expect(loaded.aggregatedArtifact).toBe(aggregatedArtifact);

    // Verify via getHistory
    const history = await store.getHistory('wf-1');
    expect(history).toHaveLength(1);
    expect(history[0].agentOutputs).toEqual(agentOutputs);
    expect(history[0].aggregatedArtifact).toBe(aggregatedArtifact);
  });

  it('persists workflow-native run and result metadata beside legacy output fields', async () => {
    const workflowRun = {
      kind: 'workflow-direct',
      inputs: { brief: 'Launch X' },
      inputContract: [{ key: 'brief', label: 'Brief', type: 'textarea', required: true }],
      outputContract: { outputs: [{ key: 'result', label: 'Result', source: 'finalText' }], artifacts: [] },
      startedAt: '2026-04-12T03:00:00.000Z',
    };
    const workflowResult = {
      status: 'completed',
      inputs: { brief: 'Launch X' },
      outputs: { result: 'Launch X output' },
      artifacts: [],
    };

    const saved = await store.addEntry('wf-run', {
      executionId: 'exec-run',
      status: 'completed',
      workflowRun,
      workflowResult,
    });

    expect(saved.workflowRun.inputs.brief).toBe('Launch X');
    expect(saved.workflowResult.outputs.result).toBe('Launch X output');

    const loaded = await store.getEntry('wf-run', 'exec-run');
    expect(loaded.workflowRun).toEqual(workflowRun);
    expect(loaded.workflowResult).toEqual(workflowResult);
  });

  it('should default agentOutputs to {} and aggregatedArtifact to "" when not provided', async () => {
    const saved = await store.addEntry('wf-2', {
      executionId: 'exec-2',
      status: 'completed',
    });

    expect(saved.agentOutputs).toEqual({});
    expect(saved.aggregatedArtifact).toBe('');

    const loaded = await store.getEntry('wf-2', 'exec-2');
    expect(loaded.agentOutputs).toEqual({});
    expect(loaded.aggregatedArtifact).toBe('');
    expect(loaded.workflowRun).toBeNull();
    expect(loaded.workflowResult).toBeNull();
  });
});

describe('backward compatibility — older entries without new fields', () => {
  it('should fill defaults when reading an older entry that lacks agentOutputs and aggregatedArtifact', async () => {
    // Manually write an old-format entry to disk (no agentOutputs/aggregatedArtifact)
    const historyDir = path.join(tmpDir, 'execution-history');
    const filePath = path.join(historyDir, 'wf-legacy.json');
    const oldEntry = [
      {
        executionId: 'exec-old',
        workflowId: 'wf-legacy',
        status: 'completed',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-01T00:01:00Z',
        durationMs: 60000,
        nodesRun: 3,
        outcome: 'done',
        nodeSnapshots: {},
      },
    ];
    fs.writeFileSync(filePath, JSON.stringify(oldEntry, null, 2));

    // getEntry should apply defaults
    const loaded = await store.getEntry('wf-legacy', 'exec-old');
    expect(loaded).not.toBeNull();
    expect(loaded.agentOutputs).toEqual({});
    expect(loaded.aggregatedArtifact).toBe('');

    // getHistory should also apply defaults
    const history = await store.getHistory('wf-legacy');
    expect(history).toHaveLength(1);
    expect(history[0].agentOutputs).toEqual({});
    expect(history[0].aggregatedArtifact).toBe('');
  });
});

describe('getEntry — not found', () => {
  it('should return null for a non-existent executionId', async () => {
    await store.addEntry('wf-3', { executionId: 'exec-exists', status: 'completed' });
    const result = await store.getEntry('wf-3', 'exec-missing');
    expect(result).toBeNull();
  });

  it('should return null for a non-existent workflowId', async () => {
    const result = await store.getEntry('wf-nonexistent', 'exec-1');
    expect(result).toBeNull();
  });

  it('should return null for null/undefined params', async () => {
    expect(await store.getEntry(null, 'exec-1')).toBeNull();
    expect(await store.getEntry('wf-1', null)).toBeNull();
    expect(await store.getEntry(undefined, undefined)).toBeNull();
  });
});

describe('getEntry — path traversal prevention', () => {
  it('should return null for workflowId with traversal characters', async () => {
    expect(await store.getEntry('../../etc/passwd', 'exec-1')).toBeNull();
    expect(await store.getEntry('wf/../secret', 'exec-1')).toBeNull();
    expect(await store.getEntry('wf\\..\\secret', 'exec-1')).toBeNull();
  });

  it('should return null for executionId with traversal characters', async () => {
    expect(await store.getEntry('wf-1', '../../etc/passwd')).toBeNull();
    expect(await store.getEntry('wf-1', 'exec/../secret')).toBeNull();
    expect(await store.getEntry('wf-1', 'exec\\..\\secret')).toBeNull();
  });

  it('should return null for executionId containing null bytes', async () => {
    expect(await store.getEntry('wf-1', 'exec\0id')).toBeNull();
  });

  it('should return null for non-string params', async () => {
    expect(await store.getEntry(123, 'exec-1')).toBeNull();
    expect(await store.getEntry('wf-1', 123)).toBeNull();
  });
});
