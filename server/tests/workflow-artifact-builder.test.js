// tests/workflow-artifact-builder.test.js
// Unit tests for WorkflowArtifactBuilder pure function

import { describe, it, expect } from 'vitest';
import { buildWorkflowArtifact } from '../services/WorkflowArtifactBuilder.js';

describe('WorkflowArtifactBuilder', () => {
  describe('basic 2-agent workflow with handoff', () => {
    it('should produce correct markdown with both agent sections', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'Test Flow',
        workflowDescription: 'A test workflow',
        executionId: 'exec-001',
        status: 'completed',
        startedAt: '2026-04-07T10:00:00Z',
        endedAt: '2026-04-07T10:05:00Z',
        durationMs: 300_000,
        agentOutputs: {
          'node-a': {
            label: 'Planner',
            finalText: 'Plan created successfully.',
            handoffPayloads: [
              { target: 'node-b', payload: { summary: 'do work' }, timestamp: '2026-04-07T10:02:00Z' },
            ],
            status: 'done',
            provider: 'claude',
            messageCount: 5,
            firstMessageAt: '2026-04-07T10:00:10Z',
            lastMessageAt: '2026-04-07T10:02:00Z',
          },
          'node-b': {
            label: 'Worker',
            finalText: 'Work completed.',
            handoffPayloads: [],
            status: 'done',
            provider: 'codex',
            messageCount: 8,
            firstMessageAt: '2026-04-07T10:02:05Z',
            lastMessageAt: '2026-04-07T10:04:50Z',
          },
        },
      });

      expect(md).toContain('# Workflow: Test Flow');
      expect(md).toContain('> A test workflow');
      expect(md).toContain('`exec-001`');
      expect(md).toContain('**Status:** completed');
      expect(md).toContain('**Duration:** 5m 0s');
      // Agent A section
      expect(md).toContain('## Planner (`node-a`)');
      expect(md).toContain('**Provider:** claude');
      expect(md).toContain('Plan created successfully.');
      expect(md).toContain('### Handoff → node-b');
      expect(md).toContain('"summary": "do work"');
      // Agent B section
      expect(md).toContain('## Worker (`node-b`)');
      expect(md).toContain('**Provider:** codex');
      expect(md).toContain('Work completed.');
      // Planner should appear before Worker (sorted by firstMessageAt)
      const plannerIdx = md.indexOf('## Planner');
      const workerIdx = md.indexOf('## Worker');
      expect(plannerIdx).toBeLessThan(workerIdx);
    });
  });

  describe('empty agentOutputs', () => {
    it('should produce fallback message when agentOutputs is empty', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'Empty',
        executionId: 'exec-empty',
        status: 'completed',
        agentOutputs: {},
      });
      expect(md).toContain('No agent outputs were captured for this execution.');
    });

    it('should produce fallback message when agentOutputs is undefined', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'Nil',
        executionId: 'exec-nil',
        status: 'completed',
      });
      expect(md).toContain('No agent outputs were captured for this execution.');
    });
  });

  describe('agent without handoff', () => {
    it('should omit handoff section when handoffPayloads is empty', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'Single',
        executionId: 'exec-single',
        status: 'completed',
        durationMs: 10_000,
        agentOutputs: {
          'node-x': {
            label: 'Solo Agent',
            finalText: 'Did all the work.',
            handoffPayloads: [],
            status: 'done',
            provider: 'claude',
            messageCount: 3,
            firstMessageAt: '2026-04-07T10:00:00Z',
            lastMessageAt: '2026-04-07T10:00:10Z',
          },
        },
      });
      expect(md).toContain('## Solo Agent (`node-x`)');
      expect(md).toContain('Did all the work.');
      expect(md).not.toContain('### Handoff');
    });
  });

  describe('duration formatting', () => {
    it('should format seconds only for < 60s', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'D', executionId: 'e', status: 's',
        durationMs: 45_000,
      });
      expect(md).toContain('**Duration:** 45s');
    });

    it('should format minutes and seconds for < 1h', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'D', executionId: 'e', status: 's',
        durationMs: 125_000,
      });
      expect(md).toContain('**Duration:** 2m 5s');
    });

    it('should format hours, minutes, seconds for >= 1h', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'D', executionId: 'e', status: 's',
        durationMs: 3_661_000,
      });
      expect(md).toContain('**Duration:** 1h 1m 1s');
    });

    it('should show N/A for null durationMs', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'D', executionId: 'e', status: 's',
        durationMs: null,
      });
      expect(md).toContain('**Duration:** N/A');
    });

    it('should format 0ms as 0s', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'D', executionId: 'e', status: 's',
        durationMs: 0,
      });
      expect(md).toContain('**Duration:** 0s');
    });
  });

  describe('null/missing fields', () => {
    it('should not crash with entirely missing fields', () => {
      expect(() => buildWorkflowArtifact({})).not.toThrow();
      expect(() => buildWorkflowArtifact()).not.toThrow();
    });

    it('should show "(No output captured)" when finalText is empty', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'NullAgent',
        executionId: 'e',
        status: 's',
        agentOutputs: {
          'node-z': {
            label: 'Ghost',
            finalText: '',
            handoffPayloads: null,
            status: null,
            provider: null,
            messageCount: null,
            firstMessageAt: null,
            lastMessageAt: null,
          },
        },
      });
      expect(md).toContain('(No output captured)');
      expect(md).toContain('**Provider:** N/A');
      expect(md).toContain('**Status:** unknown');
      expect(md).toContain('**Messages:** 0');
    });

    it('should use nodeId as label when label is missing', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'W', executionId: 'e', status: 's',
        agentOutputs: {
          'my-node': { finalText: 'output' },
        },
      });
      expect(md).toContain('## my-node (`my-node`)');
    });

    it('should show defaults for missing startedAt and endedAt', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'W', executionId: 'e', status: 's',
      });
      expect(md).toContain('**Started:** N/A');
      expect(md).toContain('**Ended:** N/A');
    });
  });

  describe('sort order', () => {
    it('should sort agents by firstMessageAt, nulls last', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'Sort',
        executionId: 'e',
        status: 's',
        agentOutputs: {
          'late': {
            label: 'Late Agent',
            finalText: 'late output',
            firstMessageAt: '2026-04-07T10:05:00Z',
          },
          'early': {
            label: 'Early Agent',
            finalText: 'early output',
            firstMessageAt: '2026-04-07T10:00:00Z',
          },
          'none': {
            label: 'No Time Agent',
            finalText: 'no time output',
            firstMessageAt: null,
          },
        },
      });
      const earlyIdx = md.indexOf('## Early Agent');
      const lateIdx = md.indexOf('## Late Agent');
      const noneIdx = md.indexOf('## No Time Agent');
      expect(earlyIdx).toBeLessThan(lateIdx);
      expect(lateIdx).toBeLessThan(noneIdx);
    });
  });

  describe('footer', () => {
    it('should include generated-by footer', () => {
      const md = buildWorkflowArtifact({
        workflowName: 'W', executionId: 'e', status: 's',
      });
      expect(md).toContain('*Generated by Claude Code Visual Manager');
    });
  });
});
