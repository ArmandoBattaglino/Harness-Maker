import { describe, expect, it } from 'vitest';
import { compileExecutionContract } from '../services/ExecutionContractResolver.js';

const workflow = {
  id: 'wf-progressive',
  name: 'Progressive Harness',
  description: 'Build a configurable sector harness',
  nodes: [
    {
      id: 'input-brief',
      type: 'workflowInput',
      data: {
        label: 'Domain Brief',
        fields: [
          { key: 'brief', label: 'Brief', type: 'textarea', required: true },
          { key: 'reference_image', label: 'Reference image', type: 'image', required: false },
        ],
      },
    },
    {
      id: 'agent-a',
      type: 'agent',
      data: {
        label: 'Harness Strategist',
        model: 'gpt-5.4',
        systemPrompt: 'Turn the domain brief into a harness plan.',
        mission: 'Create a sector-specific harness design.',
        tools: ['Read'],
        skillHints: ['researcher', 'architect'],
        contextSources: ['project-memory'],
        memorySources: ['customer-brief'],
        guardrails: 'Do not invent unsupported runtime capabilities.',
        handoffPolicy: 'explicit',
        errorRetryPolicy: 'retry-on-error',
        expectedOutputContract: { format: 'markdown', instructions: 'Return a structured harness blueprint.' },
        isTriageNode: true,
      },
    },
    {
      id: 'extract-report',
      type: 'outputExtractor',
      data: {
        artifactKey: 'harness_report',
        artifactName: 'Harness Report',
        format: 'markdown',
        sourcePolicy: 'firstIncoming',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'input-brief', target: 'agent-a' },
    { id: 'e2', source: 'agent-a', target: 'extract-report' },
  ],
};

describe('ExecutionContractResolver progressive harness preview', () => {
  it('compiles workflow, agent, harness, IO, capability, and observability domains deterministically', () => {
    const preview = compileExecutionContract({
      workflowDef: workflow,
      runtimeProvider: 'auto',
      runtimeModels: { codex: 'gpt-5.4' },
      selectedAgentId: 'agent-a',
      runtimeSnapshot: {
        providers: { claude: ['opus'], codex: ['gpt-5.4'], gemini: ['gemini-2.5-pro'] },
        defaults: { claude: 'opus', codex: 'gpt-5.4', gemini: 'gemini-2.5-pro' },
        availability: { claude: true, codex: true, gemini: true },
      },
    });

    expect(preview.ok).toBe(true);
    expect(preview.version).toBe('progressive-harness-v1');
    expect(preview.domains.workflow.inputContract.map((field) => field.key)).toEqual(['brief', 'reference_image']);
    expect(preview.io.outputContract.artifacts[0]).toMatchObject({
      key: 'harness_report',
      source: 'outputExtractor',
      outputExtractorNodeId: 'extract-report',
    });
    expect(preview.domains.compiledExecution).toMatchObject({
      derivedOnly: true,
      startNodeIds: ['agent-a'],
      runtimeProvider: 'auto',
    });
    expect(preview.domains.agents[0]).toMatchObject({
      id: 'agent-a',
      provider: 'codex',
      model: 'gpt-5.4',
      io: expect.objectContaining({ inputKeys: ['brief', 'reference_image'] }),
      policy: expect.objectContaining({ handoff: 'explicit', errorRetry: 'retry-on-error' }),
    });
    expect(preview.domains.agents[0].incompatibilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'tools_not_supported_by_provider' }),
      expect.objectContaining({ code: 'image_inputs_provider_advisory' }),
    ]));
    expect(preview.observability.promptAssemblyOrder).toContain('mission/system prompt');
    expect(preview.precedence.map((row) => row.fieldFamily)).toContain('runtime provider/model');
  });

  it('returns structured errors for malformed contracts and unsupported runtime models', () => {
    const preview = compileExecutionContract({
      workflowDef: {
        ...workflow,
        inputContract: [{ key: 'Invalid Key', type: 'bad' }],
        nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent' } }],
      },
      runtimeProvider: 'gemini',
      runtimeModels: { gemini: 'gemini-2.0-flash' },
    });

    expect(preview.ok).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'workflow_contract_invalid' }),
      expect.objectContaining({ code: 'runtime_model_unsupported', provider: 'gemini' }),
    ]));
  });

  it('treats legacy nodes without an explicit type as agent definitions', () => {
    const preview = compileExecutionContract({
      workflowDef: {
        id: 'wf-legacy',
        name: 'Legacy workflow',
        nodes: [
          { id: 'legacy-agent', data: { label: 'Legacy Agent', systemPrompt: 'Continue supporting old workflows.' } },
        ],
        edges: [],
      },
    });

    expect(preview.ok).toBe(true);
    expect(preview.domains.workflow.startNodeIds).toEqual(['legacy-agent']);
    expect(preview.domains.agents[0]).toMatchObject({
      id: 'legacy-agent',
      label: 'Legacy Agent',
      domain: 'AgentDefinition',
    });
  });


  it('compiles pack overlays without making PackBuilder ownership implicit', () => {
    const pack = {
      id: 'pack-1',
      name: 'Domain Harness Pack',
      packVersion: '1.0.0',
      workflowId: workflow.id,
      runtimePolicy: { provider: 'codex' },
      inputSchema: { type: 'object', properties: { brief: { type: 'string' } }, required: ['brief'] },
      outputSchema: { type: 'object', properties: {} },
      knowledgeSources: [{ id: 'ks-1', type: 'inline', name: 'Knowledge', content: 'Domain rules' }],
      behaviorRules: [{ id: 'br-1', rule: 'Be precise' }],
      artifactDefinitions: [{ id: 'report', name: 'Report', sourceType: 'aggregatedArtifact', format: 'markdown' }],
      visibleSteps: [{ id: 'step-1', label: 'Plan harness', nodeId: 'agent-a' }],
    };

    const packWorkflow = {
      ...workflow,
      nodes: workflow.nodes.map((node) => (
        node.id === 'agent-a'
          ? { ...node, data: { ...node.data, model: '' } }
          : node
      )),
    };
    const preview = compileExecutionContract({ workflowDef: packWorkflow, pack, packInput: { brief: 'Brief' } });

    expect(preview.ok).toBe(true);
    expect(preview.capabilities).toMatchObject({
      requestedProvider: 'auto',
      effectiveProvider: 'codex',
    });
    expect(preview.domains.agents[0]).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.4',
    });
    expect(preview.domains.harness).toMatchObject({
      present: true,
      id: 'pack-1',
      authority: 'pack-authoritative',
    });
    expect(preview.info).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pack_overlay_applied' }),
    ]));
    expect(preview.observability.packOverlay.visibleSteps[0].label).toBe('Plan harness');
  });
});
