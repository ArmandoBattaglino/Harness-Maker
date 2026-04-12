const VISUAL_INPUT_NODE_TYPES = new Set(['input', 'inputBlock']);
const OUTPUT_EXTRACTOR_NODE_TYPES = new Set(['outputExtractor', 'output']);
const FIELD_TYPES = new Set(['text', 'textarea', 'number', 'integer', 'boolean', 'json', 'enum', 'image']);
const ARTIFACT_FORMATS = new Set(['markdown', 'text', 'json', 'table']);

function normalizeKey(value, fallback) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const key = raw || fallback;
  return String(key ?? 'field')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/^$/, 'field');
}

function normalizeField(field, index, inputNode) {
  const key = normalizeKey(field?.key, `${inputNode.id}_input_${index + 1}`);
  const type = FIELD_TYPES.has(field?.type) ? field.type : 'text';
  return {
    key,
    label: typeof field?.label === 'string' && field.label.trim() ? field.label.trim() : key,
    type,
    required: Boolean(field?.required),
    defaultValue: field?.defaultValue ?? '',
    helpText: typeof field?.helpText === 'string' ? field.helpText : '',
    options: type === 'enum' && Array.isArray(field?.options)
      ? field.options.filter((option) => typeof option === 'string' && option.trim()).map((option) => option.trim())
      : [],
    inputNodeId: inputNode.id,
    inputNodeLabel: inputNode.data?.label || inputNode.id,
    groupLabel: inputNode.data?.label || inputNode.id,
    groupPrompt: typeof inputNode.data?.prompt === 'string' ? inputNode.data.prompt : '',
  };
}

export function isVisualInputNode(node) {
  return VISUAL_INPUT_NODE_TYPES.has(node?.type);
}

export function isOutputExtractorNode(node) {
  return OUTPUT_EXTRACTOR_NODE_TYPES.has(node?.type);
}

export function deriveInputContractFromNodes(workflowDef = {}) {
  const fields = [];
  for (const node of workflowDef.nodes ?? []) {
    if (!isVisualInputNode(node)) continue;
    const rawFields = Array.isArray(node.data?.fields) ? node.data.fields : [];
    rawFields.forEach((field, index) => fields.push(normalizeField(field, index, node)));
  }
  return fields;
}

export function deriveOutputContractFromNodes(workflowDef = {}) {
  const legacyOutputs = Array.isArray(workflowDef.outputContract?.outputs)
    ? workflowDef.outputContract.outputs
    : [];
  const artifacts = [];
  for (const node of workflowDef.nodes ?? []) {
    if (!isOutputExtractorNode(node)) continue;
    const upstreamEdge = (workflowDef.edges ?? []).find((edge) => edge.target === node.id);
    const key = normalizeKey(node.data?.artifactKey, `${node.id}_artifact`);
    const format = ARTIFACT_FORMATS.has(node.data?.format) ? node.data.format : 'markdown';
    artifacts.push({
      key,
      label: typeof node.data?.artifactName === 'string' && node.data.artifactName.trim()
        ? node.data.artifactName.trim()
        : (node.data?.label || key),
      format,
      source: 'outputExtractor',
      sourceNodeId: upstreamEdge?.source ?? node.data?.sourceNodeId ?? '',
      outputExtractorNodeId: node.id,
      extractorNodeId: node.id,
      description: typeof node.data?.instruction === 'string'
        ? node.data.instruction
        : (typeof node.data?.extractionInstruction === 'string' ? node.data.extractionInstruction : ''),
    });
  }
  return { outputs: legacyOutputs, artifacts };
}

export function resolveEffectiveWorkflowContracts(workflowDef = {}) {
  const nodeInputs = deriveInputContractFromNodes(workflowDef);
  const nodeOutputs = deriveOutputContractFromNodes(workflowDef);
  const hasVisualInputs = nodeInputs.length > 0;
  const hasVisualOutputs = nodeOutputs.artifacts.length > 0;

  return {
    inputContract: hasVisualInputs ? nodeInputs : (workflowDef.inputContract ?? []),
    outputContract: hasVisualOutputs
      ? nodeOutputs
      : (workflowDef.outputContract ?? { outputs: [], artifacts: [] }),
    hasVisualInputs,
    hasVisualOutputs,
    source: {
      input: hasVisualInputs ? 'visualNodes' : 'legacyContract',
      artifacts: hasVisualOutputs ? 'visualNodes' : 'legacyContract',
    },
  };
}

export function hasVisualIONodes(workflowDef = {}) {
  return (workflowDef.nodes ?? []).some((node) => isVisualInputNode(node) || isOutputExtractorNode(node));
}
