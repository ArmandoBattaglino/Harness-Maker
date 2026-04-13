import { describe, expect, it } from 'vitest';
import SwarmEngine from '../services/SwarmEngine.js';
import { prepareWorkflowRun } from '../services/workflowContracts.js';

describe('SwarmEngine visual I/O graph semantics', () => {
  const workflowDef = {
    id: 'wf-visual',
    name: 'Visual workflow',
    nodes: [
      { id: 'input-a', type: 'workflowInput', data: { label: 'Creative intake', fields: [{ key: 'brief', label: 'Brief', type: 'text', required: true }] } },
      { id: 'agent-a', type: 'agent', data: { label: 'Connected agent', systemPrompt: 'Use the connected input.' } },
      { id: 'agent-b', type: 'agent', data: { label: 'Other agent', systemPrompt: 'Do other work.' } },
      { id: 'extract-a', type: 'outputExtractor', data: { artifactKey: 'report', artifactName: 'Report', format: 'markdown' } },
    ],
    edges: [
      { id: 'e1', source: 'input-a', target: 'agent-a' },
      { id: 'e2', source: 'agent-a', target: 'extract-a' },
    ],
  };

  it('does not schedule input/extractor nodes as agents and scopes visual inputs by connection', () => {
    const engine = new SwarmEngine({}, {});
    const run = prepareWorkflowRun(workflowDef, { brief: 'Launch scoped workflow' });
    const execution = { workflowDef, workflowRun: run, chatMessages: [], inboundHandoffs: new Map() };
    const workflowContext = { workflowRun: run, currentTask: 'Run visual workflow' };

    expect(engine._getStartNodes(workflowDef).map((node) => node.id)).toEqual(['agent-a', 'agent-b']);
    expect(engine._isFlowControlNode(workflowDef.nodes.find((node) => node.id === 'extract-a'))).toBe(true);

    const connectedPrompt = engine._buildSystemPrompt(
      workflowDef.nodes.find((node) => node.id === 'agent-a'),
      workflowContext,
      ['extract-a'],
      null,
      { execution }
    );
    const unconnectedPrompt = engine._buildSystemPrompt(
      workflowDef.nodes.find((node) => node.id === 'agent-b'),
      workflowContext,
      [],
      null,
      { execution }
    );

    expect(connectedPrompt).toContain('Connected visual Input block fields only');
    expect(connectedPrompt).toContain('Launch scoped workflow');
    expect(unconnectedPrompt).toContain('No visual Input blocks are connected to this agent.');
    expect(unconnectedPrompt).not.toContain('Launch scoped workflow');
  });

  it('still treats legacy input aliases as non-startable visual input nodes', () => {
    const engine = new SwarmEngine({}, {});
    const legacyWorkflow = {
      ...workflowDef,
      nodes: workflowDef.nodes.map((node) => (node.id === 'input-a' ? { ...node, type: 'input' } : node)),
    };

    expect(engine._getStartNodes(legacyWorkflow).map((node) => node.id)).toEqual(['agent-a', 'agent-b']);
  });
});
