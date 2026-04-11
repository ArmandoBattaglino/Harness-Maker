import { randomUUID } from 'crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import semver from 'semver';

export const PACK_STATUSES = ['draft', 'tested', 'published', 'deprecated', 'archived'];
export const PACK_VISIBILITIES = ['private', 'workspace'];
export const PACK_DEPENDENCY_TYPES = ['workflow', 'agent', 'skill', 'context', 'contextOverlay'];
export const KNOWLEDGE_SOURCE_TYPES = ['inline', 'overlay', 'reference'];
export const KNOWLEDGE_MERGE_STRATEGIES = ['merge', 'replace', 'append'];
export const BEHAVIOR_RULE_MODES = ['append', 'override', 'guardrail'];
export const ARTIFACT_SOURCE_TYPES = ['aggregatedArtifact', 'agentOutput', 'workflowContext'];
export const ARTIFACT_FORMATS = ['markdown', 'json', 'text'];
export const INPUT_FIELD_TYPES = ['text', 'textarea', 'enum', 'boolean', 'json', 'fileRef'];
export const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

const MAX_TEXT = 2000;
const MAX_LONG_TEXT = 16000;
const MAX_ITEMS = 50;
const ID_REGEX = /^[a-z][a-z0-9-]*$/;
const PACK_NAME_REGEX = /^[\w\s\-.]+$/;
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

export function createDefaultSchema() {
  return {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  };
}

export function normalizePackDefinition(data = {}) {
  const now = data.updatedAt ?? new Date().toISOString();
  return {
    id: data.id ?? randomUUID(),
    name: data.name ?? '',
    description: data.description ?? '',
    category: data.category ?? 'general',
    workflowId: data.workflowId ?? '',
    packVersion: data.packVersion ?? '0.1.0',
    status: data.status ?? 'draft',
    engineCompatibility: data.engineCompatibility ?? '^1.0.0',
    visibility: data.visibility ?? 'private',
    runtimePolicy: normalizeRuntimePolicy(data.runtimePolicy),
    dependencies: normalizeDependencies(data.dependencies),
    inputSchema: normalizeSchema(data.inputSchema),
    knowledgeSources: normalizeKnowledgeSources(data.knowledgeSources),
    behaviorRules: normalizeBehaviorRules(data.behaviorRules),
    outputSchema: normalizeSchema(data.outputSchema),
    artifactDefinitions: normalizeArtifactDefinitions(data.artifactDefinitions),
    visibleSteps: normalizeVisibleSteps(data.visibleSteps),
    completionCriteria: Array.isArray(data.completionCriteria)
      ? data.completionCriteria.filter((item) => typeof item === 'string' && item.trim())
      : [],
    createdAt: data.createdAt ?? now,
    updatedAt: now,
    installMetadata: data.installMetadata && typeof data.installMetadata === 'object'
      ? { ...data.installMetadata }
      : null,
  };
}

export function validatePackDefinition(data, options = {}) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['pack data must be an object'] };
  }

  validateNameField(data.name, errors, 'name');
  validateTextField(data.description, errors, 'description', { required: false, maxLength: MAX_LONG_TEXT });
  validateTextField(data.category, errors, 'category', { required: true, maxLength: 100 });
  validateTextField(data.workflowId, errors, 'workflowId', { required: options.requireWorkflowId !== false, maxLength: 200 });

  if (typeof data.name === 'string' && !PACK_NAME_REGEX.test(data.name)) {
    errors.push('name contains invalid characters');
  }

  if (typeof data.packVersion !== 'string' || !data.packVersion.trim()) {
    errors.push('packVersion is required');
  }

  if (!PACK_STATUSES.includes(data.status)) {
    errors.push(`status must be one of: ${PACK_STATUSES.join(', ')}`);
  }

  if (!PACK_VISIBILITIES.includes(data.visibility)) {
    errors.push(`visibility must be one of: ${PACK_VISIBILITIES.join(', ')}`);
  }

  if (
    typeof data.engineCompatibility !== 'string'
    || !(data.engineCompatibility.trim() === 'latest' || semver.validRange(data.engineCompatibility.trim()))
  ) {
    errors.push('engineCompatibility must be a valid semver range or "latest"');
  }

  validateRuntimePolicy(data.runtimePolicy, errors);
  validateDependencyList(data.dependencies, errors, data.workflowId);
  validateSchema(data.inputSchema, errors, 'inputSchema');
  validateSchema(data.outputSchema, errors, 'outputSchema');
  validateKnowledgeSources(data.knowledgeSources, errors);
  validateBehaviorRules(data.behaviorRules, errors);
  validateArtifactDefinitions(data.artifactDefinitions, errors);
  validateVisibleSteps(data.visibleSteps, errors, options.workflowDef);

  if (!Array.isArray(data.completionCriteria)) {
    errors.push('completionCriteria must be an array');
  } else if (data.completionCriteria.length > MAX_ITEMS) {
    errors.push(`completionCriteria must contain at most ${MAX_ITEMS} items`);
  } else {
    data.completionCriteria.forEach((item, index) => {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`completionCriteria[${index}] must be a non-empty string`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validatePackFixture(data) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['fixture must be an object'] };
  }

  validateTextField(data.name, errors, 'name', { required: true, maxLength: 120 });
  validateTextField(data.packVersion, errors, 'packVersion', { required: true, maxLength: 100 });

  if (!data.input || typeof data.input !== 'object' || Array.isArray(data.input)) {
    errors.push('input must be an object');
  }

  if (!Array.isArray(data.assertions)) {
    errors.push('assertions must be an array');
  } else if (data.assertions.length === 0) {
    errors.push('assertions must contain at least one assertion');
  } else {
    data.assertions.forEach((assertion, index) => {
      if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
        errors.push(`assertions[${index}] must be an object`);
        return;
      }
      if (!['outputIncludes', 'artifactExists', 'statusEquals'].includes(assertion.type)) {
        errors.push(`assertions[${index}].type is invalid`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validateValueAgainstSchema(schema, value, path = 'value', errors = []) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return errors;
  }
  try {
    const schemaToValidate = withDraft(schema);
    const validate = ajv.compile(schemaToValidate);
    if (!validate(value)) {
      for (const err of validate.errors ?? []) {
        const instancePath = err.instancePath ? err.instancePath.replace(/\//g, '.') : '';
        errors.push(`${path}${instancePath} ${err.message}`);
      }
    }
    return errors;
  } catch {
    // Fall back to the small local validator below when Ajv cannot compile a
    // partial in-progress schema. Pack definitions are separately validated so
    // accepted persisted schemas should normally use the Ajv path.
  }

  const expectedType = schema.type;
  if (expectedType === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path} must be an object`);
      return errors;
    }

    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}.${key} is required`);
      }
    }

    for (const [key, childValue] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}.${key} is not allowed`);
        } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          validateValueAgainstSchema(schema.additionalProperties, childValue, `${path}.${key}`, errors);
        }
        continue;
      }
      validateValueAgainstSchema(properties[key], childValue, `${path}.${key}`, errors);
    }
    return errors;
  }

  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return errors;
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateValueAgainstSchema(schema.items, item, `${path}[${index}]`, errors);
      });
    }
    return errors;
  }

  if (expectedType === 'string' && typeof value !== 'string') {
    errors.push(`${path} must be a string`);
  } else if (expectedType === 'number' && typeof value !== 'number') {
    errors.push(`${path} must be a number`);
  } else if (expectedType === 'integer' && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`);
  } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean`);
  }

  return errors;
}

export function normalizePackFixture(data = {}) {
  return {
    id: data.id ?? randomUUID(),
    name: data.name ?? '',
    packVersion: data.packVersion ?? '',
    input: data.input && typeof data.input === 'object' ? structuredCloneSafe(data.input) : {},
    assertions: Array.isArray(data.assertions) ? data.assertions.map((item) => ({ ...item })) : [],
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizePackInstall(data = {}) {
  return {
    id: data.id ?? randomUUID(),
    packId: data.packId ?? '',
    sourcePackId: data.sourcePackId ?? data.packId ?? '',
    packVersion: data.packVersion ?? '',
    installType: data.installType ?? 'local',
    provenance: data.provenance && typeof data.provenance === 'object' ? { ...data.provenance } : {},
    installedAt: data.installedAt ?? new Date().toISOString(),
    forkedFromInstallId: data.forkedFromInstallId ?? null,
  };
}

function normalizeRuntimePolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      provider: 'auto',
      allowBuilderDebug: true,
      requiresProjectBinding: true,
    };
  }
  return {
    provider: value.provider ?? 'auto',
    allowBuilderDebug: value.allowBuilderDebug !== false,
    requiresProjectBinding: value.requiresProjectBinding !== false,
    timeoutMs: value.timeoutMs ?? null,
  };
}

function normalizeDependencies(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: item?.id ?? randomUUID(),
    type: item?.type ?? 'workflow',
    targetId: item?.targetId ?? '',
    version: item?.version ?? '',
    required: item?.required !== false,
  }));
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return createDefaultSchema();
  }
  return structuredCloneSafe(schema);
}

function normalizeKnowledgeSources(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: item?.id ?? randomUUID(),
    name: item?.name ?? '',
    type: item?.type ?? 'inline',
    mergeStrategy: item?.mergeStrategy ?? 'merge',
    content: item?.content ?? {},
    ref: item?.ref ?? null,
    required: item?.required !== false,
  }));
}

function normalizeBehaviorRules(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: item?.id ?? randomUUID(),
    name: item?.name ?? '',
    instruction: item?.instruction ?? '',
    mode: item?.mode ?? 'append',
    priority: Number.isFinite(item?.priority) ? item.priority : 100,
  }));
}

function normalizeArtifactDefinitions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: item?.id ?? randomUUID(),
    name: item?.name ?? '',
      sourceType: item?.sourceType ?? 'aggregatedArtifact',
      format: item?.format ?? 'markdown',
      sourceNodeId: item?.sourceNodeId ?? null,
      required: item?.required !== false,
  }));
}

function normalizeVisibleSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: item?.id ?? randomUUID(),
    label: item?.label ?? '',
    description: item?.description ?? '',
    nodeIds: Array.isArray(item?.nodeIds) ? item.nodeIds.filter((nodeId) => typeof nodeId === 'string' && nodeId.trim()) : [],
  }));
}

function validateNameField(value, errors, field) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${field} is required`);
    return;
  }
  if (value.length > 120) {
    errors.push(`${field} must be at most 120 characters`);
  }
}

function validateTextField(value, errors, field, options = {}) {
  const { required = true, maxLength = MAX_TEXT } = options;
  if (value == null || value === '') {
    if (required) errors.push(`${field} is required`);
    return;
  }
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return;
  }
  if (value.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }
}

function validateRuntimePolicy(value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('runtimePolicy must be an object');
    return;
  }
  if (value.provider != null && !['auto', 'claude', 'codex', 'gemini'].includes(value.provider)) {
    errors.push('runtimePolicy.provider must be auto, claude, codex, or gemini');
  }
  if (value.timeoutMs != null && (!Number.isFinite(value.timeoutMs) || value.timeoutMs <= 0)) {
    errors.push('runtimePolicy.timeoutMs must be a positive number');
  }
}

function validateDependencyList(value, errors, workflowId) {
  if (!Array.isArray(value)) {
    errors.push('dependencies must be an array');
    return;
  }
  if (value.length > MAX_ITEMS) {
    errors.push(`dependencies must contain at most ${MAX_ITEMS} items`);
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`dependencies[${index}] must be an object`);
      return;
    }
    if (!PACK_DEPENDENCY_TYPES.includes(item.type)) {
      errors.push(`dependencies[${index}].type is invalid`);
    }
    validateTextField(item.targetId, errors, `dependencies[${index}].targetId`, { required: true, maxLength: 200 });
  });
  if (!value.some((item) => item?.type === 'workflow' && item?.targetId === workflowId)) {
    errors.push('dependencies must include the linked workflow dependency');
  }
}

function validateSchema(value, errors, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} must be an object`);
    return;
  }
  validateJsonSchemaNode(value, errors, field, 0);
  try {
    ajv.compile(withDraft(value));
  } catch (err) {
    errors.push(`${field} must be valid JSON Schema Draft 2020-12: ${err.message}`);
  }
}

function validateJsonSchemaNode(node, errors, field, depth) {
  if (depth > 6) {
    errors.push(`${field} exceeds maximum nesting depth`);
    return;
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push(`${field} must contain plain object schema nodes`);
    return;
  }
  if (node.type != null && !['object', 'string', 'number', 'integer', 'boolean', 'array'].includes(node.type)) {
    errors.push(`${field}.type is invalid`);
  }
  if (node.properties != null) {
    if (!node.properties || typeof node.properties !== 'object' || Array.isArray(node.properties)) {
      errors.push(`${field}.properties must be an object`);
    } else {
      Object.entries(node.properties).forEach(([key, child]) => {
        if (!key.trim()) {
          errors.push(`${field}.properties keys must be non-empty`);
          return;
        }
        validateInputFieldMetadata(child, errors, `${field}.properties.${key}`);
        validateJsonSchemaNode(child, errors, `${field}.properties.${key}`, depth + 1);
      });
    }
  }
  if (node.required != null) {
    if (!Array.isArray(node.required)) {
      errors.push(`${field}.required must be an array`);
    } else {
      node.required.forEach((item, index) => {
        if (typeof item !== 'string' || !item.trim()) {
          errors.push(`${field}.required[${index}] must be a non-empty string`);
        }
      });
    }
  }
  if (node.items != null) {
    validateJsonSchemaNode(node.items, errors, `${field}.items`, depth + 1);
  }
  if (node.additionalProperties != null && typeof node.additionalProperties !== 'boolean' && typeof node.additionalProperties !== 'object') {
    errors.push(`${field}.additionalProperties must be boolean or object`);
  }
}

function validateKnowledgeSources(value, errors) {
  if (!Array.isArray(value)) {
    errors.push('knowledgeSources must be an array');
    return;
  }
  if (value.length > MAX_ITEMS) {
    errors.push(`knowledgeSources must contain at most ${MAX_ITEMS} items`);
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`knowledgeSources[${index}] must be an object`);
      return;
    }
    validateIdLike(item.id, errors, `knowledgeSources[${index}].id`);
    validateTextField(item.name, errors, `knowledgeSources[${index}].name`, { required: true, maxLength: 120 });
    if (!KNOWLEDGE_SOURCE_TYPES.includes(item.type)) {
      errors.push(`knowledgeSources[${index}].type is invalid`);
    }
    if (!KNOWLEDGE_MERGE_STRATEGIES.includes(item.mergeStrategy)) {
      errors.push(`knowledgeSources[${index}].mergeStrategy is invalid`);
    }
  });
}

function validateBehaviorRules(value, errors) {
  if (!Array.isArray(value)) {
    errors.push('behaviorRules must be an array');
    return;
  }
  if (value.length > MAX_ITEMS) {
    errors.push(`behaviorRules must contain at most ${MAX_ITEMS} items`);
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`behaviorRules[${index}] must be an object`);
      return;
    }
    validateIdLike(item.id, errors, `behaviorRules[${index}].id`);
    validateTextField(item.name, errors, `behaviorRules[${index}].name`, { required: true, maxLength: 120 });
    validateTextField(item.instruction, errors, `behaviorRules[${index}].instruction`, { required: true, maxLength: MAX_LONG_TEXT });
    if (!BEHAVIOR_RULE_MODES.includes(item.mode)) {
      errors.push(`behaviorRules[${index}].mode is invalid`);
    }
    if (!Number.isFinite(item.priority)) {
      errors.push(`behaviorRules[${index}].priority must be a number`);
    }
  });
}

function validateArtifactDefinitions(value, errors) {
  if (!Array.isArray(value)) {
    errors.push('artifactDefinitions must be an array');
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`artifactDefinitions[${index}] must be an object`);
      return;
    }
    validateIdLike(item.id, errors, `artifactDefinitions[${index}].id`);
    validateTextField(item.name, errors, `artifactDefinitions[${index}].name`, { required: true, maxLength: 120 });
    if (!ARTIFACT_SOURCE_TYPES.includes(item.sourceType)) {
      errors.push(`artifactDefinitions[${index}].sourceType is invalid`);
    }
    if (item.format != null && !ARTIFACT_FORMATS.includes(item.format)) {
      errors.push(`artifactDefinitions[${index}].format is invalid`);
    }
  });
}

function validateVisibleSteps(value, errors, workflowDef = null) {
  const workflowNodeIds = new Set((workflowDef?.nodes ?? []).map((node) => node?.id).filter(Boolean));
  if (!Array.isArray(value)) {
    errors.push('visibleSteps must be an array');
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`visibleSteps[${index}] must be an object`);
      return;
    }
    validateIdLike(item.id, errors, `visibleSteps[${index}].id`);
    validateTextField(item.label, errors, `visibleSteps[${index}].label`, { required: true, maxLength: 120 });
    if (item.nodeIds != null && !Array.isArray(item.nodeIds)) {
      errors.push(`visibleSteps[${index}].nodeIds must be an array`);
    } else if (workflowNodeIds.size > 0) {
      for (const nodeId of item.nodeIds ?? []) {
        if (!workflowNodeIds.has(nodeId)) {
          errors.push(`visibleSteps[${index}].nodeIds contains unknown workflow node '${nodeId}'`);
        }
      }
    }
  });
}

function validateInputFieldMetadata(schemaNode, errors, field) {
  const metadata = schemaNode?.['x-packField'];
  if (metadata == null) return;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push(`${field}.x-packField must be an object`);
    return;
  }
  if (!INPUT_FIELD_TYPES.includes(metadata.fieldType)) {
    errors.push(`${field}.x-packField.fieldType is invalid`);
  }
  if (metadata.help != null && typeof metadata.help !== 'string') {
    errors.push(`${field}.x-packField.help must be a string`);
  }
}

function validateIdLike(value, errors, field) {
  if (typeof value !== 'string' || !ID_REGEX.test(value)) {
    errors.push(`${field} must match ${ID_REGEX}`);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function withDraft(schema) {
  return schema.$schema ? schema : { $schema: JSON_SCHEMA_DRAFT, ...schema };
}
