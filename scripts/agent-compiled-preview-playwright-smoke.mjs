import fs from 'fs/promises';
import { existsSync } from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(repoRoot, 'server', 'package.json'));
const express = serverRequire('express');
const { chromium } = serverRequire('playwright-core');

const browserCandidates = [
  process.env.AGENT_PREVIEW_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const workflow = {
  id: 'wf-agent-preview',
  name: 'Agent Compiled Preview Smoke',
  description: 'Verify progressive harness agent definition preview.',
  nodes: [
    {
      id: 'input-brief',
      type: 'workflowInput',
      position: { x: 80, y: 120 },
      data: {
        label: 'Domain Brief',
        prompt: 'Provide a domain brief',
        fields: [{ id: 'field-1', key: 'brief', label: 'Brief', type: 'textarea', required: true }],
      },
    },
    {
      id: 'agent-a',
      type: 'agent',
      position: { x: 390, y: 120 },
      data: {
        label: 'Harness Strategist',
        model: 'gpt-5.4',
        systemPrompt: 'Build a deterministic harness plan.',
        isTriageNode: true,
      },
    },
    {
      id: 'extract-report',
      type: 'outputExtractor',
      position: { x: 700, y: 120 },
      data: {
        label: 'Harness Report',
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
  settings: {},
  initialContext: {},
  inputContract: [],
  outputContract: { outputs: [], artifacts: [] },
  updatedAt: new Date().toISOString(),
};

const pack = {
  id: 'pack-agent-preview',
  name: 'Agent Preview Pack',
  description: 'Pack-linked path remains available while Swarm owns agent preview.',
  category: 'qa',
  workflowId: workflow.id,
  packVersion: '1.0.0',
  status: 'draft',
  inputSchema: { type: 'object', properties: { brief: { type: 'string' } }, required: ['brief'] },
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  artifactDefinitions: [{ id: 'harness_report', name: 'Harness Report', sourceType: 'aggregatedArtifact', format: 'markdown' }],
  visibleSteps: [{ id: 'step-1', label: 'Harness Strategist', nodeId: 'agent-a' }],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findBrowserExecutable() {
  for (const candidate of browserCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`No Chrome/Edge executable found. Checked: ${browserCandidates.join(', ')}`);
}

function listen(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve) => server.listen(port, host, () => resolve(server.address())));
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html';
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

async function serveStatic(req, res, publicDir) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const resolvedRoot = path.resolve(publicDir);
  const candidate = path.resolve(publicDir, relativePath);
  const filePath = candidate.startsWith(resolvedRoot + path.sep) ? candidate : path.join(publicDir, 'index.html');
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(data);
  } catch {
    const data = await fs.readFile(path.join(publicDir, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  }
}

function buildPreview(body, workflowState) {
  const agent = workflowState.nodes.find((node) => node.id === (body.selectedAgentId || 'agent-a'));
  return {
    ok: true,
    version: 'progressive-harness-v1',
    selectedAgentId: agent?.id || 'agent-a',
    domains: {
      workflow: { domain: 'WorkflowDefinition', name: workflowState.name },
      agents: [
        {
          id: 'agent-a',
          provider: 'codex',
          model: agent?.data?.model || 'gpt-5.4',
          runtime: { spawnMode: 'codex-sdk' },
          io: { inputKeys: ['brief'], artifactExpectations: [{ key: 'harness_report' }] },
          memory: { precedence: ['workflow run inputs', 'agent memory sources', 'conversation transcript'] },
          policy: {
            handoff: agent?.data?.handoffPolicy || 'auto',
            errorRetry: agent?.data?.errorRetryPolicy || 'none',
          },
          incompatibilities: [
            { code: 'tools_not_supported_by_provider', message: 'codex does not enforce Claude tool allowlists.' },
          ],
          whyThisOutput: 'Provider codex executes the agent with its effective model and compiled IO contract.',
        },
      ],
      compiledExecution: { derivedOnly: true },
    },
    observability: {
      promptAssemblyOrder: ['agent awareness', 'mission/system prompt', 'workflow inputs and IO expectations', 'runtime protocol'],
    },
    errors: [],
    warnings: [{ code: 'guardrails_advisory', message: 'Guardrails are prompt guidance unless runtime support is added.' }],
  };
}

function createApp(publicDir) {
  const app = express();
  let workflowState = JSON.parse(JSON.stringify(workflow));
  let lastSavedWorkflow = null;
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/v1/projects', (_req, res) => res.json({
    projects: [{ id: 'proj-agent-preview', name: 'Agent Preview Project', path: 'C:/projects/agent-preview' }],
  }));
  app.get('/api/v1/workflows', (_req, res) => res.json({ workflows: [workflowState] }));
  app.get('/api/v1/workflows/wf-agent-preview', (_req, res) => res.json({ workflow: workflowState }));
  app.put('/api/v1/workflows/wf-agent-preview', (req, res) => {
    workflowState = {
      ...workflowState,
      ...req.body,
      id: workflow.id,
      updatedAt: new Date().toISOString(),
    };
    lastSavedWorkflow = workflowState;
    res.json({ workflow: workflowState });
  });
  app.post('/api/v1/swarm/compiled-preview', (req, res) => res.json({ preview: buildPreview(req.body || {}, workflowState) }));
  app.get('/api/v1/swarm/runtime-capabilities', (_req, res) => res.json({
    providers: { claude: ['opus'], codex: ['gpt-5.4'], gemini: ['gemini-2.5-pro'] },
    defaults: { claude: 'opus', codex: 'gpt-5.4', gemini: 'gemini-2.5-pro' },
    availability: { claude: true, codex: true, gemini: true },
  }));
  app.get('/api/v1/packs', (_req, res) => res.json({ packs: [pack] }));
  app.get('/api/v1/packs/pack-agent-preview', (_req, res) => res.json({ pack }));
  app.get('/__smoke/last-save', (_req, res) => res.json({ workflow: lastSavedWorkflow }));
  app.use((req, res) => serveStatic(req, res, publicDir));
  return app;
}

async function main() {
  const publicDir = path.join(repoRoot, 'server', 'public');
  assert(existsSync(path.join(publicDir, 'index.html')), 'server/public build is missing; run npm run build first');
  const executablePath = await findBrowserExecutable();
  const server = http.createServer(createApp(publicDir));
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    await page.addInitScript(() => {
      window.localStorage.setItem('ccvm-app-view', 'swarm');
      window.localStorage.setItem('ccvm-active-project-id', 'proj-agent-preview');
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Open Activity' }).waitFor();
    assert(await page.getByText('Chat View').count() === 0, 'Expected idle activity rail to be closed');
    await page.getByRole('button', { name: 'Build', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Workflows' }).click();
    await page.getByRole('button', { name: 'Load' }).waitFor();
    await page.locator('select').filter({ hasText: 'Agent Compiled Preview Smoke' }).first().selectOption('wf-agent-preview');
    await page.getByRole('button', { name: 'Load' }).click();
    await page.getByText('Harness Strategist').first().click();
    await page.getByText('Setup').waitFor();
    const setupHeadings = [
      'Essentials',
      'Behavior & Output Guidance',
      'Context, Memory & Visibility',
      'Runtime & Policies',
      'Effective Preview (Derived)',
    ];
    for (const heading of setupHeadings) {
      await page.getByRole('button', { name: new RegExp(heading.replace(/[()]/g, '\\$&'), 'i') }).waitFor();
    }
    await page.getByLabel('Agent mission').fill('Design a progressive sector harness.');
    await page.getByRole('button', { name: /Context, Memory & Visibility/i }).click();
    await page.getByLabel('Memory sources').fill('domain-brief, policy-docs');
    await page.getByRole('button', { name: /Behavior & Output Guidance/i }).click();
    await page.getByLabel('Guardrails').fill('Do not invent unavailable provider capabilities.');
    await page.getByRole('button', { name: /Runtime & Policies/i }).click();
    await page.getByLabel('Handoff policy').selectOption('explicit');
    await page.getByLabel('Error/retry policy').selectOption('retry-on-error');

    await page.getByRole('button', { name: /Effective Preview \(Derived\)/i }).waitFor();
    await page.getByText('codex / gpt-5.4').waitFor();
    await page.getByText('Prompt assembly order').waitFor();
    await page.getByText('Memory provenance').waitFor();
    await page.getByText(/Inputs: brief/).waitFor();
    await page.getByText(/Artifacts: harness_report/).waitFor();
    await page.getByText(/Structured incompatibilities/).waitFor();

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Workflow saved successfully.').waitFor();
    const saved = await page.request.get(`${baseUrl}/__smoke/last-save`).then((res) => res.json());
    const savedAgent = saved.workflow.nodes.find((node) => node.id === 'agent-a');
    assert(savedAgent.data.mission === 'Design a progressive sector harness.', 'Expected mission to persist in save payload');
    assert(savedAgent.data.memorySources.includes('policy-docs'), 'Expected memory sources to persist in save payload');
    assert(savedAgent.data.handoffPolicy === 'explicit', 'Expected handoff policy to persist in save payload');
    assert(savedAgent.data.errorRetryPolicy === 'retry-on-error', 'Expected error/retry policy to persist in save payload');

    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.getByText('Agent Node').waitFor();
    await page.getByRole('button', { name: 'Workflows' }).click();
    await page.getByRole('button', { name: 'Load' }).waitFor();

    await page.getByRole('button', { name: 'Packs' }).click();
    await page.getByRole('heading', { name: 'Agent Preview Pack' }).waitFor();

    const noProjectPage = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    await noProjectPage.addInitScript(() => {
      window.localStorage.setItem('ccvm-app-view', 'swarm');
      window.localStorage.removeItem('ccvm-active-project-id');
    });
    await noProjectPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await noProjectPage.getByRole('button', { name: 'Workflows' }).click();
    await noProjectPage.locator('select').filter({ hasText: 'Agent Compiled Preview Smoke' }).first().selectOption('wf-agent-preview');
    await noProjectPage.getByRole('button', { name: 'Load' }).click();
    await noProjectPage.getByText('Project required').first().waitFor();
    await noProjectPage.getByText('Select a project in the sidebar to run this workflow.').waitFor();
    const runButton = noProjectPage.getByRole('button', { name: 'Run', exact: true });
    await runButton.waitFor();
    assert(await runButton.isDisabled(), 'Expected Run to stay disabled without an active project');

    console.log('[agent-compiled-preview] Playwright smoke PASS');
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(`[agent-compiled-preview] Playwright smoke FAIL: ${error.stack || error.message}`);
  process.exit(1);
});
