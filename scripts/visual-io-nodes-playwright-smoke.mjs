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
  id: 'wf-visual-io',
  name: 'Visual IO Smoke',
  description: 'Verify visual Input and Output Extractor nodes drive direct-run contracts.',
  nodes: [
    {
      id: 'input-a',
      type: 'input',
      position: { x: 60, y: 120 },
      data: {
        label: 'Creative intake',
        prompt: 'Provide the creative brief and reference image.',
        fields: [
          { id: 'field-brief', key: 'brief', label: 'Brief', type: 'text', required: true, helpText: 'Campaign brief' },
          { id: 'field-image', key: 'reference_image', label: 'Reference image', type: 'image', required: true, helpText: 'Upload reference image' },
        ],
      },
    },
    { id: 'agent-a', type: 'agent', position: { x: 320, y: 120 }, data: { label: 'Agent A', expectedOutputContract: { format: 'markdown', instructions: 'Return a report.' } } },
    { id: 'extract-a', type: 'outputExtractor', position: { x: 600, y: 120 }, data: { label: 'Report extractor', artifactKey: 'report', artifactName: 'Report', format: 'markdown', instruction: 'Extract the final report.' } },
  ],
  edges: [
    { id: 'e-input-agent', source: 'input-a', target: 'agent-a' },
    { id: 'e-agent-output', source: 'agent-a', target: 'extract-a' },
  ],
  settings: {},
  initialContext: {},
  inputContract: [{ key: 'legacy', label: 'Legacy', type: 'text', required: true }],
  outputContract: { outputs: [], artifacts: [] },
  updatedAt: new Date().toISOString(),
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
  let capturedInput = null;
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/v1/projects', (_req, res) => res.json({ projects: [{ id: 'proj-visual-io', name: 'Visual IO Project', path: 'C:/projects/visual-io' }] }));
  app.get('/api/v1/workflows', (_req, res) => res.json({ workflows: [workflowState] }));
  app.get('/api/v1/workflows/wf-visual-io', (_req, res) => res.json({ workflow: workflowState }));
  app.post('/api/v1/workflows', (req, res) => {
    workflowState = { ...workflowState, ...req.body, id: 'wf-visual-io', updatedAt: new Date().toISOString() };
    res.status(201).json({ workflow: workflowState });
  });
  app.put('/api/v1/workflows/wf-visual-io', (req, res) => {
    workflowState = { ...workflowState, ...req.body, id: 'wf-visual-io', updatedAt: new Date().toISOString() };
    res.json({ workflow: workflowState });
  });
  app.get('/api/v1/swarm/runtime-capabilities', (_req, res) => res.json({
    providers: { claude: ['claude-sonnet'], codex: ['gpt-5.4'], gemini: [] },
    defaults: { claude: 'claude-sonnet', codex: 'gpt-5.4', gemini: '' },
    availability: { claude: true, codex: true, gemini: false },
  }));
  app.post('/api/v1/swarm/wf-visual-io/start', (req, res) => {
    capturedInput = req.body?.workflowInput ?? {};
    assert(capturedInput.brief === 'Visual launch brief', 'brief input should be submitted');
    assert(capturedInput.reference_image?.mimeType === 'image/png', 'image metadata should include mimeType');
    assert(!capturedInput.reference_image?.data, 'image input must not submit raw base64 data');
    res.status(201).json({
      executionId: '55555555-5555-4555-8555-000000000001',
      workflowId: workflow.id,
      status: 'completed',
      runtimeProvider: 'codex',
      activeProvider: 'codex',
      providerStrategy: { mode: 'auto', activeProvider: 'codex' },
      workflowRun: { kind: 'workflow-direct', inputs: capturedInput, inputContract: workflowState.inputContract, outputContract: workflowState.outputContract, visualInputMode: true, visualOutputMode: true },
      workflowResult: {
        status: 'completed',
        inputs: capturedInput,
        outputs: {},
        artifacts: [{ id: 'report', name: 'Report', format: 'markdown', status: 'ready', source: 'outputExtractor', sourceNodeId: 'agent-a', value: '# VISUAL_IO_OK\n\nVisual launch brief' }],
      },
    });
  });
  app.get('/api/v1/swarm/55555555-5555-4555-8555-000000000001/status', (_req, res) => res.json({ status: 'completed' }));
  app.get('/api/v1/swarm/executions/55555555-5555-4555-8555-000000000001/results', (_req, res) => res.json({
    executionId: '55555555-5555-4555-8555-000000000001',
    workflowName: workflow.name,
    status: 'completed',
    agentOutputs: {},
    aggregatedArtifact: '# VISUAL_IO_OK\n\nVisual launch brief',
  }));
  app.use((req, res) => serveStatic(req, res, publicDir));
  app.locals.getCapturedInput = () => capturedInput;
  return app;
}

async function main() {
  const publicDir = path.join(repoRoot, 'server', 'public');
  assert(existsSync(path.join(publicDir, 'index.html')), 'server/public build is missing; run npm run build first');
  const executablePath = await findBrowserExecutable();
  const app = createApp(publicDir);
  const server = http.createServer(app);
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.addInitScript(() => {
      window.localStorage.setItem('ccvm-app-view', 'swarm');
      window.localStorage.setItem('ccvm-active-project-id', 'proj-visual-io');
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await page.locator('select').filter({ hasText: 'Visual IO Smoke' }).first().selectOption('wf-visual-io');
    await page.getByRole('button', { name: 'Load' }).click();
    await page.getByText('Input Block').first().waitFor();
    await page.getByText('Output Extractor').first().waitFor();

    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('heading', { name: 'Run workflow' }).waitFor();
    await page.getByRole('heading', { name: 'Creative intake' }).waitFor();
    await page.getByLabel('Brief').fill('Visual launch brief');
    await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
      name: 'reference.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    await page.getByText(/raw base64 is not submitted/i).waitFor();
    await page.getByRole('button', { name: 'Start workflow' }).click();

    await page.getByText('Workflow run I/O').waitFor();
    await page.getByText('Visual launch brief', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Report' }).waitFor();
    await page.getByRole('button', { name: 'Report' }).click();
    await page.getByText(/VISUAL_IO_OK/).waitFor();
    assert(app.locals.getCapturedInput()?.reference_image?.mimeType === 'image/png', 'captured image metadata missing');
    console.log('[visual-io] Playwright smoke PASS');
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(`[visual-io] Playwright smoke FAIL: ${error.stack || error.message}`);
  process.exit(1);
});

