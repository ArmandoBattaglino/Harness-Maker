import { describe, expect, it } from 'vitest';

import PackResolver from '../services/PackResolver.js';

describe('PackResolver', () => {
  const resolver = new PackResolver();

  it('applies knowledge mergeStrategy semantics and sorts behavior rules by priority', () => {
    const resolved = resolver.resolveForRun({
      id: 'pack-1',
      name: 'Harness',
      packVersion: '1.0.0',
      workflowId: 'wf-1',
      engineCompatibility: '^1.0.0',
      dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: 'wf-1', required: true }],
      knowledgeSources: [
        {
          id: 'source-1',
          mergeStrategy: 'merge',
          content: { audience: 'B2B', notes: ['alpha'] },
        },
        {
          id: 'source-2',
          mergeStrategy: 'append',
          content: { notes: ['beta'] },
        },
        {
          id: 'source-3',
          mergeStrategy: 'replace',
          content: { audience: 'Enterprise' },
        },
      ],
      behaviorRules: [
        { id: 'late', name: 'Late', instruction: 'Late', priority: 50, mode: 'append' },
        { id: 'early', name: 'Early', instruction: 'Early', priority: 5, mode: 'append' },
      ],
      visibleSteps: [],
      completionCriteria: [],
    }, {
      input: { brief: 'Launch' },
      projectId: 'proj-1',
      projectPath: 'C:/projects/demo',
    });

    expect(resolved.workflowContextPatch.packKnowledge).toEqual({ audience: 'Enterprise' });
    expect(resolved.workflowContextPatch.packBehaviorDirectives.map((rule) => rule.id)).toEqual(['early', 'late']);
  });

  it('fails fast when engine compatibility or required dependencies are unsatisfied', () => {
    expect(() => resolver.resolveForRun({
      id: 'pack-1',
      name: 'Harness',
      packVersion: '1.0.0',
      workflowId: 'wf-1',
      engineCompatibility: '^99.0.0',
      dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: 'wf-1', required: true }],
      knowledgeSources: [],
      behaviorRules: [],
      visibleSteps: [],
      completionCriteria: [],
    }, {
      input: {},
      projectId: 'proj-1',
      projectPath: 'C:/projects/demo',
    })).toThrow(/engineCompatibility/);

    expect(() => resolver.resolveForRun({
      id: 'pack-1',
      name: 'Harness',
      packVersion: '1.0.0',
      workflowId: 'wf-1',
      engineCompatibility: '^1.0.0',
      dependencies: [],
      knowledgeSources: [],
      behaviorRules: [],
      visibleSteps: [],
      completionCriteria: [],
    }, {
      input: {},
      projectId: 'proj-1',
      projectPath: 'C:/projects/demo',
    })).toThrow(/workflow dependency/);
  });

  it('loads pack and workflow together through resolveFromStores', async () => {
    const pack = {
      id: 'pack-1',
      name: 'Harness',
      packVersion: '1.0.0',
      workflowId: 'wf-1',
      engineCompatibility: '^1.0.0',
      dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: 'wf-1', required: true }],
      knowledgeSources: [],
      behaviorRules: [],
      visibleSteps: [],
      completionCriteria: [],
    };
    const resolved = await resolver.resolveFromStores({
      packId: 'pack-1',
      packStore: { get: async () => pack },
      workflowStore: { get: async () => ({ id: 'wf-1', nodes: [] }) },
      input: {},
      projectId: 'proj-1',
      projectPath: 'C:/projects/demo',
    });

    expect(resolved.pack).toBe(pack);
    expect(resolved.workflow.id).toBe('wf-1');
    expect(resolved.workflowId).toBe('wf-1');
  });
});
