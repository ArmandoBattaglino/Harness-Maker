import { describe, expect, it } from 'vitest';
import {
  CANONICAL_VISUAL_INPUT_NODE_TYPE,
  deriveInputContractFromNodes,
  normalizeVisualInputNodeType,
  resolveEffectiveWorkflowContracts,
} from './visualWorkflowContracts.js';

describe('visualWorkflowContracts client derivation helpers', () => {
  it('derives visual input fields and extractor artifacts while preserving legacy fallback', () => {
    const legacyWorkflow = {
      inputContract: [{ key: 'legacy', label: 'Legacy', type: 'text', required: true }],
      outputContract: { outputs: [{ key: 'result', label: 'Result' }], artifacts: [] },
      nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A' } }],
      edges: [],
    };

    expect(resolveEffectiveWorkflowContracts(legacyWorkflow).inputContract).toEqual(legacyWorkflow.inputContract);

    const visualWorkflow = {
      ...legacyWorkflow,
      nodes: [
        {
          id: 'input-a',
          type: CANONICAL_VISUAL_INPUT_NODE_TYPE,
          data: {
            label: 'Creative intake',
            fields: [
              { key: 'brief', label: 'Brief', type: 'textarea', required: true },
              { key: 'reference_image', label: 'Reference image', type: 'image', required: false },
            ],
          },
        },
        { id: 'agent-a', type: 'agent', data: { label: 'Agent A' } },
        { id: 'extract-a', type: 'outputExtractor', data: { artifactKey: 'report', artifactName: 'Report', format: 'table' } },
      ],
      edges: [
        { id: 'e1', source: 'input-a', target: 'agent-a' },
        { id: 'e2', source: 'agent-a', target: 'extract-a' },
      ],
    };

    expect(deriveInputContractFromNodes(visualWorkflow)).toEqual([
      expect.objectContaining({ key: 'brief', type: 'textarea', inputNodeId: 'input-a', inputNodeLabel: 'Creative intake' }),
      expect.objectContaining({ key: 'reference_image', type: 'image', inputNodeId: 'input-a' }),
    ]);
    expect(resolveEffectiveWorkflowContracts(visualWorkflow).outputContract.artifacts).toEqual([
      expect.objectContaining({ key: 'report', source: 'outputExtractor', sourceNodeId: 'agent-a', format: 'table' }),
    ]);
  });

  it('keeps legacy input aliases readable while writing the canonical type', () => {
    expect(normalizeVisualInputNodeType('input')).toBe(CANONICAL_VISUAL_INPUT_NODE_TYPE);
    expect(normalizeVisualInputNodeType('inputBlock')).toBe(CANONICAL_VISUAL_INPUT_NODE_TYPE);
    expect(normalizeVisualInputNodeType(CANONICAL_VISUAL_INPUT_NODE_TYPE)).toBe(CANONICAL_VISUAL_INPUT_NODE_TYPE);

    const legacyWorkflow = {
      nodes: [
        {
          id: 'legacy-input',
          type: 'input',
          data: {
            label: 'Legacy intake',
            fields: [{ key: 'brief', label: 'Brief', type: 'text', required: true }],
          },
        },
      ],
      edges: [],
    };

    expect(deriveInputContractFromNodes(legacyWorkflow)).toEqual([
      expect.objectContaining({
        key: 'brief',
        inputNodeId: 'legacy-input',
        inputNodeLabel: 'Legacy intake',
      }),
    ]);
  });
});
