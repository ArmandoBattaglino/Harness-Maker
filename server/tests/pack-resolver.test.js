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
});
