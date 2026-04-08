import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import spawn from 'cross-spawn';

const WORKFLOW_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'nodes', 'edges'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    nodes: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'data', 'position'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', const: 'agent' },
          data: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'systemPrompt', 'isTriageNode'],
            properties: {
              label: { type: 'string', minLength: 1 },
              systemPrompt: { type: 'string', minLength: 1 },
              isTriageNode: { type: 'boolean' },
            },
          },
          position: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
        },
      },
    },
    edges: {
      type: 'array',
      maxItems: 15,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'source', 'target', 'type'],
        properties: {
          id: { type: 'string', minLength: 1 },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          type: { type: 'string', const: 'handoff' },
        },
      },
    },
  },
};

function validateWorkflowShape(workflow, providerName) {
  if (!workflow || typeof workflow !== 'object') {
    throw new Error(`Invalid workflow structure from ${providerName}: response was not an object`);
  }
  if (!workflow.name || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    throw new Error(`Invalid workflow structure from ${providerName}`);
  }
  return workflow;
}

export function buildWorkflowPrompt(prompt) {
  return `You are a workflow designer. Given a user description, generate a multi-agent workflow definition as JSON.

Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "name": "string (max 100 chars, alphanumeric + spaces + hyphens)",
  "description": "string (max 500 chars)",
  "nodes": [
    {
      "id": "string (unique, e.g. node-1)",
      "type": "agent",
      "data": {
        "label": "string",
        "systemPrompt": "string (the agent role and instructions)",
        "isTriageNode": boolean
      },
      "position": { "x": number, "y": number }
    }
  ],
  "edges": [
    {
      "id": "string (unique, e.g. edge-1)",
      "source": "node-id",
      "target": "node-id",
      "type": "handoff"
    }
  ]
}

Rules:
- First node should have isTriageNode: true
- Nodes positioned left to right, x/y spaced 200px apart
- Maximum 10 nodes, 15 edges
- Name must match /^[\\w\\s\\-.]+$/

User description: ${prompt}`;
}

export function parseWorkflowDefinition(text, providerName) {
  const clean = String(text)
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/m, '')
    .trim();

  if (!clean) {
    throw new Error(`Empty workflow response from ${providerName}`);
  }

  const workflow = JSON.parse(clean);
  return validateWorkflowShape(workflow, providerName);
}

export function parseClaudeCliEnvelope(stdout) {
  const trimmed = String(stdout ?? '').trim();
  if (!trimmed) {
    return { text: '', isError: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { text: trimmed, isError: false };
  }

  const text = String(parsed.result ?? parsed.content ?? trimmed).trim();
  return {
    text,
    isError: parsed.is_error === true,
    subtype: parsed.subtype,
  };
}

export function parseGeminiCliEnvelope(stdout) {
  const trimmed = String(stdout ?? '').trim();
  if (!trimmed) {
    return { text: '', isError: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { text: trimmed, isError: false };
  }

  const text = String(parsed.response ?? trimmed).trim();
  return {
    text,
    isError: !!parsed.error,
  };
}

function buildProviderError(providerName, message, statusCode = 500, options = {}) {
  const error = new Error(message);
  error.provider = providerName;
  error.statusCode = statusCode;
  if (options.cause) error.cause = options.cause;
  if (options.details) error.details = options.details;
  return error;
}

function classifyScaffoldFailure(providerName, rawMessage) {
  const message = String(rawMessage ?? '').trim() || `${providerName} scaffold failed`;
  if (/hit your limit|rate limit|quota|credits?|resource exhausted|429/i.test(message)) {
    return buildProviderError(providerName, message, 503);
  }
  if (/403 Forbidden|usage limit|try again at|cloudflare|Enable JavaScript and cookies to continue/i.test(message)) {
    return buildProviderError(providerName, message, 503);
  }
  if (/not configured|not found|Access is denied|spawn .*ENOENT/i.test(message)) {
    return buildProviderError(providerName, message, 503);
  }
  return buildProviderError(providerName, message, 500);
}

function slugToTitle(slug) {
  return slug
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function sanitizeWorkflowName(prompt) {
  const words = String(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !['create', 'build', 'make', 'design', 'simple', 'workflow', 'that', 'with', 'for', 'and'].includes(word))
    .slice(0, 6);

  const baseName = words.length > 0 ? slugToTitle(words.join(' ')) : 'Generated Workflow';
  return `${baseName} Workflow`.slice(0, 100);
}

function sanitizeLabel(label) {
  return String(label)
    .replace(/[^A-Za-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocalFallbackWorkflow(prompt) {
  const normalized = String(prompt).trim();
  const lowerPrompt = normalized.toLowerCase();

  const specialists = [];
  if (/(billing|invoice|refund|payment|subscription|charge)/i.test(lowerPrompt)) {
    specialists.push({
      key: 'billing',
      label: 'Billing Agent',
      prompt: 'You are a billing specialist. Handle invoices, payments, refunds, subscriptions, and account charges with clear next steps.',
    });
  }
  if (/(technical|support|bug|troubleshoot|error|integration|product)/i.test(lowerPrompt)) {
    specialists.push({
      key: 'technical',
      label: 'Technical Support Agent',
      prompt: 'You are a technical support specialist. Diagnose product issues, guide troubleshooting, and escalate unresolved bugs clearly.',
    });
  }
  if (/(sales|lead|prospect|demo)/i.test(lowerPrompt)) {
    specialists.push({
      key: 'sales',
      label: 'Sales Agent',
      prompt: 'You are a sales specialist. Qualify inbound requests, answer product questions, and move promising leads toward the next sales step.',
    });
  }

  if (specialists.length === 0) {
    specialists.push({
      key: 'execution',
      label: 'Execution Agent',
      prompt: 'You are a specialist agent. Continue the workflow after triage, complete the requested task, and return a useful final result.',
    });
  }

  const nodes = [
    {
      id: 'node-1',
      type: 'agent',
      data: {
        label: 'Triage Agent',
        systemPrompt: `You are the triage agent for this workflow. Read each incoming request, classify it, and hand it off to the most appropriate specialist. Original workflow intent: ${normalized}`,
        isTriageNode: true,
      },
      position: { x: 0, y: 0 },
    },
    ...specialists.map((specialist, index) => ({
      id: `node-${index + 2}`,
      type: 'agent',
      data: {
        label: sanitizeLabel(specialist.label),
        systemPrompt: specialist.prompt,
        isTriageNode: false,
      },
      position: { x: 300, y: index * 220 },
    })),
  ];

  const edges = specialists.map((specialist, index) => ({
    id: `edge-${index + 1}`,
    source: 'node-1',
    target: `node-${index + 2}`,
    type: 'handoff',
  }));

  return {
    name: sanitizeWorkflowName(normalized),
    description: normalized.slice(0, 500),
    nodes,
    edges,
  };
}

function runSpawn(binaryPath, args, { cwd, stdinText = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    try {
      if (stdinText !== null) {
        child.stdin.write(stdinText);
      }
      child.stdin.end();
    } catch {
      // ignore broken stdin; close handler will surface process failure
    }
  });
}

async function runClaudeScaffold(claudeBin, prompt) {
  const fullPrompt = buildWorkflowPrompt(prompt);
  const args = [
    '-p', fullPrompt,
    '--output-format', 'json',
    '--max-turns', '1',
    '--no-session-persistence',
    '--tools', 'none',
  ];

  const { code, stdout, stderr } = await runSpawn(claudeBin, args, { cwd: os.tmpdir() });
  const envelope = parseClaudeCliEnvelope(stdout);

  if (code !== 0 || envelope.isError) {
    const providerMessage = envelope.text || stderr.trim() || `Claude exited ${code}`;
    throw classifyScaffoldFailure('claude', providerMessage);
  }

  try {
    return parseWorkflowDefinition(envelope.text || stdout, 'Claude');
  } catch (error) {
    throw classifyScaffoldFailure('claude', `Failed to parse workflow JSON: ${error.message}`);
  }
}

async function runCodexScaffold(codexBin, prompt) {
  const outputFile = path.join(os.tmpdir(), `codex-scaffold-${randomUUID()}.json`);
  const schemaFile = path.join(os.tmpdir(), `codex-scaffold-schema-${randomUUID()}.json`);
  const fullPrompt = buildWorkflowPrompt(prompt);
  const args = [
    'exec',
    '-C', os.tmpdir(),
    '--skip-git-repo-check',
    '--sandbox', 'read-only',
    '--output-schema', schemaFile,
    '-o', outputFile,
    '-',
  ];

  try {
    await fs.writeFile(schemaFile, JSON.stringify(WORKFLOW_OUTPUT_SCHEMA, null, 2), 'utf8');

    const { code, stderr } = await runSpawn(codexBin, args, {
      cwd: os.tmpdir(),
      stdinText: `${fullPrompt}\n\nReturn only a JSON object that satisfies the output schema. Do not ask follow-up questions. Make reasonable assumptions and continue.`,
    });

    if (code !== 0) {
      throw classifyScaffoldFailure('codex', stderr.trim() || `Codex exited ${code}`);
    }

    const text = await fs.readFile(outputFile, 'utf8');
    try {
      return parseWorkflowDefinition(text, 'Codex');
    } catch (error) {
      throw classifyScaffoldFailure('codex', `Failed to parse workflow JSON: ${error.message}`);
    }
  } finally {
    await fs.rm(outputFile, { force: true }).catch(() => {});
    await fs.rm(schemaFile, { force: true }).catch(() => {});
  }
}

async function runGeminiScaffold(geminiBin, prompt) {
  const fullPrompt = buildWorkflowPrompt(prompt);
  const args = [
    '-p', fullPrompt
  ];

  const model = process.env.SWARM_GEMINI_MODEL;
  if (model) {
    args.push('-m', String(model).trim());
  }

  const { code, stdout, stderr } = await runSpawn(geminiBin, args, { cwd: os.tmpdir() });
  const envelope = parseGeminiCliEnvelope(stdout);

  if (code !== 0 || envelope.isError) {
    const providerMessage = envelope.text || stderr.trim() || `Gemini exited ${code}`;
    throw classifyScaffoldFailure('gemini', providerMessage);
  }

  try {
    return parseWorkflowDefinition(envelope.text || stdout, 'Gemini');
  } catch (error) {
    throw classifyScaffoldFailure('gemini', `Failed to parse workflow JSON: ${error.message}`);
  }
}

export async function generateWorkflowFromPrompt({
  prompt,
  claudeBin,
  codexBin,
  geminiBin,
  runClaude = runClaudeScaffold,
  runCodex = runCodexScaffold,
  runGemini = runGeminiScaffold,
}) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw buildProviderError('scaffold', 'prompt is required', 400);
  }

  const normalizedPrompt = prompt.trim();
  const providerErrors = [];

  if (claudeBin) {
    try {
      return await runClaude(claudeBin, normalizedPrompt);
    } catch (error) {
      providerErrors.push(error);
    }
  }

  if (codexBin) {
    try {
      return await runCodex(codexBin, normalizedPrompt);
    } catch (error) {
      providerErrors.push(error);
    }
  }

  if (geminiBin) {
    try {
      return await runGemini(geminiBin, normalizedPrompt);
    } catch (error) {
      providerErrors.push(error);
    }
  }

  if (providerErrors.length === 0) {
    throw buildProviderError('scaffold', 'No scaffold provider configured', 503);
  }

  if (providerErrors.every((error) => error.statusCode === 503)) {
    return buildLocalFallbackWorkflow(normalizedPrompt);
  }

  if (providerErrors.length === 1) {
    throw providerErrors[0];
  }

  const details = providerErrors
    .map((error) => `${error.provider}: ${error.message}`)
    .join(' | ');

  throw buildProviderError(
    'scaffold',
    `All scaffold providers failed. ${details}`,
    providerErrors.every((error) => error.statusCode === 503) ? 503 : 500,
    { details }
  );
}
