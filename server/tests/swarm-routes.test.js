import { describe, it, expect } from 'vitest';
import { resolveBroadcastNodeTargets } from '../routes/swarm.js';

describe('resolveBroadcastNodeTargets', () => {
  const execution = {
    workflowDef: {
      nodes: [
        { id: 'dept-billing', type: 'department', data: { label: 'Billing' } },
        {
          id: 'agent-triage',
          type: 'agent',
          data: { label: 'Triage Agent', parentDepartmentId: 'dept-billing' },
        },
        {
          id: 'agent-billing',
          type: 'agent',
          parentId: 'dept-billing',
          data: { label: 'Billing Agent' },
        },
        { id: 'agent-idle', type: 'agent', data: { label: 'Idle Agent' } },
      ],
    },
    agentStates: {
      'agent-triage': { status: 'running', sessionId: 'sess-triage' },
      'agent-billing': { status: 'running', sessionId: 'sess-billing' },
      'agent-idle': { status: 'paused', sessionId: 'sess-idle' },
    },
  };

  it('returns all running agent recipients for all scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'all', null);

    expect(targets).toEqual([
      { nodeId: 'agent-triage', sessionId: 'sess-triage', label: 'Triage Agent' },
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
    ]);
  });

  it('filters running agent recipients by department scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'department', 'dept-billing');

    expect(targets).toEqual([
      { nodeId: 'agent-triage', sessionId: 'sess-triage', label: 'Triage Agent' },
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
    ]);
  });

  it('filters running agent recipients by specific agent scope', () => {
    const targets = resolveBroadcastNodeTargets(execution, 'agent', 'agent-billing');

    expect(targets).toEqual([
      { nodeId: 'agent-billing', sessionId: 'sess-billing', label: 'Billing Agent' },
    ]);
  });
});
