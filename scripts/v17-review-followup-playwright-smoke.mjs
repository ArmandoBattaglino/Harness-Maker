import fs from 'fs/promises';
import { existsSync } from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import { csrfMiddleware } from '../server/middleware/csrf.js';
import packsRouter from '../server/routes/packs.js';
import workflowsRouter from '../server/routes/workflows.js';
import { ConfigStore } from '../server/services/ConfigStore.js';
import { WorkflowStore } from '../server/services/WorkflowStore.js';
import PackStore from '../server/stores/PackStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(repoRoot, 'server', 'package.json'));
const express = serverRequire('express');
const { chromium, request: playwrightRequest } = serverRequire('playwright-core');

const browserCandidates = [
  process.env.V17_PLAYWRIGHT_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function findBrowserExecutable() {
  for (const candidate of browserCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`No Chrome/Edge executable found. Checked: ${browserCandidates.join(', ')}`);
}

function listen(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function createStaticServer(rootDir) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const candidate = path.resolve(rootDir, relativePath);
    const resolvedRoot = path.resolve(rootDir);
    const filePath = candidate.startsWith(resolvedRoot + path.sep) ? candidate : path.join(rootDir, 'index.html');
    const fallbackPath = path.join(rootDir, 'index.html');
    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      res.end(data);
    } catch {
      const data = await fs.readFile(fallbackPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    }
  });
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html';
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function workflowPayload() {
  return {
    name: 'Playwright Smoke Workflow',
    nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Work' } }],
    edges: [],
  };
}

function builderWorkflowPayload(uniqueName) {
  return {
    name: uniqueName,
    description: 'Workflow used by the builder-originated smoke.',
    nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A', systemPrompt: 'Produce the deterministic final answer.' } }],
    edges: [],
    settings: {},
    initialContext: {},
  };
}

function packPayload(workflowId) {
  return {
    name: 'Playwright Smoke Pack',
    category: 'qa',
    workflowId,
    packVersion: '1.0.0',
    status: 'draft',
    engineCompatibility: '^1.0.0',
    visibility: 'private',
    runtimePolicy: { provider: 'auto' },
    dependencies: [{ id: 'dep-workflow', type: 'workflow', targetId: workflowId, version: 'current', required: true }],
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    knowledgeSources: [],
    behaviorRules: [],
    outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    artifactDefinitions: [],
    visibleSteps: [{ id: 'step-a', label: 'Step A', nodeIds: ['agent-a'] }],
    completionCriteria: ['Done'],
  };
}

async function runApiSmoke() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v17-review-pw-api-'));
  let server;
  let api;
  try {
    const workflowStore = new WorkflowStore(tempDir);
    await workflowStore.init();
    const workflow = await workflowStore.create(workflowPayload());
    const packStore = new PackStore(tempDir, workflowStore);
    await packStore.init();
    const pack = await packStore.create(packPayload(workflow.id));
    const fixture = await packStore.saveFixture(pack.id, {
      name: 'Publish gate fixture',
      packVersion: pack.packVersion,
      input: {},
      assertions: [{ type: 'statusEquals', expected: 'completed' }],
    });

    const app = express();
    app.use(express.json());
    app.use(csrfMiddleware);
    app.locals.packStore = packStore;
    app.use('/api/v1/packs', packsRouter);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    });
    server = http.createServer(app);
    const address = await listen(server);
    api = await playwrightRequest.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
    const headers = { 'X-Requested-With': 'ClaudeCodeManager' };

    await packStore.saveFixtureResult(pack.id, {
      ...fixture,
      lastResult: {
        source: 'fixture-runner',
        packId: pack.id,
        packVersion: pack.packVersion,
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
        ranAt: new Date(Date.parse(pack.updatedAt) - 1000).toISOString(),
      },
    });
    const stalePublish = await api.post(`/api/v1/packs/${pack.id}/publish`, { headers });
    assert(stalePublish.status() === 409, `Expected stale publish to fail with 409, got ${stalePublish.status()}`);

    await packStore.update(pack.id, { ...pack, name: 'Playwright Smoke Pack Updated' });
    const invalidated = await packStore.getFixture(pack.id, fixture.id);
    assert(invalidated.lastResult === null, 'Expected PackStore.update() to clear fixture lastResult');
    const publishAfterUpdate = await api.post(`/api/v1/packs/${pack.id}/publish`, { headers });
    assert(publishAfterUpdate.status() === 409, `Expected publish after update invalidation to fail with 409, got ${publishAfterUpdate.status()}`);

    const updatedPack = await packStore.get(pack.id);
    await packStore.saveFixtureResult(pack.id, {
      ...invalidated,
      lastResult: {
        source: 'client-forged-source',
        packId: updatedPack.id,
        packVersion: updatedPack.packVersion,
        passed: true,
        assertions: [{ type: 'statusEquals', expected: 'completed', passed: true }],
        ranAt: new Date(Date.parse(updatedPack.updatedAt) + 1000).toISOString(),
      },
    });
    const refreshed = await packStore.getFixture(pack.id, fixture.id);
    assert(refreshed.lastResult.source === 'fixture-runner', 'Expected saveFixtureResult() to force fixture-runner source');
    const freshPublish = await api.post(`/api/v1/packs/${pack.id}/publish`, { headers });
    assert(freshPublish.status() === 200, `Expected fresh publish to pass with 200, got ${freshPublish.status()}`);

    const rollbackWorkflow = { id: 'rollback-wf', nodes: [{ id: 'agent-a' }] };
    const rollbackStore = new PackStore(tempDir, {
      create: async () => rollbackWorkflow,
      get: async () => rollbackWorkflow,
      delete: async () => false,
    });
    await rollbackStore.init();
    let rollbackError;
    try {
      await rollbackStore.importBundle({
        workflow: workflowPayload(),
        pack: { ...packPayload(workflow.id), name: '' },
      });
    } catch (err) {
      rollbackError = err;
    }
    assert(rollbackError?.rollbackFailed === true, 'Expected rollback delete=false to set rollbackFailed');
    assert(rollbackError?.rollbackWorkflowId === rollbackWorkflow.id, 'Expected rollbackWorkflowId metadata');

    console.log('[v17-review-followup] API smoke PASS');
  } finally {
    if (api) await api.dispose();
    if (server) await closeServer(server);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function runBrowserSmoke() {
  const publicDir = path.join(repoRoot, 'server', 'public');
  const executablePath = await findBrowserExecutable();
  const staticServer = createStaticServer(publicDir);
  const address = await listen(staticServer);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const packs = [
      {
        id: 'pack-1',
        name: 'Marketing Harness',
        description: 'Run marketing workflow',
        category: 'marketing',
        workflowId: 'wf-1',
        packVersion: '1.0.0',
        status: 'draft',
        inputSchema: {
          type: 'object',
          properties: { brief: { type: 'string', title: 'Brief', 'x-packField': { help: 'Campaign brief' } } },
          required: ['brief'],
        },
        artifactDefinitions: [{ id: 'artifact-1', name: 'Report', format: 'markdown' }],
        visibleSteps: [{ id: 'step-1', label: 'Draft', status: 'configured' }],
      },
      {
        id: 'pack-2',
        name: 'Sales Harness',
        description: 'Run sales workflow',
        category: 'sales',
        workflowId: 'wf-2',
        packVersion: '1.0.0',
        status: 'draft',
        inputSchema: { type: 'object', properties: {}, required: [] },
        artifactDefinitions: [],
        visibleSteps: [],
      },
    ];

    await page.route('**/api/v1/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [{ id: 'proj-1', name: 'Project One', path: 'C:/projects/one' }] }),
      });
    });
    await page.route('**/api/v1/packs', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ packs }),
      });
    });
    await page.route('**/api/v1/packs/pack-1', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pack: packs[0] }) });
    });
    await page.route('**/api/v1/packs/pack-2', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pack: packs[1] }) });
    });
    await page.route('**/api/v1/packs/pack-1/start', async (route) => {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Input validation failed' }) });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('ccvm-app-view', 'packs');
      window.localStorage.setItem('ccvm-active-project-id', 'proj-1');
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('Pack Detail').waitFor();
    await page.getByRole('button', { name: 'Launch pack' }).click();
    await page.getByRole('alert').waitFor();
    const alertText = await page.getByRole('alert').textContent();
    assert(alertText.includes('Input validation failed'), `Expected launch error alert, got ${alertText}`);
    await page.getByRole('button', { name: /Sales Harness/ }).click();
    await page.getByText('Run sales workflow').waitFor();
    assert(await page.getByRole('alert').count() === 0, 'Expected selected pack change to clear launch error');

    console.log('[v17-review-followup] Browser smoke PASS');
  } finally {
    if (browser) await browser.close();
    await closeServer(staticServer);
  }
}

function createDeterministicSwarmEngine(outputToken) {
  let counter = 0;
  const executions = new Map();

  function nextExecutionId() {
    counter += 1;
    return `33333333-3333-4333-8333-${String(counter).padStart(12, '0')}`;
  }

  return {
    async startExecution(workflowId, projectId, projectPath, options = {}) {
      const executionId = nextExecutionId();
      const packRun = {
        ...options.packMetadata,
        runtimePolicy: {
          ...(options.packMetadata?.runtimePolicy ?? {}),
          provider: options.runtimeProvider ?? options.packMetadata?.runtimePolicy?.provider ?? 'auto',
        },
        projectBinding: {
          projectId,
          projectPath,
        },
      };
      const packResult = {
        packId: packRun.packId,
        outputs: { result: outputToken },
        artifacts: (packRun.artifactDefinitions ?? []).map((artifact) => ({
          id: artifact.id,
          name: artifact.name,
          status: 'ready',
        })),
      };
      executions.set(executionId, {
        executionId,
        workflowId,
        status: 'completed',
        packRun,
        packResult,
      });
      return executionId;
    },
    getStatus(executionId) {
      const execution = executions.get(executionId);
      if (!execution) return null;
      return {
        executionId,
        workflowId: execution.workflowId,
        status: execution.status,
        packRun: execution.packRun,
        packMetadata: execution.packRun,
      };
    },
    getExecutionResult(executionId) {
      return executions.get(executionId) ?? null;
    },
  };
}

async function runBuilderLibraryLaunchSmoke() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'v17-review-pw-builder-'));
  const publicDir = path.join(repoRoot, 'server', 'public');
  const executablePath = await findBrowserExecutable();
  const outputToken = 'BUILDER_LIBRARY_OUTPUT_OK';
  const project = { id: 'proj-builder', name: 'Builder Smoke Project', path: 'C:/projects/builder-smoke' };
  const workflowName = `Builder Smoke Workflow ${Date.now()}`;
  const uniquePackName = `${workflowName} Builder Pack`;
  const originalGetProjects = ConfigStore.getProjects;
  let server;
  let browser;
  try {
    const workflowStore = new WorkflowStore(tempDir);
    await workflowStore.init();
    await workflowStore.create(builderWorkflowPayload(workflowName));
    const packStore = new PackStore(tempDir, workflowStore);
    await packStore.init();
    const swarmEngine = createDeterministicSwarmEngine(outputToken);

    ConfigStore.getProjects = () => [project];

    const app = express();
    app.use(express.json());
    app.use(csrfMiddleware);
    app.locals.workflowStore = workflowStore;
    app.locals.packStore = packStore;
    app.locals.swarmEngine = swarmEngine;
    app.get('/api/v1/projects', (_req, res) => {
      res.json({ projects: [project] });
    });
    app.get('/api/v1/swarm/:executionId/status', (req, res) => {
      const execution = swarmEngine.getExecutionResult(req.params.executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      return res.json({
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        status: execution.status,
        packRun: execution.packRun,
      });
    });
    app.get('/api/v1/swarm/executions/:executionId/results', (req, res) => {
      const execution = swarmEngine.getExecutionResult(req.params.executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      return res.json({
        executionId: execution.executionId,
        status: execution.status,
        packRun: execution.packRun,
        packResult: execution.packResult,
      });
    });
    app.use('/api/v1/workflows', workflowsRouter);
    app.use('/api/v1/packs', packsRouter);
    app.use(express.static(publicDir));
    app.get(/.*/, async (_req, res) => {
      res.type('html').send(await fs.readFile(path.join(publicDir, 'index.html'), 'utf8'));
    });
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    });

    server = http.createServer(app);
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.addInitScript((view, activeProjectId) => {
      window.localStorage.setItem('ccvm-app-view', view);
      window.localStorage.setItem('ccvm-active-project-id', activeProjectId);
    }, 'pack-builder', project.id);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('Vertical harness authoring').waitFor();
    await page.getByRole('button', { name: 'Create draft from workflow' }).click();
    await page.getByLabel('Name').waitFor();
    await page.getByLabel('Name').fill(uniquePackName);
    await page.getByRole('button', { name: 'Save pack' }).click();
    await page.getByText('saved').waitFor();
    await page.getByText('Packs').click();
    await page.getByText('Pack Detail').waitFor();
    await page.getByRole('heading', { name: uniquePackName }).waitFor();
    await page.getByRole('button', { name: 'Launch pack' }).click();
    await page.getByText(/Started execution 33333333-3333-4333-8333-/).waitFor();
    await page.getByRole('button', { name: 'Advanced debug' }).click();
    await page.getByText(outputToken).waitFor();
    await page.getByText('"packId"').waitFor();
    await page.getByText('"packVersion"').waitFor();
    const debugText = await page.locator('pre').textContent();
    assert(debugText.includes(outputToken), `Expected debug drawer to include output token, got ${debugText}`);
    assert(debugText.includes('"packVersion": "0.1.0"'), `Expected debug drawer to include pack version, got ${debugText}`);

    console.log('[v17-review-followup] Builder -> Library -> Launch smoke PASS');
  } finally {
    ConfigStore.getProjects = originalGetProjects;
    if (browser) await browser.close();
    if (server) await closeServer(server);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

await runApiSmoke();
await runBrowserSmoke();
await runBuilderLibraryLaunchSmoke();
console.log('[v17-review-followup] Playwright targeted smoke PASS');
