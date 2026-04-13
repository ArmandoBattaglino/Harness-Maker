export function buildDefaultInputNodeData() {
  return {
    label: 'Workflow Input',
    description: 'Collect operator input when the workflow starts.',
    prompt: 'Provide the workflow input.',
    submitMode: 'runStart',
    outputFormat: 'json',
    fields: [
      {
        id: 'field-brief',
        key: 'brief',
        label: 'Brief',
        type: 'textarea',
        required: true,
        defaultValue: '',
        helpText: 'Paste the brief or starting context.',
        options: [],
      },
    ],
  };
}

export function buildDefaultOutputExtractorNodeData() {
  return {
    label: 'Final Report',
    artifactKey: 'final-report',
    artifactName: 'Final report',
    format: 'markdown',
    instruction: 'Extract the final report from the upstream agent output.',
    sourcePolicy: 'allIncoming',
    selectedSourceNodeIds: [],
  };
}

export {
  CANONICAL_VISUAL_INPUT_NODE_TYPE,
  LEGACY_VISUAL_INPUT_NODE_TYPES,
  VISUAL_INPUT_NODE_TYPES,
  isVisualInputNode,
  isVisualInputNodeType,
  normalizeVisualInputNodeType,
  normalizeVisualWorkflowNode,
  resolveEffectiveWorkflowContracts,
  resolveEffectiveWorkflowContracts as deriveEffectiveWorkflowContracts,
  deriveInputContractFromNodes,
  deriveOutputContractFromNodes,
  hasVisualIONodes,
} from './visualWorkflowContracts.js';
