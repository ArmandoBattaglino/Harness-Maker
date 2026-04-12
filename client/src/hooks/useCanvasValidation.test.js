import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCanvasValidation } from './useCanvasValidation.js';

describe('useCanvasValidation visual I/O semantics', () => {
  it('treats Input -> Agent as valid start-agent input and rejects invalid extractor edges', () => {
    const nodes = [
      {
        id: 'input-1',
        type: 'input',
        data: {
          label: 'Client Input',
          fields: [{ key: 'brief', label: 'Brief', type: 'textarea' }],
        },
      },
      { id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Work.' } },
      {
        id: 'extractor-1',
        type: 'outputExtractor',
        data: {
          label: 'Extractor',
          artifactKey: 'final-report',
          artifactName: 'Final report',
          format: 'markdown',
        },
      },
      { id: 'agent-b', type: 'agent', data: { label: 'Agent B', systemPrompt: 'Work.' } },
    ];
    const edges = [
      { id: 'edge-input-agent', source: 'input-1', target: 'agent-a' },
      { id: 'edge-agent-extractor', source: 'agent-a', target: 'extractor-1' },
      { id: 'edge-invalid', source: 'extractor-1', target: 'agent-b' },
    ];

    const { result } = renderHook(() => useCanvasValidation(nodes, edges));

    expect(result.current.issues.map((issue) => issue.id)).not.toContain('workflow:no-start-node');
    expect(result.current.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'edge:edge-invalid:invalid-visual-io',
        severity: 'error',
      }),
    ]));
  });

  it('flags incomplete Input and Output Extractor configuration', () => {
    const { result } = renderHook(() => useCanvasValidation([
      { id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Work.' } },
      { id: 'input-1', type: 'input', data: { label: 'Broken Input', fields: [] } },
      { id: 'extractor-1', type: 'outputExtractor', data: { label: 'Broken Extractor' } },
    ], []));

    expect(result.current.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'input:input-1:no-fields' }),
      expect.objectContaining({ id: 'outputExtractor:extractor-1:missing-artifact-config' }),
      expect.objectContaining({ id: 'outputExtractor:extractor-1:no-agent-source' }),
    ]));
  });
});
