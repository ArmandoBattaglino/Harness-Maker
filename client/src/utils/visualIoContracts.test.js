import { describe, expect, it } from 'vitest';
import {
  buildDefaultInputNodeData,
  buildDefaultOutputExtractorNodeData,
  CANONICAL_VISUAL_INPUT_NODE_TYPE,
  deriveEffectiveWorkflowContracts,
  normalizeVisualInputNodeType,
} from './visualIoContracts.js';

describe('visual I/O contract derivation', () => {
  it('uses visual Input nodes and Output Extractors before stale legacy contracts', () => {
    const effective = deriveEffectiveWorkflowContracts({
      inputContract: [{ key: 'stale', label: 'Stale', type: 'text' }],
      outputContract: {
        outputs: [{ key: 'summary', label: 'Summary' }],
        artifacts: [{ key: 'stale-report', label: 'Stale report' }],
      },
      nodes: [
        {
          id: 'input-1',
          type: CANONICAL_VISUAL_INPUT_NODE_TYPE,
          data: {
            label: 'Client Brief',
            prompt: 'Provide text and image.',
            fields: [
              { key: 'brief', label: 'Brief', type: 'textarea', required: true },
              { key: 'reference_image', label: 'Reference image', type: 'image' },
            ],
          },
        },
        {
          id: 'extractor-1',
          type: 'outputExtractor',
          data: {
            artifactKey: 'final-report',
            artifactName: 'Final report',
            format: 'table',
            sourcePolicy: 'allIncoming',
          },
        },
      ],
    });

    expect(effective.source).toEqual({ input: 'visualNodes', artifacts: 'visualNodes' });
    expect(effective.inputContract.map((field) => field.key)).toEqual(['brief', 'reference_image']);
    expect(effective.inputContract[0]).toEqual(expect.objectContaining({
      inputNodeId: 'input-1',
      groupLabel: 'Client Brief',
      groupPrompt: 'Provide text and image.',
    }));
    expect(effective.outputContract.outputs[0].key).toBe('summary');
    expect(effective.outputContract.artifacts[0]).toEqual(expect.objectContaining({
      key: 'final-report',
      format: 'table',
      source: 'outputExtractor',
      extractorNodeId: 'extractor-1',
    }));
  });

  it('keeps legacy contracts when no visual I/O nodes exist and exposes safe defaults', () => {
    const effective = deriveEffectiveWorkflowContracts({
      inputContract: [{ key: 'brief', label: 'Brief', type: 'textarea' }],
      outputContract: { artifacts: [{ key: 'report', label: 'Report' }] },
      nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A' } }],
    });

    expect(effective.source).toEqual({ input: 'legacyContract', artifacts: 'legacyContract' });
    expect(effective.inputContract[0].key).toBe('brief');
    expect(buildDefaultInputNodeData().fields[0].type).toBe('textarea');
    expect(buildDefaultOutputExtractorNodeData().format).toBe('markdown');
  });

  it('normalizes legacy input aliases to the canonical visual input type', () => {
    expect(normalizeVisualInputNodeType('input')).toBe(CANONICAL_VISUAL_INPUT_NODE_TYPE);
    expect(normalizeVisualInputNodeType('inputBlock')).toBe(CANONICAL_VISUAL_INPUT_NODE_TYPE);
  });
});
