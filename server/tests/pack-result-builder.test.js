import { describe, expect, it } from 'vitest';

import { buildPackResult } from '../services/PackResultBuilder.js';

describe('buildPackResult', () => {
  it('prefers the last visible step node output instead of raw insertion order', () => {
    const pack = {
      id: 'pack-1',
      packVersion: '1.0.0',
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string' },
        },
      },
      visibleSteps: [
        { id: 'research', label: 'Research', nodeIds: ['agent-a'] },
        { id: 'finalize', label: 'Finalize', nodeIds: ['agent-b'] },
      ],
      artifactDefinitions: [],
    };

    const result = buildPackResult(pack, { status: 'completed' }, {
      'agent-b': { finalText: 'Final answer' },
      'agent-a': { finalText: 'Interim notes' },
    }, 'artifact');

    expect(result.outputs.result).toBe('Final answer');
  });
});
