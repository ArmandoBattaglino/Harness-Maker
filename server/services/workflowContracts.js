const INPUT_KEY_RE = /^[a-z][a-z0-9_-]*$/;
const INPUT_TYPES = new Set(['text', 'textarea', 'number', 'integer', 'boolean', 'json', 'enum']);
const OUTPUT_SOURCE_TYPES = new Set(['finalText', 'workflowContext']);
const ARTIFACT_SOURCE_TYPES = new Set(['aggregatedArtifact', 'workflowContext']);
const ARTIFACT_FORMATS = new Set(['markdown', 'text', 'json']);
const MAX_CONTRACT_ITEMS = 20;
const MAX_TEXT_LENGTH = 2000;
const MAX_INPUT_VALUE_LENGTH = 16000;

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
  return {
    inputContract: normalizeInputContract(data.inputContract),
    outputContract: normalizeOutputContract(data.outputContract),
  };
}

export function validateWorkflowContractFields(data = {}, errors = []) {
  validateInputContract(data.inputContract, errors);
  validateOutputContract(data.outputContract, errors);
  return { valid: errors.length === 0, errors };
}

export function prepareWorkflowRun(workflowDef, rawInput = {}) {
  const inputContract = normalizeInputContract(workflowDef?.inputContract);
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
    outputContract: normalizeOutputContract(workflowDef?.outputContract),
    startedAt: new Date().toISOString(),
  };
}

export function buildWorkflowRunContextPatch(workflowDef, workflowRun) {
  if (!workflowRun) return {};
  const baseTask = workflowDef?.description
    ? `Execute the workflow goal described here: ${workflowDef.description}`
    : `Execute the workflow "${workflowDef?.name || 'Workflow'}" with the submitted workflow inputs.`;
  const inputSummary = summarizeInputs(workflowRun.inputs, workflowRun.inputContract);
  const outputSummary = summarizeOutputContract(workflowRun.outputContract);

  return {
    currentTask: [baseTask, inputSummary, outputSummary].filter(Boolean).join('\n\n'),
    workflowRun: {
      kind: workflowRun.kind,
      inputs: cloneJson(workflowRun.inputs),
      inputContract: cloneJson(workflowRun.inputContract),
      outputContract: cloneJson(workflowRun.outputContract),
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
    workflowRun?.outputContract ?? workflowDef?.outputContract
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
    if (artifact.source === 'workflowContext') {
      const contextValue = readContextValue(workflowContext, artifact.contextKey || artifact.key);
      value = stringifyArtifactValue(contextValue);
    } else {
      value = aggregatedArtifact || bestFinalText;
    }

    return {
      id: artifact.key,
      name: artifact.label,
      format: artifact.format,
      status: value ? 'ready' : 'empty',
      value,
      source: artifact.source,
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
  if ((field.type === 'text' || field.type === 'textarea') && typeof value !== 'string') {
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
  return value == null ? '' : value;
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

function stringifyForPrompt(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (!raw) return '(empty)';
  return raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;
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
