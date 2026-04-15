import {
  buildWorkflowRunContextPatch,
  getConnectedWorkflowInputContract,
  prepareWorkflowRun,
  resolveEffectiveWorkflowContracts,
  validateWorkflowContractFields,
} from './workflowContracts.js';
import {
  getDefaultRuntimeModel,
  getSupportedRuntimeModels,
  isSupportedRuntimeModel,
} from './SwarmEngine.js';

export const CONTRACT_RESOLVER_VERSION = 'progressive-harness-v1';

const PROVIDERS = ['claude', 'codex', 'gemini'];
const RUNTIME_PROVIDER_VALUES = new Set(['auto', ...PROVIDERS]);
const CLAUDE_TOOL_SUPPORT = 'enforced';
const ADVISORY = 'advisory';
const UNSUPPORTED = 'unsupported';

export function buildCapabilityMatrix(runtimeSnapshot = null) {
  const availability = runtimeSnapshot?.availability ?? {};
  return PROVIDERS.reduce((matrix, provider) => {
    const models = runtimeSnapshot?.providers?.[provider] ?? getSupportedRuntimeModels(provider);
    matrix[provider] = {
      provider,
      available: Boolean(availability[provider] ?? true),
      defaultModel: runtimeSnapshot?.defaults?.[provider] ?? getDefaultRuntimeModel(provider),
      models,
      controls: {
        tools: provider === 'claude' ? CLAUDE_TOOL_SUPPORT : UNSUPPORTED,
        skillHints: ADVISORY,
        contextSources: ADVISORY,
        memorySources: ADVISORY,
        expectedOutputContract: ADVISORY,
        guardrails: ADVISORY,
        handoffPolicy: ADVISORY,
        errorRetryPolicy: ADVISORY,
        imageInputs: provider === 'claude' ? ADVISORY : UNSUPPORTED,
        streamJson: provider === 'claude' ? CLAUDE_TOOL_SUPPORT : UNSUPPORTED,
        codexSdk: provider === 'codex' ? CLAUDE_TOOL_SUPPORT : UNSUPPORTED,
      },
    };
    return matrix;
  }, {});
}

export function compileExecutionContract({
  workflowDef,
  workflowInput = undefined,
  pack = null,
  packInput = undefined,
  runtimeProvider = 'auto',
  runtimeModels = {},
  runtimeSnapshot = null,
  selectedAgentId = null,
} = {}) {
  const normalizedWorkflow = normalizeWorkflow(workflowDef);
  const errors = [];
  const warnings = [];
  const info = [];
  if (!normalizedWorkflow) {
    return buildFailure('workflowDef is required and must be an object');
  }

  const contractErrors = [];
  validateWorkflowContractFields(normalizedWorkflow, contractErrors);
  contractErrors.forEach((message) => errors.push(makeIssue('workflow_contract_invalid', message, 'workflow')));

  const effectiveContracts = resolveEffectiveWorkflowContracts(normalizedWorkflow);
  const startNodeIds = findStartNodeIds(normalizedWorkflow);
  const agentNodes = (normalizedWorkflow.nodes ?? []).filter(isAgentNode);

  if (agentNodes.length === 0) {
    errors.push(makeIssue('workflow_requires_agent', 'Workflow must include at least one agent node.', 'workflow'));
  }

  const requestedProvider = normalizeProvider(runtimeProvider);
  if (!RUNTIME_PROVIDER_VALUES.has(requestedProvider)) {
    errors.push(makeIssue('runtime_provider_invalid', `runtimeProvider must be one of: ${Array.from(RUNTIME_PROVIDER_VALUES).join(', ')}`, 'runtime'));
  }

  const capabilityMatrix = buildCapabilityMatrix(runtimeSnapshot);
  const normalizedRuntimeModels = normalizeRuntimeModels(runtimeModels);
  for (const [provider, model] of Object.entries(normalizedRuntimeModels)) {
    if (!isSupportedRuntimeModel(provider, model)) {
      errors.push(makeIssue(
        'runtime_model_unsupported',
        `Unsupported ${provider} model '${model}'. Supported models: ${getSupportedRuntimeModels(provider).join(', ')}`,
        'runtime',
        { provider, model }
      ));
    }
  }

  let packResolution = null;
  if (pack) {
    try {
      packResolution = resolvePackPreview(pack, packInput ?? {});
      info.push(makeIssue('pack_overlay_applied', `Pack overlay '${pack.name || pack.id}' contributes runtime policy, input schema, artifacts, and visible steps.`, 'pack'));
    } catch (error) {
      errors.push(makeIssue('pack_resolution_failed', error.message, 'pack'));
    }
  }
  const packRuntimeProvider = normalizeProvider(packResolution?.packMetadata?.runtimePolicy?.provider);
  const effectiveRuntimeProvider = requestedProvider === 'auto'
    && packRuntimeProvider
    && packRuntimeProvider !== 'auto'
    ? packRuntimeProvider
    : requestedProvider;

  let workflowRun = null;
  let workflowContextPatch = null;
  if (workflowInput !== undefined) {
    try {
      workflowRun = prepareWorkflowRun(normalizedWorkflow, workflowInput);
      workflowContextPatch = buildWorkflowRunContextPatch(normalizedWorkflow, workflowRun);
    } catch (error) {
      errors.push(makeIssue(error.code || 'workflow_input_invalid', error.message, 'workflowInput', {
        details: Array.isArray(error.details) ? error.details : [],
      }));
    }
  }

  const visualInputConnections = deriveVisualInputConnections(normalizedWorkflow, effectiveContracts.inputContract);
  const agents = agentNodes.map((node) => compileAgent({
    node,
    workflowDef: normalizedWorkflow,
    requestedProvider: effectiveRuntimeProvider,
    runtimeModels: normalizedRuntimeModels,
    capabilityMatrix,
    effectiveContracts,
    visualInputConnections,
    warnings,
  }));

  const compiled = {
    version: CONTRACT_RESOLVER_VERSION,
    ok: errors.length === 0,
    status: errors.length === 0 ? 'preview_ready' : 'invalid',
    errors,
    warnings,
    info,
    selectedAgentId: selectedAgentId || agents[0]?.id || null,
    domains: {
      workflow: buildWorkflowDomain(normalizedWorkflow, effectiveContracts, startNodeIds),
      agents,
      harness: buildHarnessDomain(pack, packResolution),
      compiledExecution: {
        derivedOnly: true,
        agentCount: agents.length,
        edgeCount: (normalizedWorkflow.edges ?? []).length,
        startNodeIds,
        visualInputConnections,
        runtimeProvider: effectiveRuntimeProvider,
        requestedRuntimeProvider: requestedProvider,
        runtimeModels: normalizedRuntimeModels,
      },
    },
    precedence: buildPrecedenceMatrix(effectiveContracts, Boolean(pack)),
    capabilities: {
      requestedProvider,
      effectiveProvider: effectiveRuntimeProvider,
      runtimeModels: normalizedRuntimeModels,
      matrix: capabilityMatrix,
      selected: summarizeSelectedCapabilities(agents),
    },
    io: {
      inputContract: effectiveContracts.inputContract,
      outputContract: effectiveContracts.outputContract,
      source: effectiveContracts.source ?? {},
      visualInputConnections,
    },
    workflowRun,
    workflowContextPatch,
    packContextPatch: packResolution?.workflowContextPatch ?? null,
    observability: buildObservabilitySummary(agents, effectiveContracts, packResolution),
  };

  return compiled;
}

function normalizeWorkflow(workflowDef) {
  if (!workflowDef || typeof workflowDef !== 'object' || Array.isArray(workflowDef)) return null;
  return {
    ...workflowDef,
    nodes: Array.isArray(workflowDef.nodes) ? workflowDef.nodes : [],
    edges: Array.isArray(workflowDef.edges) ? workflowDef.edges : [],
    settings: workflowDef.settings && typeof workflowDef.settings === 'object' ? workflowDef.settings : {},
    initialContext: workflowDef.initialContext && typeof workflowDef.initialContext === 'object' ? workflowDef.initialContext : {},
  };
}

function normalizeProvider(provider) {
  return typeof provider === 'string' && provider.trim() ? provider.trim().toLowerCase() : 'auto';
}

function normalizeRuntimeModels(runtimeModels) {
  if (!runtimeModels || typeof runtimeModels !== 'object' || Array.isArray(runtimeModels)) return {};
  return Object.fromEntries(Object.entries(runtimeModels).filter(([provider, model]) => (
    PROVIDERS.includes(provider) && typeof model === 'string' && model.trim()
  )).map(([provider, model]) => [provider, model.trim()]));
}

function compileAgent({ node, workflowDef, requestedProvider, runtimeModels, capabilityMatrix, effectiveContracts, visualInputConnections, warnings }) {
  const data = node.data && typeof node.data === 'object' ? node.data : {};
  const provider = resolveAgentProvider(data.model, requestedProvider);
  const model = resolveAgentModel(provider, data.model, runtimeModels);
  const capability = capabilityMatrix[provider] ?? null;
  const inputContract = getConnectedWorkflowInputContract(workflowDef, node.id);
  const outgoing = (workflowDef.edges ?? []).filter((edge) => edge.source === node.id).map((edge) => edge.target).filter(Boolean);
  const incoming = (workflowDef.edges ?? []).filter((edge) => edge.target === node.id).map((edge) => edge.source).filter(Boolean);
  const controls = {
    tools: Array.isArray(data.tools) ? data.tools : [],
    skillHints: normalizeStringArray(data.skillHints),
    contextSources: normalizeStringArray(data.contextSources),
    memorySources: normalizeStringArray(data.memorySources),
    expectedOutput: typeof data.expectedOutput === 'string' ? data.expectedOutput : '',
    expectedOutputContract: normalizeExpectedOutputContract(data.expectedOutputContract),
    guardrails: typeof data.guardrails === 'string' ? data.guardrails : '',
    handoffPolicy: data.handoffPolicy || 'auto',
    errorRetryPolicy: data.errorRetryPolicy || 'none',
    contextVisibility: data.contextVisibility || 'full',
    maxTurns: Number.isFinite(Number(data.maxTurns)) ? Number(data.maxTurns) : null,
  };

  const incompatibilities = [];
  if (controls.tools.length > 0 && capability?.controls?.tools === UNSUPPORTED) {
    incompatibilities.push(makeIssue(
      'tools_not_supported_by_provider',
      `${provider} does not enforce Claude tool allowlists; tools are unavailable for this provider.`,
      'agent',
      { nodeId: node.id, provider, tools: controls.tools }
    ));
  }
  if ((effectiveContracts.inputContract ?? []).some((field) => field.type === 'image') && capability?.controls?.imageInputs === UNSUPPORTED) {
    incompatibilities.push(makeIssue(
      'image_inputs_provider_advisory',
      `${provider} may receive image input metadata only; raw image bytes are not injected by the compiled contract.`,
      'agent',
      { nodeId: node.id, provider }
    ));
  }
  if (controls.guardrails && capability?.controls?.guardrails === ADVISORY) {
    warnings.push(makeIssue('guardrails_advisory', `Guardrails for ${data.label || node.id} are prompt guidance unless runtime support is added.`, 'agent', { nodeId: node.id }));
  }
  if (controls.expectedOutputContract.instructions && capability?.controls?.expectedOutputContract === ADVISORY) {
    warnings.push(makeIssue('expected_output_advisory', `Expected output for ${data.label || node.id} is visible in prompts/previews but not hard-validated at runtime yet.`, 'agent', { nodeId: node.id }));
  }

  return {
    id: node.id,
    label: data.label || node.id,
    domain: 'AgentDefinition',
    provider,
    model,
    runtime: {
      provider,
      model,
      spawnMode: provider === 'claude' ? 'stream-json' : provider === 'codex' ? 'codex-sdk' : 'pty',
      capabilityState: capability?.available === false ? 'unavailable' : 'available',
    },
    mission: data.mission || data.systemPrompt || '',
    systemPrompt: data.systemPrompt || '',
    isStartNode: Boolean(data.isTriageNode),
    graph: { incoming, outgoing },
    controls,
    io: {
      inputs: inputContract,
      inputKeys: inputContract.map((field) => field.key),
      visualInputKeys: visualInputConnections[node.id] ?? [],
      outputExpectations: controls.expectedOutputContract,
      workflowOutputs: effectiveContracts.outputContract.outputs,
      artifactExpectations: effectiveContracts.outputContract.artifacts,
    },
    promptStack: buildPromptStack(data, inputContract, effectiveContracts.outputContract),
    memory: {
      sources: controls.memorySources.length ? controls.memorySources : controls.contextSources,
      precedence: ['explicit handoff payload', 'workflow run inputs', 'pack knowledge', 'agent memory sources', 'conversation transcript'],
    },
    policy: {
      handoff: controls.handoffPolicy,
      errorRetry: controls.errorRetryPolicy,
      contextVisibility: controls.contextVisibility,
      maxTurns: controls.maxTurns,
    },
    incompatibilities,
    whyThisOutput: buildWhySummary(data, provider, effectiveContracts),
  };
}

function resolveAgentProvider(model, requestedProvider) {
  const normalized = String(model ?? '').toLowerCase();
  if (requestedProvider && requestedProvider !== 'auto') return requestedProvider;
  if (normalized.includes('gemini')) return 'gemini';
  if (normalized.includes('codex') || normalized.startsWith('gpt-')) return 'codex';
  return 'claude';
}

function resolveAgentModel(provider, nodeModel, runtimeModels) {
  if (nodeModel && isSupportedRuntimeModel(provider, nodeModel)) return nodeModel;
  if (runtimeModels?.[provider] && isSupportedRuntimeModel(provider, runtimeModels[provider])) return runtimeModels[provider];
  return getDefaultRuntimeModel(provider, nodeModel);
}

function buildWorkflowDomain(workflowDef, effectiveContracts, startNodeIds) {
  return {
    id: workflowDef.id ?? null,
    name: workflowDef.name || 'Untitled Workflow',
    description: workflowDef.description || '',
    domain: 'WorkflowDefinition',
    nodeCount: (workflowDef.nodes ?? []).length,
    edgeCount: (workflowDef.edges ?? []).length,
    startNodeIds,
    inputContract: effectiveContracts.inputContract,
    outputContract: effectiveContracts.outputContract,
    source: effectiveContracts.source ?? {},
  };
}

function buildHarnessDomain(pack, packResolution) {
  if (!pack) {
    return {
      domain: 'HarnessContract/PackDefinition',
      present: false,
      authority: 'PackBuilder remains authoritative for pack-owned behavior until parity gate passes.',
    };
  }
  return {
    domain: 'HarnessContract/PackDefinition',
    present: true,
    id: pack.id ?? null,
    name: pack.name ?? '',
    version: pack.packVersion ?? '',
    runtimePolicy: pack.runtimePolicy ?? {},
    inputSchema: pack.inputSchema ?? {},
    outputSchema: pack.outputSchema ?? {},
    artifactDefinitions: pack.artifactDefinitions ?? [],
    visibleSteps: pack.visibleSteps ?? [],
    resolvedMetadata: packResolution?.packMetadata ?? null,
    authority: 'pack-authoritative',
  };
}


function resolvePackPreview(pack, input = {}) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new Error('Pack is required');
  }
  const packMetadata = {
    packId: pack.id ?? null,
    packName: pack.name ?? '',
    packVersion: pack.packVersion ?? '',
    visibleSteps: cloneJson(pack.visibleSteps ?? []),
    artifactDefinitions: cloneJson(pack.artifactDefinitions ?? []),
    outputSchema: cloneJson(pack.outputSchema ?? {}),
    runtimePolicy: cloneJson(pack.runtimePolicy ?? {}),
    projectBinding: null,
    conflicts: [],
  };
  return {
    workflowId: pack.workflowId ?? null,
    workflowContextPatch: {
      pack: {
        id: pack.id ?? null,
        name: pack.name ?? '',
        version: pack.packVersion ?? '',
        input: cloneJson(input),
        knowledgeSources: cloneJson(pack.knowledgeSources ?? []),
        behaviorRules: cloneJson(pack.behaviorRules ?? []),
        visibleSteps: cloneJson(pack.visibleSteps ?? []),
        completionCriteria: cloneJson(pack.completionCriteria ?? []),
        projectBinding: null,
      },
      packKnowledge: {},
      packBehaviorDirectives: (pack.behaviorRules ?? []).map((rule) => ({
        id: rule.id,
        name: rule.name,
        instruction: rule.instruction ?? rule.rule ?? '',
        mode: rule.mode,
        priority: rule.priority,
      })),
    },
    packMetadata,
  };
}

function buildPrecedenceMatrix(effectiveContracts, hasPack) {
  return [
    {
      fieldFamily: 'workflow inputs',
      order: ['visual workflowInput nodes', 'workflow.inputContract legacy fields'],
      effectiveSource: effectiveContracts.source?.input ?? 'legacyContract',
    },
    {
      fieldFamily: 'workflow artifacts',
      order: ['visual outputExtractor nodes', 'workflow.outputContract.artifacts legacy fields'],
      effectiveSource: effectiveContracts.source?.artifacts ?? 'legacyContract',
    },
    {
      fieldFamily: 'runtime provider/model',
      order: hasPack ? ['explicit run override', 'pack.runtimePolicy', 'agent.model', 'server default'] : ['explicit run override', 'agent.model', 'server default'],
      effectiveSource: hasPack ? 'run/pack/agent/default merge' : 'run/agent/default merge',
    },
    {
      fieldFamily: 'agent guidance',
      order: ['agent structured fields', 'workflow context', 'pack knowledge/behavior', 'runtime protocol'],
      effectiveSource: 'compiled prompt stack',
    },
  ];
}

function buildObservabilitySummary(agents, effectiveContracts, packResolution) {
  return {
    promptAssemblyOrder: [
      'agent awareness',
      'mission/system prompt',
      'workflow inputs and IO expectations',
      'pack knowledge and behavior rules',
      'memory/context sources',
      'handoff/error/output policy',
      'runtime protocol',
    ],
    memoryPrecedence: ['handoff payload', 'workflow run inputs', 'pack knowledge', 'agent memory sources', 'transcript'],
    handoffPolicy: agents.map((agent) => ({ nodeId: agent.id, policy: agent.policy.handoff, outgoing: agent.graph.outgoing })),
    errorRetryPolicy: agents.map((agent) => ({ nodeId: agent.id, policy: agent.policy.errorRetry })),
    outputExpectations: {
      outputs: effectiveContracts.outputContract.outputs,
      artifacts: effectiveContracts.outputContract.artifacts,
    },
    packOverlay: packResolution?.packMetadata ? {
      packId: packResolution.packMetadata.packId,
      visibleSteps: packResolution.packMetadata.visibleSteps,
      artifactDefinitions: packResolution.packMetadata.artifactDefinitions,
    } : null,
  };
}

function summarizeSelectedCapabilities(agents) {
  return agents.map((agent) => ({
    nodeId: agent.id,
    provider: agent.provider,
    model: agent.model,
    spawnMode: agent.runtime.spawnMode,
    incompatibilities: agent.incompatibilities,
  }));
}

function buildPromptStack(data, inputContract, outputContract) {
  return [
    { layer: 'mission', source: 'AgentDefinition.systemPrompt/mission', preview: (data.mission || data.systemPrompt || '').slice(0, 240) },
    { layer: 'inputs', source: 'WorkflowDefinition input contract', keys: inputContract.map((field) => field.key) },
    { layer: 'outputs', source: 'WorkflowDefinition output/artifact contract', keys: [
      ...(outputContract.outputs ?? []).map((item) => item.key),
      ...(outputContract.artifacts ?? []).map((item) => item.key),
    ] },
    { layer: 'memory', source: 'AgentDefinition.memorySources/contextSources', keys: normalizeStringArray(data.memorySources ?? data.contextSources) },
    { layer: 'policy', source: 'AgentDefinition handoff/error/guardrail controls', keys: [data.handoffPolicy || 'auto', data.errorRetryPolicy || 'none'].filter(Boolean) },
  ];
}

function buildWhySummary(data, provider, effectiveContracts) {
  const pieces = [
    `Provider ${provider} executes the agent with its effective model.`,
    data.systemPrompt ? 'Mission/system prompt contributes the primary instruction.' : 'No explicit mission/system prompt is set yet.',
  ];
  if ((effectiveContracts.inputContract ?? []).length) pieces.push('Workflow inputs are injected or scoped through the compiled IO contract.');
  if ((effectiveContracts.outputContract?.artifacts ?? []).length) pieces.push('Artifact expectations are derived before runtime and visible in preview.');
  if (data.expectedOutput || data.expectedOutputContract?.instructions) pieces.push('Expected output guidance shapes the final answer but remains advisory unless validated downstream.');
  return pieces.join(' ');
}

function normalizeExpectedOutputContract(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { format: 'markdown', instructions: '' };
  }
  return {
    format: ['text', 'markdown', 'json'].includes(value.format) ? value.format : 'markdown',
    instructions: typeof value.instructions === 'string' ? value.instructions : '',
  };
}

function findStartNodeIds(workflowDef) {
  const agentNodes = (workflowDef.nodes ?? []).filter(isAgentNode);
  const explicit = agentNodes.filter((node) => node.data?.isTriageNode).map((node) => node.id);
  if (explicit.length) return explicit;
  const targets = new Set((workflowDef.edges ?? []).map((edge) => edge.target));
  const roots = agentNodes.filter((node) => !targets.has(node.id)).map((node) => node.id);
  return roots.length ? roots : agentNodes.slice(0, 1).map((node) => node.id);
}

function deriveVisualInputConnections(workflowDef, inputContract) {
  const fieldsByInputNodeId = new Map();
  for (const field of inputContract || []) {
    if (!field.inputNodeId) continue;
    const list = fieldsByInputNodeId.get(field.inputNodeId) || [];
    list.push(field.key);
    fieldsByInputNodeId.set(field.inputNodeId, list);
  }
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function isAgentNode(node) {
  return (node?.type ?? 'agent') === 'agent';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function makeIssue(code, message, scope, details = {}) {
  return { code, message, scope, ...details };
}

function buildFailure(message) {
  return {
    version: CONTRACT_RESOLVER_VERSION,
    ok: false,
    status: 'invalid',
    errors: [makeIssue('compiled_preview_invalid_request', message, 'request')],
    warnings: [],
    info: [],
  };
}
