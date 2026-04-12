const INPUT_KEY_RE = /^[a-z][a-z0-9_-]*$/;
const INPUT_TYPES = new Set(['text', 'textarea', 'number', 'integer', 'boolean', 'json', 'enum', 'image']);
const OUTPUT_SOURCE_TYPES = new Set(['finalText', 'workflowContext']);
const ARTIFACT_SOURCE_TYPES = new Set(['aggregatedArtifact', 'workflowContext', 'outputExtractor']);
const ARTIFACT_FORMATS = new Set(['markdown', 'text', 'json', 'table']);
const VISUAL_INPUT_NODE_TYPES = new Set(['input', 'inputBlock']);
const OUTPUT_EXTRACTOR_NODE_TYPES = new Set(['outputExtractor', 'output']);
const MAX_CONTRACT_ITEMS = 20;
const MAX_TEXT_LENGTH = 2000;
const MAX_INPUT_VALUE_LENGTH = 16000;
export const MAX_IMAGE_INPUT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function normalizeInputContract(inputContract) {
  if (!Array.isArray(inputContract)) return [];
  return inputContract.slice(0, MAX_CONTRACT_ITEMS).map((field) => {
    const normalizedType = INPUT_TYPES.has(field?.type) ? field.type : 'text';
    const key = typeof field?.key === 'string' ? field.key.trim() : '';
    const label = typeof field?.label === 'string' && field.label.trim() ? field.label.trim() : key;
    return {
      key,
      label,
      type: normalizedType,
      required: Boolean(field?.required),
      defaultValue: normalizeInputValue(normalizedType, field?.defaultValue),
      helpText: typeof field?.helpText === 'string' ? field.helpText.slice(0, MAX_TEXT_LENGTH) : '',
      options: normalizedType === 'enum'
        ? normalizeStringArray(field?.options).slice(0, MAX_CONTRACT_ITEMS)
        : [],
      ...(typeof field?.inputNodeId === 'string' ? { inputNodeId: field.inputNodeId } : {}),
      ...(typeof field?.inputNodeLabel === 'string' ? { inputNodeLabel: field.inputNodeLabel.slice(0, 120) } : {}),
    };
  });
}

export function normalizeOutputContract(outputContract) {
  const raw = outputContract && typeof outputContract === 'object' && !Array.isArray(outputContract)
    ? outputContract
    : {};

  return {
    outputs: normalizeOutputItems(raw.outputs),
    artifacts: normalizeArtifactItems(raw.artifacts),
  };
}

export function normalizeWorkflowContractFields(data = {}) {
  const effectiveContracts = deriveEffectiveWorkflowContracts(data);
  return {
    inputContract: effectiveContracts.inputContract,
    outputContract: effectiveContracts.outputContract,
  };
}

export function hasVisualInputNodes(workflowDef = {}) {
  return (workflowDef?.nodes ?? []).some((node) => VISUAL_INPUT_NODE_TYPES.has(node?.type));
}

export function hasOutputExtractorNodes(workflowDef = {}) {
  return (workflowDef?.nodes ?? []).some((node) => OUTPUT_EXTRACTOR_NODE_TYPES.has(node?.type));
}

export function deriveInputContractFromNodes(workflowDef = {}) {
  const fields = [];
  for (const node of workflowDef?.nodes ?? []) {
    if (!VISUAL_INPUT_NODE_TYPES.has(node?.type)) continue;
    const rawFields = Array.isArray(node.data?.fields) ? node.data.fields : [];
    rawFields.forEach((field, index) => {
      fields.push({
        ...field,
        key: normalizeVisualKey(field?.key, `${node.id}_input_${index + 1}`),
        inputNodeId: node.id,
        inputNodeLabel: node.data?.label || node.id,
      });
    });
  }
  return normalizeInputContract(fields);
}

export function deriveOutputContractFromNodes(workflowDef = {}) {
  const legacyOutputs = normalizeOutputContract(workflowDef.outputContract).outputs;
  const artifacts = [];
  for (const node of workflowDef?.nodes ?? []) {
    if (!OUTPUT_EXTRACTOR_NODE_TYPES.has(node?.type)) continue;
    const upstreamEdge = (workflowDef.edges ?? []).find((edge) => edge.target === node.id);
    const key = normalizeVisualKey(node.data?.artifactKey, `${node.id}_artifact`);
    artifacts.push({
      key,
      label: node.data?.artifactName || node.data?.label || key,
      format: node.data?.format || 'markdown',
      source: 'outputExtractor',
      sourceNodeId: upstreamEdge?.source ?? node.data?.sourceNodeId ?? '',
      outputExtractorNodeId: node.id,
      description: node.data?.extractionInstruction || '',
    });
  }
  return {
    outputs: legacyOutputs,
    artifacts: normalizeArtifactItems(artifacts),
  };
}

export function resolveEffectiveWorkflowContracts(workflowDef = {}) {
  const inputContract = hasVisualInputNodes(workflowDef)
    ? deriveInputContractFromNodes(workflowDef)
    : normalizeInputContract(workflowDef?.inputContract);
  const outputContract = hasOutputExtractorNodes(workflowDef)
    ? deriveOutputContractFromNodes(workflowDef)
    : normalizeOutputContract(workflowDef?.outputContract);
  return {
    inputContract,
    outputContract,
    hasVisualInputs: hasVisualInputNodes(workflowDef),
    hasVisualOutputs: hasOutputExtractorNodes(workflowDef),
  };
}

export function getConnectedWorkflowInputContract(workflowDef = {}, targetAgentId = '') {
  const effective = resolveEffectiveWorkflowContracts(workflowDef);
  if (!effective.hasVisualInputs || !targetAgentId) return effective.inputContract;
  const connectedInputNodeIds = new Set(
    (workflowDef.edges ?? [])
      .filter((edge) => edge.target === targetAgentId)
      .map((edge) => edge.source)
      .filter((sourceId) => (workflowDef.nodes ?? []).some((node) => node.id === sourceId && VISUAL_INPUT_NODE_TYPES.has(node.type)))
  );
  return effective.inputContract.filter((field) => connectedInputNodeIds.has(field.inputNodeId));
}

export function validateWorkflowContractFields(data = {}, errors = []) {
  validateInputContract(data.inputContract, errors);
  validateOutputContract(data.outputContract, errors);
  if ((data?.nodes ?? []).some((node) => node?.type === 'input' || node?.type === 'outputExtractor')) {
    const effectiveContracts = deriveEffectiveWorkflowContracts(data);
    validateInputContract(effectiveContracts.inputContract, errors);
    validateOutputContract(effectiveContracts.outputContract, errors);
  }
  return { valid: errors.length === 0, errors };
}

export function prepareWorkflowRun(workflowDef, rawInput = {}) {
  const effectiveContracts = resolveEffectiveWorkflowContracts(workflowDef);
  const inputContract = effectiveContracts.inputContract;
  const inputs = applyInputDefaults(inputContract, rawInput);
  const validationErrors = validateWorkflowInputValues(inputContract, inputs);
  if (validationErrors.length > 0) {
    const err = new Error(`Workflow input validation failed: ${validationErrors.join('; ')}`);
    err.statusCode = 400;
    err.code = 'WORKFLOW_INPUT_VALIDATION_FAILED';
    err.details = validationErrors;
    throw err;
  }

  return {
    kind: 'workflow-direct',
    inputs,
    inputContract,
    outputContract: effectiveContracts.outputContract,
    visualInputMode: effectiveContracts.hasVisualInputs,
    visualOutputMode: effectiveContracts.hasVisualOutputs,
    startedAt: new Date().toISOString(),
  };
}

export function deriveEffectiveWorkflowContracts(workflowDef = {}) {
  const legacyInputContract = normalizeInputContract(workflowDef?.inputContract);
  const legacyOutputContract = normalizeOutputContract(workflowDef?.outputContract);
  const nodes = Array.isArray(workflowDef?.nodes) ? workflowDef.nodes : [];
  const inputNodes = nodes.filter((node) => node?.type === 'input');
  const extractorNodes = nodes.filter((node) => node?.type === 'outputExtractor');

  const inputContract = inputNodes.length > 0
    ? normalizeInputContract(inputNodes.flatMap((node) => deriveInputFieldsFromNode(node)))
    : legacyInputContract;

  const derivedArtifacts = extractorNodes.map((node) => deriveArtifactFromExtractorNode(node));
  const outputContract = {
    outputs: legacyOutputContract.outputs,
    artifacts: extractorNodes.length > 0
      ? normalizeArtifactItems(derivedArtifacts)
      : legacyOutputContract.artifacts,
  };

  return {
    inputContract,
    outputContract,
    source: {
      input: inputNodes.length > 0 ? 'visualNodes' : 'legacyContract',
      artifacts: extractorNodes.length > 0 ? 'visualNodes' : 'legacyContract',
    },
  };
}

export function buildWorkflowRunContextPatch(workflowDef, workflowRun) {
  if (!workflowRun) return {};
  const baseTask = workflowDef?.description
    ? `Execute the workflow goal described here: ${workflowDef.description}`
    : `Execute the workflow "${workflowDef?.name || 'Workflow'}" with the submitted workflow inputs.`;
  const inputSummary = workflowRun.visualInputMode ? '' : summarizeInputs(workflowRun.inputs, workflowRun.inputContract);
  const outputSummary = summarizeOutputContract(workflowRun.outputContract);

  return {
    currentTask: [baseTask, inputSummary, outputSummary].filter(Boolean).join('\n\n'),
    workflowRun: {
      kind: workflowRun.kind,
      inputs: cloneJson(workflowRun.inputs),
      inputContract: cloneJson(workflowRun.inputContract),
      outputContract: cloneJson(workflowRun.outputContract),
      visualInputMode: Boolean(workflowRun.visualInputMode),
      visualOutputMode: Boolean(workflowRun.visualOutputMode),
      startedAt: workflowRun.startedAt,
    },
  };
}

export function buildWorkflowResult({
  workflowDef,
  workflowRun = null,
  workflowContext = {},
  agentOutputs = {},
  aggregatedArtifact = '',
  status = 'unknown',
} = {}) {
  const outputContract = normalizeOutputContract(
    workflowRun?.outputContract ?? resolveEffectiveWorkflowContracts(workflowDef).outputContract
  );
  const bestFinalText = resolveBestFinalText(agentOutputs);
  const outputs = {};

  for (const output of outputContract.outputs) {
    if (output.source === 'workflowContext') {
      const value = readContextValue(workflowContext, output.contextKey || output.key);
      outputs[output.key] = value ?? '';
      continue;
    }
    outputs[output.key] = bestFinalText;
  }

  const artifacts = outputContract.artifacts.map((artifact) => {
    let value = '';
    let status = 'empty';
    let provenance = null;
    if (artifact.source === 'workflowContext') {
      const contextValue = readContextValue(workflowContext, artifact.contextKey || artifact.key);
      value = stringifyArtifactValue(contextValue);
    } else if (artifact.source === 'outputExtractor') {
      value = stringifyArtifactValue(resolveAgentOutputValue(agentOutputs, artifact.sourceNodeId));
      status = value ? 'ready' : 'empty';
    } else {
      value = aggregatedArtifact || bestFinalText;
      status = value ? 'ready' : 'empty';
    }

    return {
      id: artifact.key,
      name: artifact.label,
      format: artifact.format,
      status,
      value,
      source: artifact.source,
      sourceNodeId: artifact.sourceNodeId,
      outputExtractorNodeId: artifact.outputExtractorNodeId,
    };
  });

  return {
    status,
    inputs: cloneJson(workflowRun?.inputs ?? {}),
    outputs,
    artifacts,
    outputContract,
  };
}

function deriveInputFieldsFromNode(node) {
  const nodeData = node?.data && typeof node.data === 'object' ? node.data : {};
  const nodeFields = Array.isArray(nodeData.fields) ? nodeData.fields : [];
  return nodeFields.map((field) => ({
    ...field,
    inputNodeId: node.id,
    inputNodeLabel: nodeData.label || node.id,
    groupLabel: nodeData.label || node.id,
    groupPrompt: typeof nodeData.prompt === 'string' ? nodeData.prompt : '',
  }));
}

function deriveVisualInputConnections(workflowDef, inputContract) {
  const fieldsByInputNodeId = new Map();
  for (const field of inputContract || []) {
    if (!field.inputNodeId) continue;
    const list = fieldsByInputNodeId.get(field.inputNodeId) || [];
    list.push(field.key);
    fieldsByInputNodeId.set(field.inputNodeId, list);
  }
  if (fieldsByInputNodeId.size === 0) return {};

  const connections = {};
  for (const edge of workflowDef?.edges || []) {
    if (!fieldsByInputNodeId.has(edge?.source) || !edge?.target) continue;
    connections[edge.target] = [
      ...(connections[edge.target] || []),
      ...fieldsByInputNodeId.get(edge.source),
    ];
  }
  return connections;
}

function deriveArtifactFromExtractorNode(node) {
  const data = node?.data && typeof node.data === 'object' ? node.data : {};
  const artifactKey = typeof data.artifactKey === 'string' && data.artifactKey.trim()
    ? data.artifactKey.trim()
    : node?.id || '';
  return {
    key: artifactKey,
    label: typeof data.artifactName === 'string' && data.artifactName.trim()
      ? data.artifactName.trim()
      : (data.label || artifactKey),
    format: data.format,
    source: 'outputExtractor',
    contextKey: artifactKey,
    description: typeof data.instruction === 'string' ? data.instruction : '',
    extractorNodeId: node?.id || '',
    sourcePolicy: ['firstIncoming', 'allIncoming', 'selected'].includes(data.sourcePolicy)
      ? data.sourcePolicy
      : 'allIncoming',
    selectedSourceNodeIds: Array.isArray(data.selectedSourceNodeIds)
      ? data.selectedSourceNodeIds.filter((id) => typeof id === 'string' && id.trim())
      : [],
  };
}

function normalizeOutputItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_CONTRACT_ITEMS).map((item) => {
    const key = typeof item?.key === 'string' ? item.key.trim() : '';
    return {
      key,
      label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : key,
      source: OUTPUT_SOURCE_TYPES.has(item?.source) ? item.source : 'finalText',
      contextKey: typeof item?.contextKey === 'string' ? item.contextKey.trim() : key,
      description: typeof item?.description === 'string' ? item.description.slice(0, MAX_TEXT_LENGTH) : '',
    };
  });
}

function normalizeArtifactItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_CONTRACT_ITEMS).map((item) => {
    const key = typeof item?.key === 'string' ? item.key.trim() : '';
    return {
      key,
      label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : key,
      format: ARTIFACT_FORMATS.has(item?.format) ? item.format : 'markdown',
      source: ARTIFACT_SOURCE_TYPES.has(item?.source) ? item.source : 'aggregatedArtifact',
      contextKey: typeof item?.contextKey === 'string' ? item.contextKey.trim() : key,
      description: typeof item?.description === 'string' ? item.description.slice(0, MAX_TEXT_LENGTH) : '',
      ...(typeof item?.sourceNodeId === 'string' ? { sourceNodeId: item.sourceNodeId.trim() } : {}),
      ...(typeof item?.outputExtractorNodeId === 'string' ? { outputExtractorNodeId: item.outputExtractorNodeId.trim() } : {}),
    };
  });
}

function validateInputContract(inputContract, errors) {
  if (inputContract == null) return;
  if (!Array.isArray(inputContract)) {
    errors.push('inputContract must be an array');
    return;
  }
  if (inputContract.length > MAX_CONTRACT_ITEMS) {
    errors.push(`inputContract must contain at most ${MAX_CONTRACT_ITEMS} items`);
  }

  const keys = new Set();
  inputContract.forEach((field, index) => {
    const path = `inputContract[${index}]`;
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      errors.push(`${path} must be an object`);
      return;
    }
    validateKey(field.key, errors, `${path}.key`);
    if (typeof field.key === 'string') {
      if (keys.has(field.key)) errors.push(`${path}.key must be unique`);
      keys.add(field.key);
    }
    if (!INPUT_TYPES.has(field.type)) {
      errors.push(`${path}.type must be one of: ${Array.from(INPUT_TYPES).join(', ')}`);
    }
    validateOptionalText(field.label, errors, `${path}.label`, 120);
    validateOptionalText(field.helpText, errors, `${path}.helpText`, MAX_TEXT_LENGTH);
    if (field.required != null && typeof field.required !== 'boolean') {
      errors.push(`${path}.required must be a boolean`);
    }
    if (field.type === 'enum') {
      const options = normalizeStringArray(field.options);
      if (options.length === 0) {
        errors.push(`${path}.options must contain at least one option for enum inputs`);
      }
    }
  });
}

function validateOutputContract(outputContract, errors) {
  if (outputContract == null) return;
  if (!outputContract || typeof outputContract !== 'object' || Array.isArray(outputContract)) {
    errors.push('outputContract must be an object');
    return;
  }
  validateOutputList(outputContract.outputs, errors, 'outputContract.outputs', OUTPUT_SOURCE_TYPES);
  validateOutputList(outputContract.artifacts, errors, 'outputContract.artifacts', ARTIFACT_SOURCE_TYPES, true);
}

function validateOutputList(items, errors, path, sourceTypes, isArtifact = false) {
  if (items == null) return;
  if (!Array.isArray(items)) {
    errors.push(`${path} must be an array`);
    return;
  }
  if (items.length > MAX_CONTRACT_ITEMS) {
    errors.push(`${path} must contain at most ${MAX_CONTRACT_ITEMS} items`);
  }
  const keys = new Set();
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${itemPath} must be an object`);
      return;
    }
    validateKey(item.key, errors, `${itemPath}.key`);
    if (typeof item.key === 'string') {
      if (keys.has(item.key)) errors.push(`${itemPath}.key must be unique`);
      keys.add(item.key);
    }
    validateOptionalText(item.label, errors, `${itemPath}.label`, 120);
    validateOptionalText(item.description, errors, `${itemPath}.description`, MAX_TEXT_LENGTH);
    if (item.source != null && !sourceTypes.has(item.source)) {
      errors.push(`${itemPath}.source must be one of: ${Array.from(sourceTypes).join(', ')}`);
    }
    if (isArtifact && item.format != null && !ARTIFACT_FORMATS.has(item.format)) {
      errors.push(`${itemPath}.format must be one of: ${Array.from(ARTIFACT_FORMATS).join(', ')}`);
    }
  });
}

function applyInputDefaults(inputContract, rawInput) {
  const source = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? rawInput : {};
  const inputs = {};
  for (const field of inputContract) {
    if (Object.prototype.hasOwnProperty.call(source, field.key)) {
      inputs[field.key] = normalizeInputValue(field.type, source[field.key]);
    } else if (field.defaultValue !== undefined && field.defaultValue !== '') {
      inputs[field.key] = field.defaultValue;
    } else if (field.type === 'boolean') {
      inputs[field.key] = false;
    } else {
      inputs[field.key] = '';
    }
  }
  return inputs;
}

function validateWorkflowInputValues(inputContract, inputs) {
  const errors = [];
  for (const field of inputContract) {
    const value = inputs[field.key];
    const empty = value === '' || value === null || value === undefined;
    if (field.required && empty) {
      errors.push(`${field.key} is required`);
      continue;
    }
    if (empty) continue;
    validateInputType(field, value, errors);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (serialized && serialized.length > MAX_INPUT_VALUE_LENGTH) {
      errors.push(`${field.key} exceeds ${MAX_INPUT_VALUE_LENGTH} characters`);
    }
  }
  return errors;
}

function validateInputType(field, value, errors) {
    if ((field.type === 'text' || field.type === 'textarea' || field.type === 'markdown') && typeof value !== 'string') {
      errors.push(`${field.key} must be a string`);
  } else if (field.type === 'number' && typeof value !== 'number') {
    errors.push(`${field.key} must be a number`);
  } else if (field.type === 'integer' && !Number.isInteger(value)) {
    errors.push(`${field.key} must be an integer`);
  } else if (field.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${field.key} must be a boolean`);
  } else if (field.type === 'enum' && !field.options.includes(value)) {
    errors.push(`${field.key} must be one of: ${field.options.join(', ')}`);
  } else if (field.type === 'json' && typeof value === 'string') {
    errors.push(`${field.key} must be valid parsed JSON, not a raw string`);
  } else if (field.type === 'image') {
    validateImageInputValue(field, value, errors);
  }
}

function normalizeInputValue(type, value) {
  if (type === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (type === 'integer') {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : value;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  }
  if (type === 'json' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (type === 'image') {
    return normalizeImageInputValue(value);
  }
  return value == null ? '' : value;
}

function normalizeImageInputValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value == null ? '' : value;
  const normalized = {
    kind: 'run-image',
    name: typeof value.name === 'string' ? value.name.slice(0, 240) : '',
    type: typeof value.type === 'string' ? value.type.slice(0, 120) : '',
    size: Number.isFinite(Number(value.size)) ? Number(value.size) : 0,
    lastModified: Number.isFinite(Number(value.lastModified)) ? Number(value.lastModified) : undefined,
    assetId: typeof value.assetId === 'string' ? value.assetId.slice(0, 160) : undefined,
  };
  for (const forbiddenKey of ['data', 'base64', 'path', 'absolutePath']) {
    if (Object.prototype.hasOwnProperty.call(value, forbiddenKey)) {
      normalized[forbiddenKey] = value[forbiddenKey];
    }
  }
  return normalized;
}

function validateImageInputValue(field, value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field.key} must be an image metadata object`);
    return;
  }
  if (value.kind !== 'run-image') {
    errors.push(`${field.key} image metadata kind is invalid`);
  }
  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    errors.push(`${field.key} must be PNG, JPEG, WebP, or GIF`);
  }
  if (!Number.isFinite(Number(value.size)) || Number(value.size) <= 0) {
    errors.push(`${field.key} image size is invalid`);
  } else if (Number(value.size) > MAX_IMAGE_INPUT_BYTES) {
    errors.push(`${field.key} image exceeds ${MAX_IMAGE_INPUT_BYTES} bytes`);
  }
  for (const forbiddenKey of ['data', 'base64', 'path', 'absolutePath']) {
    if (Object.prototype.hasOwnProperty.call(value, forbiddenKey)) {
      errors.push(`${field.key} image metadata must not include ${forbiddenKey}`);
    }
  }
}

function summarizeInputs(inputs, inputContract) {
  const rows = inputContract
    .map((field) => `- ${field.label || field.key} (${field.key}): ${stringifyForPrompt(inputs[field.key])}`)
    .join('\n');
  return rows ? `Workflow inputs:\n${rows}` : '';
}

function summarizeOutputContract(outputContract) {
  const outputs = outputContract.outputs.map((item) => item.label || item.key);
  const artifacts = outputContract.artifacts.map((item) => `${item.label || item.key} (${item.format})`);
  const lines = [];
  if (outputs.length) lines.push(`Expected workflow outputs: ${outputs.join(', ')}.`);
  if (artifacts.length) lines.push(`Expected workflow artifacts: ${artifacts.join(', ')}.`);
  return lines.join('\n');
}

function resolveBestFinalText(agentOutputs) {
  const entries = Object.values(agentOutputs ?? {})
    .filter((agent) => typeof agent?.finalText === 'string' && agent.finalText.trim())
    .sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());
  return entries[0]?.finalText ?? '';
}

function readContextValue(context, keyPath) {
  if (!keyPath || !context || typeof context !== 'object') return undefined;
  return String(keyPath).split('.').reduce((current, key) => (
    current && typeof current === 'object' ? current[key] : undefined
  ), context);
}

function stringifyArtifactValue(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function resolveAgentOutputValue(agentOutputs, sourceNodeId) {
  if (!sourceNodeId) return '';
  const output = agentOutputs?.[sourceNodeId];
  if (!output) return '';
  return output.finalText || output.lastOutputSnippet || '';
}

function normalizeVisualKey(value, fallback) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const key = raw || fallback;
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/^$/, 'field');
}

function stringifyForPrompt(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.assetId && value.mimeType) {
    return JSON.stringify({
      assetId: value.assetId,
      name: value.name,
      mimeType: value.mimeType,
      size: value.size,
      previewUrl: value.previewUrl,
      note: 'Image content is attached by reference; raw base64 is not injected.',
    });
  }
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (!raw) return '(empty)';
  return raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;
}

function resolveOutputExtractorArtifact({ artifact, workflowDef = {}, agentOutputs = {} }) {
  const extractorNodeId = artifact.extractorNodeId;
  const workflowEdges = Array.isArray(workflowDef?.edges) ? workflowDef.edges : [];
  const incomingSourceIds = workflowEdges
    .filter((edge) => edge?.target === extractorNodeId)
    .map((edge) => edge.source)
    .filter(Boolean);
  const policy = artifact.sourcePolicy || 'allIncoming';
  const sourceNodeIds = policy === 'selected'
    ? (artifact.selectedSourceNodeIds || []).filter((id) => incomingSourceIds.includes(id))
    : policy === 'firstIncoming'
      ? incomingSourceIds.slice(0, 1)
      : incomingSourceIds;

  const values = sourceNodeIds
    .map((sourceNodeId) => {
      const output = agentOutputs?.[sourceNodeId];
      const value = typeof output?.finalText === 'string' ? output.finalText.trim() : '';
      return value ? { sourceNodeId, value } : null;
    })
    .filter(Boolean);

  const provenance = {
    extractorNodeId,
    sourceNodeIds,
    sourcePolicy: policy,
  };

  if (values.length === 0) {
    return { value: '', status: 'empty', provenance };
  }

  if (values.length === 1) {
    return { value: values[0].value, status: 'ready', provenance };
  }

  return {
    value: values.map((entry) => `## ${entry.sourceNodeId}\n\n${entry.value}`).join('\n\n'),
    status: 'ready',
    provenance,
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateKey(value, errors, field) {
  if (typeof value !== 'string' || !INPUT_KEY_RE.test(value)) {
    errors.push(`${field} must match ${INPUT_KEY_RE}`);
  }
}

function validateOptionalText(value, errors, field, maxLength) {
  if (value == null) return;
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
  } else if (value.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
