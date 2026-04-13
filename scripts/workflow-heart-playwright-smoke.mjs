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
  process.env.WORKFLOW_HEART_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const workflow = {
  id: 'wf-heart',
  name: 'Workflow Heart Smoke',
  description: 'Verify workflow-native inputs, outputs, and artifacts.',
  nodes: [{ id: 'agent-a', type: 'agent', position: { x: 120, y: 120 }, data: { label: 'Agent A', systemPrompt: 'Produce deterministic output.' } }],
  edges: [],
  settings: {},
  initialContext: {},
  inputContract: [],
  outputContract: { outputs: [], artifacts: [] },
  updatedAt: new Date().toISOString(),
};

const pack = {
  id: 'pack-heart',
  name: 'Workflow Heart Wrapper Pack',
  description: 'Pack surface remains available while workflow owns direct-run I/O.',
  category: 'qa',
  workflowId: workflow.id,
  packVersion: '1.0.0',
  status: 'draft',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  artifactDefinitions: [],
  visibleSteps: [],
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

function createApp(publicDir) {
  const app = express();
  let workflowState = { ...workflow };
  app.use(express.json());
  app.get('/api/v1/projects', (_req, res) => res.json({
    projects: [{ id: 'proj-heart', name: 'Workflow Heart Project', path: 'C:/projects/workflow-heart' }],
  }));
  app.get('/api/v1/workflows', (_req, res) => res.json({ workflows: [workflowState] }));
  app.get('/api/v1/workflows/wf-heart', (_req, res) => res.json({ workflow: workflowState }));
  app.put('/api/v1/workflows/wf-heart', (req, res) => {
    workflowState = {
      ...workflowState,
      ...req.body,
      id: 'wf-heart',
      updatedAt: new Date().toISOString(),
    };
    res.json({ workflow: workflowState });
  });
  app.get('/api/v1/swarm/runtime-capabilities', (_req, res) => res.json({
    providers: { claude: ['claude-sonnet'], codex: ['gpt-5.4'], gemini: [] },
    defaults: { claude: 'claude-sonnet', codex: 'gpt-5.4', gemini: '' },
    availability: { claude: true, codex: true, gemini: false },
  }));
  app.post('/api/v1/swarm/wf-heart/start', (req, res) => {
    const inputs = req.body?.workflowInput ?? {};
    res.status(201).json({
      executionId: '44444444-4444-4444-8444-000000000001',
      workflowId: workflow.id,
      status: 'completed',
      runtimeProvider: 'codex',
      activeProvider: 'codex',
      providerStrategy: { mode: 'auto', activeProvider: 'codex' },
        workflowRun: { kind: 'workflow-direct', inputs, inputContract: workflowState.inputContract, outputContract: workflowState.outputContract },
      workflowResult: {
        status: 'completed',
        inputs,
        outputs: { result: `WORKFLOW_HEART_OK ${inputs.brief ?? ''}` },
        artifacts: [{ id: 'report', name: 'Report', format: 'markdown', status: 'ready', value: `# WORKFLOW_HEART_OK\n\n${inputs.brief ?? ''}` }],
      },
    });
  });
  app.get('/api/v1/swarm/44444444-4444-4444-8444-000000000001/status', (_req, res) => res.json({ status: 'completed' }));
  app.get('/api/v1/swarm/executions/44444444-4444-4444-8444-000000000001/results', (_req, res) => res.json({
    executionId: '44444444-4444-4444-8444-000000000001',
    workflowName: workflow.name,
    status: 'completed',
    agentOutputs: {},
    aggregatedArtifact: '# WORKFLOW_HEART_OK',
  }));
  app.get('/api/v1/packs', (_req, res) => res.json({ packs: [pack] }));
  app.get('/api/v1/packs/pack-heart', (_req, res) => res.json({ pack }));
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
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.addInitScript(() => {
      window.localStorage.setItem('ccvm-app-view', 'swarm');
      window.localStorage.setItem('ccvm-active-project-id', 'proj-heart');
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await page.locator('select').filter({ hasText: 'Workflow Heart Smoke' }).first().selectOption('wf-heart');
    await page.getByRole('button', { name: 'Load' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Interface' }).click();
    await page.getByRole('button', { name: '+ Add' }).nth(0).click();
    await page.getByLabel('Key').fill('brief');
    await page.getByLabel('Label').fill('Brief');
    await page.getByLabel('Type').selectOption('textarea');
    await page.getByLabel('Required').check();
    await page.getByLabel('Help text').fill('Campaign brief');
    await page.getByRole('button', { name: '+ Add' }).nth(1).click();
    await page.getByLabel('Key').nth(1).fill('result');
    await page.getByLabel('Label').nth(1).fill('Result');
    await page.getByRole('button', { name: '+ Add' }).nth(2).click();
    await page.getByLabel('Key').nth(2).fill('report');
    await page.getByLabel('Label').nth(2).fill('Report');
    await page.getByLabel('Format').selectOption('markdown');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Start workflow' }).click();
    await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').textContent()).includes('Brief is required'), 'Expected required input validation');
    await page.getByLabel('Brief').fill('Measured campaign launch');
    await page.getByRole('button', { name: 'Start workflow' }).click();

    await page.getByText('Workflow run I/O').waitFor();
    await page.getByText('Measured campaign launch', { exact: true }).waitFor();
    await page.getByText(/WORKFLOW_HEART_OK/).waitFor();

    await page.getByRole('button', { name: 'Packs' }).click();
    await page.getByText('Pack Detail').waitFor();
    await page.getByRole('heading', { name: 'Workflow Heart Wrapper Pack' }).waitFor();

    console.log('[workflow-heart] Playwright smoke PASS');
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(`[workflow-heart] Playwright smoke FAIL: ${error.stack || error.message}`);
  process.exit(1);
});
