import { describe, expect, it } from 'vitest';
import { sanitizeWorkflow } from './sanitizeWorkflow.js';

describe('sanitizeWorkflow visual node normalization', () => {
  it('writes canonical workflowInput nodes while preserving legacy aliases on read', () => {
    const sanitized = sanitizeWorkflow({
      name: 'Legacy workflow',
      nodes: [
        {
          id: 'input-a',
          type: 'input',
          position: { x: 10, y: 20 },
          data: { label: 'Legacy Input', fields: [] },
          selected: true,
          measured: { width: 100, height: 100 },
        },
      ],
      edges: [],
    });

    expect(sanitized.nodes[0]).toEqual({
      id: 'input-a',
      type: 'workflowInput',
      position: { x: 10, y: 20 },
      data: { label: 'Legacy Input', fields: [] },
    });
  });
});
