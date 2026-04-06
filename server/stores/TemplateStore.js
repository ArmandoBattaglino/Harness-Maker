// server/stores/TemplateStore.js
// Hardcoded workflow templates — no file storage needed.
// Each template is a full WorkflowDefinition JSON with nodes, edges, settings.

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    id: 'content-agency',
    name: 'Content Agency',
    description: 'A three-agent pipeline: writer drafts content, editor refines it, publisher formats and delivers.',
    nodes: [
      {
        id: 'writer',
        type: 'agent',
        position: { x: 100, y: 200 },
        data: {
          label: 'Writer',
          systemPrompt: 'You are a content writer. Draft high-quality content based on the brief provided. When finished, hand off to the editor for review.',
          role: 'writer',
        },
      },
      {
        id: 'editor',
        type: 'agent',
        position: { x: 400, y: 200 },
        data: {
          label: 'Editor',
          systemPrompt: 'You are an editor. Review the draft for clarity, grammar, and style. Make improvements and hand off to the publisher.',
          role: 'editor',
        },
      },
      {
        id: 'publisher',
        type: 'agent',
        position: { x: 700, y: 200 },
        data: {
          label: 'Publisher',
          systemPrompt: 'You are a publisher. Format the edited content for publication, add metadata, and finalize delivery.',
          role: 'publisher',
        },
      },
    ],
    edges: [
      { id: 'e-writer-editor', source: 'writer', target: 'editor', type: 'handoff' },
      { id: 'e-editor-publisher', source: 'editor', target: 'publisher', type: 'handoff' },
    ],
    settings: {
      maxConcurrentAgents: 1,
      circuitBreakerThreshold: 10,
    },
  },
  {
    id: 'code-review-chain',
    name: 'Code Review Chain',
    description: 'A three-agent code pipeline: coder writes code, reviewer inspects it, merger integrates approved changes.',
    nodes: [
      {
        id: 'coder',
        type: 'agent',
        position: { x: 100, y: 200 },
        data: {
          label: 'Coder',
          systemPrompt: 'You are a software developer. Write clean, well-tested code based on the requirements. Hand off to the reviewer when done.',
          role: 'coder',
        },
      },
      {
        id: 'reviewer',
        type: 'agent',
        position: { x: 400, y: 200 },
        data: {
          label: 'Reviewer',
          systemPrompt: 'You are a code reviewer. Inspect the code for bugs, security issues, and style violations. Provide feedback and hand off to the merger.',
          role: 'reviewer',
        },
      },
      {
        id: 'merger',
        type: 'agent',
        position: { x: 700, y: 200 },
        data: {
          label: 'Merger',
          systemPrompt: 'You are a release manager. Integrate the reviewed code, resolve any merge conflicts, and finalize the changes.',
          role: 'merger',
        },
      },
    ],
    edges: [
      { id: 'e-coder-reviewer', source: 'coder', target: 'reviewer', type: 'handoff' },
      { id: 'e-reviewer-merger', source: 'reviewer', target: 'merger', type: 'handoff' },
    ],
    settings: {
      maxConcurrentAgents: 1,
      circuitBreakerThreshold: 10,
    },
  },
  {
    id: 'research-loop',
    name: 'Research Loop',
    description: 'A three-agent research cycle: researcher gathers data, analyst interprets findings, fact-checker validates — loops back to researcher if issues found.',
    nodes: [
      {
        id: 'researcher',
        type: 'agent',
        position: { x: 100, y: 200 },
        data: {
          label: 'Researcher',
          systemPrompt: 'You are a researcher. Gather relevant data and sources on the given topic. Hand off your findings to the analyst.',
          role: 'researcher',
        },
      },
      {
        id: 'analyst',
        type: 'agent',
        position: { x: 400, y: 200 },
        data: {
          label: 'Analyst',
          systemPrompt: 'You are a data analyst. Interpret the research findings, identify key patterns and insights. Hand off to the fact-checker for validation.',
          role: 'analyst',
        },
      },
      {
        id: 'fact-checker',
        type: 'agent',
        position: { x: 700, y: 200 },
        data: {
          label: 'Fact Checker',
          systemPrompt: 'You are a fact-checker. Validate the analysis against sources. If issues are found, hand off back to the researcher for further investigation. If everything checks out, finalize the report.',
          role: 'fact-checker',
        },
      },
    ],
    edges: [
      { id: 'e-researcher-analyst', source: 'researcher', target: 'analyst', type: 'handoff' },
      { id: 'e-analyst-fact-checker', source: 'analyst', target: 'fact-checker', type: 'handoff' },
      { id: 'e-fact-checker-researcher', source: 'fact-checker', target: 'researcher', type: 'handoff' },
    ],
    settings: {
      maxConcurrentAgents: 1,
      circuitBreakerThreshold: 10,
    },
  },
  {
    id: 'customer-support-triage',
    name: 'Customer Support Triage',
    description: 'A four-agent support system: triage classifies incoming requests and routes to billing, support, or escalation.',
    nodes: [
      {
        id: 'triage',
        type: 'triage',
        position: { x: 300, y: 100 },
        data: {
          label: 'Triage',
          systemPrompt: 'You are a support triage agent. Classify the incoming customer request and route it to the appropriate department: billing for payment issues, support for technical problems, or escalation for urgent/complex cases.',
          role: 'triage',
        },
      },
      {
        id: 'billing',
        type: 'agent',
        position: { x: 100, y: 350 },
        data: {
          label: 'Billing',
          systemPrompt: 'You are a billing specialist. Handle payment issues, refunds, subscription changes, and invoice queries.',
          role: 'billing',
        },
      },
      {
        id: 'support',
        type: 'agent',
        position: { x: 400, y: 350 },
        data: {
          label: 'Support',
          systemPrompt: 'You are a technical support agent. Troubleshoot technical problems, provide solutions, and guide users through fixes.',
          role: 'support',
        },
      },
      {
        id: 'escalation',
        type: 'agent',
        position: { x: 700, y: 350 },
        data: {
          label: 'Escalation',
          systemPrompt: 'You are an escalation manager. Handle urgent or complex cases that require senior attention or cross-department coordination.',
          role: 'escalation',
        },
      },
    ],
    edges: [
      { id: 'e-triage-billing', source: 'triage', target: 'billing', type: 'handoff' },
      { id: 'e-triage-support', source: 'triage', target: 'support', type: 'handoff' },
      { id: 'e-triage-escalation', source: 'triage', target: 'escalation', type: 'handoff' },
    ],
    settings: {
      maxConcurrentAgents: 1,
      circuitBreakerThreshold: 10,
    },
  },
  {
    id: 'data-pipeline',
    name: 'Data Pipeline',
    description: 'A four-agent linear data processing chain: fetcher retrieves data, transformer cleans and reshapes, validator checks integrity, loader persists results.',
    nodes: [
      {
        id: 'fetcher',
        type: 'agent',
        position: { x: 100, y: 200 },
        data: {
          label: 'Fetcher',
          systemPrompt: 'You are a data fetcher. Retrieve data from the specified sources and hand off the raw data to the transformer.',
          role: 'fetcher',
        },
      },
      {
        id: 'transformer',
        type: 'agent',
        position: { x: 350, y: 200 },
        data: {
          label: 'Transformer',
          systemPrompt: 'You are a data transformer. Clean, normalize, and reshape the raw data into the target format. Hand off to the validator.',
          role: 'transformer',
        },
      },
      {
        id: 'validator',
        type: 'agent',
        position: { x: 600, y: 200 },
        data: {
          label: 'Validator',
          systemPrompt: 'You are a data validator. Check data integrity, completeness, and schema conformance. Report any issues and hand off clean data to the loader.',
          role: 'validator',
        },
      },
      {
        id: 'loader',
        type: 'agent',
        position: { x: 850, y: 200 },
        data: {
          label: 'Loader',
          systemPrompt: 'You are a data loader. Persist the validated data to the target storage system and confirm successful loading.',
          role: 'loader',
        },
      },
    ],
    edges: [
      { id: 'e-fetcher-transformer', source: 'fetcher', target: 'transformer', type: 'handoff' },
      { id: 'e-transformer-validator', source: 'transformer', target: 'validator', type: 'handoff' },
      { id: 'e-validator-loader', source: 'validator', target: 'loader', type: 'handoff' },
    ],
    settings: {
      maxConcurrentAgents: 1,
      circuitBreakerThreshold: 10,
    },
  },
];

// ---------------------------------------------------------------------------
// TemplateStore — read-only, in-memory template provider
// ---------------------------------------------------------------------------
export class TemplateStore {
  /**
   * listTemplates() — returns summary metadata for all templates
   */
  listTemplates() {
    return TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      nodeCount: t.nodes.length,
      edgeCount: t.edges.length,
    }));
  }

  /**
   * getTemplate(templateId) — returns the full template definition or null
   */
  getTemplate(templateId) {
    if (!templateId || typeof templateId !== 'string') return null;
    return TEMPLATES.find((t) => t.id === templateId) ?? null;
  }
}
