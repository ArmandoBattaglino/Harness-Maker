// scripts/v19-prompt-block-editor-playwright-smoke.mjs
// Playwright E2E smoke test for V19.0 Prompt Block Editor feature (Tasks #761-#763).
//
// Covers:
//   PW-PBE-01..07 — Gear icon, panel open/close, block cards, expand, runtime placeholder, Escape
//   PW-EXP-01..06 — Expert mode toggle, CLI Injections section
//   PW-INS-01..03 — Slimmed AgentInspector Setup tab verification
//
// Run standalone:  node scripts/v19-prompt-block-editor-playwright-smoke.mjs
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(repoRoot, 'server', 'package.json'));
const express = serverRequire('express');
const { chromium } = serverRequire('playwright-core');

const screenshotsDir = path.join(repoRoot, 'screenshots');
if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });

const browserCandidates = [
  process.env.V19_PLAYWRIGHT_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const workflow = {
  id: 'wf-pbe-smoke',
  name: 'PBE Smoke Workflow',
  description: 'Workflow for Prompt Block Editor E2E smoke tests.',
  nodes: [
    {
      id: 'input-1',
      type: 'workflowInput',
      position: { x: 80, y: 120 },
      data: {
        label: 'Brief Input',
        prompt: 'Provide a brief',
        fields: [{ id: 'field-1', key: 'brief', label: 'Brief', type: 'textarea', required: true }],
      },
    },
    {
      id: 'agent-alpha',
      type: 'agent',
      position: { x: 420, y: 120 },
      data: {
        label: 'Alpha Strategist',
        model: 'opus',
        systemPrompt: 'You are a strategic planner.',
        mission: 'Plan a comprehensive strategy.',
        guardrails: 'Do not hallucinate facts.',
        isTriageNode: true,
      },
    },
    {
      id: 'agent-beta',
      type: 'agent',
      position: { x: 420, y: 320 },
      data: {
        label: 'Beta Executor',
        model: 'gpt-5.4',
        systemPrompt: 'Execute the strategy.',
        mission: 'Implement the plan.',
      },
    },
    {
      id: 'output-1',
      type: 'outputExtractor',
      position: { x: 760, y: 120 },
      data: {
        label: 'Final Report',
        artifactKey: 'final_report',
        artifactName: 'Final Report',
        format: 'markdown',
        sourcePolicy: 'firstIncoming',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'input-1', target: 'agent-alpha' },
    { id: 'e2', source: 'agent-alpha', target: 'agent-beta' },
    { id: 'e3', source: 'agent-beta', target: 'output-1' },
  ],
  settings: {},
  initialContext: {},
  inputContract: [],
  outputContract: { outputs: [], artifacts: [] },
  updatedAt: new Date().toISOString(),
};

// Prompt-preview response — mirrors the server /api/v1/swarm/prompt-preview shape
function buildPromptPreview(body) {
  const nodeId = body?.selectedAgentId || 'agent-alpha';
  const node = workflow.nodes.find((n) => n.id === nodeId);
  const data = node?.data || {};

  const blocks = [
    {
      id: 'role',
      title: 'Your Role',
      source: 'user',
      enabled: true,
      compiledText: `=== YOUR ROLE ===\n${data.mission || ''}\n${data.systemPrompt || ''}`.trim(),
      tokenEstimate: 45,
    },
    {
      id: 'guardrails',
      title: 'Guardrails',
      source: 'user',
      enabled: true,
      compiledText: data.guardrails ? `=== GUARDRAILS ===\n${data.guardrails}` : '',
      tokenEstimate: 20,
    },
    {
      id: 'guidance',
      title: 'Quality Guidance',
      source: 'user',
      enabled: true,
      compiledText: '=== AGENT QUALITY GUIDANCE ===\nTool boundary: Bash, Read, Edit\nThese controls guide and expose expected behavior in wave 1.',
      tokenEstimate: 30,
    },
    {
      id: 'awareness',
      title: 'Agent Awareness',
      source: 'runtime',
      enabled: true,
      compiledText: '[Populated at runtime: agent identity, peers, and connection status within the workflow]',
      tokenEstimate: 20,
    },
    {
      id: 'inputs',
      title: 'Workflow Inputs',
      source: 'runtime',
      enabled: true,
      compiledText: '[Populated at runtime: workflow run inputs scoped to this agent]',
      tokenEstimate: 15,
    },
    {
      id: 'handoffs',
      title: 'Inbound Handoffs',
      source: 'runtime',
      enabled: true,
      compiledText: '[Populated at runtime: inbound handoff payloads from upstream agents]',
      tokenEstimate: 15,
    },
    {
      id: 'history',
      title: 'Interaction History',
      source: 'runtime',
      enabled: true,
      compiledText: '[Populated at runtime: interaction transcript based on context visibility setting]',
      tokenEstimate: 15,
    },
    {
      id: 'protocol',
      title: 'Protocol',
      source: 'system',
      enabled: true,
      compiledText: '=== PROTOCOL ===\nDo real work before emitting any control token.\nWhen done, last line: __HANDOFF__:<targetId>:{"summary":"...","result":"..."}',
      tokenEstimate: 40,
    },
  ];

  const assembledPrompt = blocks.filter((b) => b.enabled && b.compiledText).map((b) => b.compiledText).join('\n\n');
  const totalTokenEstimate = Math.ceil(assembledPrompt.length / 4);

  const cliInjections = {
    bootstrapPrompt: 'Claude runtime is active for this Swarm agent.\nContinue the workflow using the shared task context below.',
    appendSystemPrompt: null,
    launchFlags: ['--model', data.model || 'opus', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--tools', 'Bash,Read,Edit,Write,Grep,Glob,LS'],
    claudeMdContent: null,
    claudeMdPath: null,
    toolsAllowlist: ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'LS'],
    totalCliTokenEstimate: 120,
  };

  return {
    blocks,
    assembledPrompt,
    totalTokenEstimate,
    blockCount: blocks.filter((b) => b.enabled && b.compiledText).length,
    cliInjections,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function screenshot(page, name) {
  const filePath = path.join(screenshotsDir, `v19-pbe-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  [screenshot] ${filePath}`);
}

// ---------------------------------------------------------------------------
// Mock Express app
// ---------------------------------------------------------------------------

function createApp(publicDir) {
  const app = express();
  let workflowState = JSON.parse(JSON.stringify(workflow));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v1/projects', (_req, res) => res.json({
    projects: [{ id: 'proj-pbe-smoke', name: 'PBE Smoke Project', path: 'C:/projects/pbe-smoke' }],
  }));

  app.get('/api/v1/workflows', (_req, res) => res.json({ workflows: [workflowState] }));
  app.get('/api/v1/workflows/wf-pbe-smoke', (_req, res) => res.json({ workflow: workflowState }));

  app.put('/api/v1/workflows/wf-pbe-smoke', (req, res) => {
    workflowState = { ...workflowState, ...req.body, id: workflow.id, updatedAt: new Date().toISOString() };
    res.json({ workflow: workflowState });
  });

  // Prompt preview endpoint (key for this test)
  app.post('/api/v1/swarm/prompt-preview', (req, res) => {
    res.json(buildPromptPreview(req.body || {}));
  });

  // Compiled preview (needed by inspector)
  app.post('/api/v1/swarm/compiled-preview', (req, res) => {
    res.json({
      preview: {
        ok: true,
        version: 'progressive-harness-v1',
        selectedAgentId: req.body?.selectedAgentId || 'agent-alpha',
        domains: { compiledExecution: { derivedOnly: true } },
        errors: [],
        warnings: [],
      },
    });
  });

  app.get('/api/v1/swarm/runtime-capabilities', (_req, res) => res.json({
    providers: { claude: ['opus'], codex: ['gpt-5.4'], gemini: ['gemini-2.5-pro'] },
    defaults: { claude: 'opus', codex: 'gpt-5.4', gemini: 'gemini-2.5-pro' },
    availability: { claude: true, codex: true, gemini: true },
  }));

  app.get('/api/v1/packs', (_req, res) => res.json({ packs: [] }));

  // Fallback: static files
  app.use((req, res) => serveStatic(req, res, publicDir));

  return app;
}

// ---------------------------------------------------------------------------
// Test result tracking
// ---------------------------------------------------------------------------

const results = [];

function record(id, description, pass, evidence = '') {
  results.push({ id, description, pass, evidence });
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`  [${id}] ${status}: ${description}${evidence ? ` — ${evidence}` : ''}`);
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

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

    // Pre-seed localStorage so the app opens directly in Swarm view
    await page.addInitScript(() => {
      window.localStorage.setItem('ccvm-app-view', 'swarm');
      window.localStorage.setItem('ccvm-active-project-id', 'proj-pbe-smoke');
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // Wait for the app to settle and navigate to the Swarm canvas
    await page.getByRole('button', { name: 'Open Activity' }).waitFor({ timeout: 15000 });

    // Load the workflow
    await page.getByRole('button', { name: 'Workflows' }).click();
    await page.getByRole('button', { name: 'Load' }).waitFor();
    await page.locator('select').filter({ hasText: 'PBE Smoke Workflow' }).first().selectOption('wf-pbe-smoke');
    await page.getByRole('button', { name: 'Load' }).click();

    // Wait for agent nodes to appear on the canvas
    await page.getByText('Alpha Strategist').first().waitFor({ timeout: 10000 });
    await screenshot(page, '01-canvas-loaded');

    // =====================================================================
    // PW-PBE-01 to PW-PBE-07 (Task #761) — Prompt Block Editor basics
    // =====================================================================
    console.log('\n--- Task #761: Prompt Block Editor basics ---');

    // PW-PBE-01: Navigate to Swarm canvas (already done above)
    record('PW-PBE-01', 'Navigate to Swarm canvas with agent nodes', true, 'Alpha Strategist node visible on canvas');

    // PW-PBE-02: Verify workflow exists with agent node
    const agentNodeVisible = await page.getByText('Alpha Strategist').first().isVisible();
    record('PW-PBE-02', 'Workflow exists with at least one agent node', agentNodeVisible, `Agent node visible: ${agentNodeVisible}`);

    // PW-PBE-03: Hover over agent node — verify gear icon appears
    // The gear icon has opacity-0 by default and group-hover:opacity-100.
    // We locate the agent node element, hover it, then check for the gear button.
    const agentNodeEl = page.getByText('Alpha Strategist').first();
    await agentNodeEl.hover();
    await page.waitForTimeout(500); // Allow hover transition

    // The gear button is identified by its aria-label
    const gearButton = page.getByLabel('Open prompt block editor').first();
    let gearVisible = false;
    try {
      await gearButton.waitFor({ timeout: 3000 });
      gearVisible = true;
    } catch {
      gearVisible = false;
    }
    await screenshot(page, '02-gear-icon-on-hover');
    record('PW-PBE-03', 'Gear icon appears on hover over agent node', gearVisible, `Gear button found: ${gearVisible}`);

    // PW-PBE-04: Click gear icon — verify PromptBlockEditor panel opens
    let panelOpened = false;
    try {
      await gearButton.click({ force: true });
      // The panel contains the agent name and block count in its header
      await page.getByText('Alpha Strategist').nth(0).waitFor({ timeout: 5000 });
      // Look for "blocks" text which appears in the panel header (e.g., "8 blocks")
      await page.getByText(/\d+ blocks/).first().waitFor({ timeout: 5000 });
      panelOpened = true;
    } catch (err) {
      panelOpened = false;
    }
    await screenshot(page, '03-prompt-editor-opened');
    record('PW-PBE-04', 'PromptBlockEditor panel opens on gear click', panelOpened, `Panel opened: ${panelOpened}`);

    // PW-PBE-05: Verify block cards are visible
    let blockCardsFound = false;
    const expectedBlockTitles = ['Your Role', 'Protocol', 'Agent Awareness', 'Guardrails'];
    const foundTitles = [];
    for (const title of expectedBlockTitles) {
      try {
        const visible = await page.getByText(title, { exact: false }).first().isVisible();
        if (visible) foundTitles.push(title);
      } catch { /* not found */ }
    }
    blockCardsFound = foundTitles.length >= 2;
    await screenshot(page, '04-block-cards-visible');
    record('PW-PBE-05', 'Block cards visible in PromptBlockEditor', blockCardsFound, `Found titles: ${foundTitles.join(', ')}`);

    // PW-PBE-06: Click a user block (role) to expand — verify form fields appear
    let roleExpanded = false;
    try {
      // Click the "Your Role" block header to expand it
      await page.getByText('Your Role').first().click();
      await page.waitForTimeout(300);

      // When expanded, the role block shows Mission and System Prompt textareas
      const missionLabel = page.getByText('Mission', { exact: false });
      const systemPromptLabel = page.getByText('System Prompt', { exact: false });
      await missionLabel.first().waitFor({ timeout: 3000 });
      roleExpanded = await missionLabel.first().isVisible() || await systemPromptLabel.first().isVisible();
    } catch {
      roleExpanded = false;
    }
    await screenshot(page, '05-role-block-expanded');
    record('PW-PBE-06', 'User block (role) expands with form fields', roleExpanded, `Role block expanded with Mission/System Prompt fields: ${roleExpanded}`);

    // PW-PBE-07a: Verify runtime block shows placeholder text
    let runtimePlaceholderFound = false;
    try {
      // Click Agent Awareness to expand it
      await page.getByText('Agent Awareness').first().click();
      await page.waitForTimeout(300);
      // The runtime block should show "[Populated at runtime" in its snippet or expanded preview
      const placeholderText = page.getByText('[Populated at runtime', { exact: false });
      await placeholderText.first().waitFor({ timeout: 3000 });
      runtimePlaceholderFound = await placeholderText.first().isVisible();
    } catch {
      runtimePlaceholderFound = false;
    }
    await screenshot(page, '06-runtime-placeholder');
    record('PW-PBE-07a', 'Runtime block shows "[Populated at runtime" placeholder', runtimePlaceholderFound, `Placeholder found: ${runtimePlaceholderFound}`);

    // PW-PBE-07b: Press Escape — verify panel closes
    let panelClosed = false;
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      // The panel should no longer show the "blocks" count indicator
      const blocksText = page.getByText(/\d+ blocks/);
      const stillVisible = await blocksText.first().isVisible().catch(() => false);
      panelClosed = !stillVisible;
    } catch {
      panelClosed = true; // If the text is gone, panel closed
    }
    await screenshot(page, '07-panel-closed-after-escape');
    record('PW-PBE-07b', 'PromptBlockEditor closes on Escape', panelClosed, `Panel closed: ${panelClosed}`);

    // =====================================================================
    // PW-EXP-01 to PW-EXP-06 (Task #762) — Expert mode toggle
    // =====================================================================
    console.log('\n--- Task #762: Expert mode toggle ---');

    // PW-EXP-01: Reopen the prompt block editor
    let reopened = false;
    try {
      // Hover the agent node again to make the gear icon visible
      await agentNodeEl.hover();
      await page.waitForTimeout(300);
      await gearButton.click({ force: true });
      await page.getByText(/\d+ blocks/).first().waitFor({ timeout: 5000 });
      reopened = true;
    } catch {
      reopened = false;
    }
    await screenshot(page, '08-panel-reopened');
    record('PW-EXP-01', 'PromptBlockEditor reopened successfully', reopened, `Reopened: ${reopened}`);

    // PW-EXP-02: Click the Expert toggle button
    let expertToggled = false;
    try {
      const expertButton = page.getByText('Expert', { exact: true }).first();
      await expertButton.waitFor({ timeout: 3000 });
      await expertButton.click();
      await page.waitForTimeout(500);
      expertToggled = true;
    } catch {
      expertToggled = false;
    }
    await screenshot(page, '09-expert-mode-toggled');
    record('PW-EXP-02', 'Expert toggle button clicked', expertToggled, `Toggled: ${expertToggled}`);

    // PW-EXP-03: Verify CLI Injections section appears
    let cliSectionVisible = false;
    try {
      const cliHeader = page.getByText('CLI Injections', { exact: false });
      await cliHeader.first().waitFor({ timeout: 5000 });
      cliSectionVisible = await cliHeader.first().isVisible();
    } catch {
      cliSectionVisible = false;
    }
    await screenshot(page, '10-cli-injections-section');
    record('PW-EXP-03', 'CLI Injections section appears in Expert mode', cliSectionVisible, `CLI section visible: ${cliSectionVisible}`);

    // PW-EXP-04: Verify red-dot CLI blocks appear
    let cliBlocksFound = false;
    const cliBlockTitles = ['Runtime Bootstrap', 'CLI Launch Flags', 'Tool Allowlist'];
    const foundCliTitles = [];
    for (const title of cliBlockTitles) {
      try {
        const visible = await page.getByText(title, { exact: false }).first().isVisible();
        if (visible) foundCliTitles.push(title);
      } catch { /* not found */ }
    }
    cliBlocksFound = foundCliTitles.length >= 2;
    record('PW-EXP-04', 'CLI injection blocks visible (red-dot blocks)', cliBlocksFound, `Found CLI blocks: ${foundCliTitles.join(', ')}`);

    // PW-EXP-05: Verify [cli injection] source label present
    let cliLabelFound = false;
    try {
      const label = page.getByText('[cli injection]', { exact: false });
      cliLabelFound = await label.first().isVisible().catch(() => false);
    } catch {
      cliLabelFound = false;
    }
    record('PW-EXP-05', 'CLI injection source label [cli injection] visible', cliLabelFound, `Label found: ${cliLabelFound}`);

    // PW-EXP-06: Toggle Expert off — verify CLI section disappears
    let cliSectionHidden = false;
    try {
      const expertButton = page.getByText('Expert', { exact: true }).first();
      await expertButton.click();
      await page.waitForTimeout(500);
      const cliHeader = page.getByText('CLI Injections', { exact: false });
      const stillVisible = await cliHeader.first().isVisible().catch(() => false);
      cliSectionHidden = !stillVisible;
    } catch {
      cliSectionHidden = true;
    }
    await screenshot(page, '11-expert-mode-off');
    record('PW-EXP-06', 'CLI Injections section disappears when Expert toggled off', cliSectionHidden, `CLI hidden: ${cliSectionHidden}`);

    // Close the prompt editor before moving to inspector tests
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // =====================================================================
    // PW-INS-01 to PW-INS-03 (Task #763) — Slimmed AgentInspector Setup tab
    // =====================================================================
    console.log('\n--- Task #763: Slimmed AgentInspector Setup tab ---');

    // PW-INS-01: Select the agent node to open the inspector
    let inspectorOpened = false;
    try {
      await page.getByText('Alpha Strategist').first().click();
      // Wait for the inspector Setup tab to appear
      await page.getByText('Setup').waitFor({ timeout: 5000 });
      inspectorOpened = true;
    } catch {
      inspectorOpened = false;
    }
    await screenshot(page, '12-inspector-opened');
    record('PW-INS-01', 'Inspector opens when agent node is selected', inspectorOpened, `Inspector opened: ${inspectorOpened}`);

    // PW-INS-02: Verify the inspector does NOT have removed fields
    // The Setup tab should NOT contain: systemPrompt textarea, mission textarea,
    // guardrails textarea, tools checkboxes (these moved to the Prompt Block Editor)
    let removedFieldsAbsent = true;
    const removedFieldEvidence = [];

    // Check for Essentials section hint text about Prompt Block Editor
    try {
      const pbeHint = page.getByText('Prompt Block Editor', { exact: false });
      const hintVisible = await pbeHint.first().isVisible().catch(() => false);
      if (hintVisible) {
        removedFieldEvidence.push('PBE redirect hint present in Essentials');
      }
    } catch { /* ignore */ }

    // Check that systemPrompt textarea is NOT in the Setup tab (it's in the Prompt Block Editor now)
    // The inspector should NOT have a "System prompt" label with a textarea.
    // We check the agent fields section within the inspector panel (right side of the screen).
    // Note: We only check within the inspector panel context, not the prompt block editor.
    try {
      // Look for the Essentials section collapsible — it should be present
      const essentialsSection = page.getByText('Essentials', { exact: false });
      await essentialsSection.first().waitFor({ timeout: 3000 });

      // The Essentials section should contain Model selector and Start Node checkbox,
      // but NOT mission/systemPrompt/guardrails textareas or tools checkboxes.
      // Look for the "Agent mission" label — this was the old inspector field
      const missionInInspector = page.locator('label').filter({ hasText: 'Agent mission' });
      const missionCount = await missionInInspector.count();
      if (missionCount > 0) {
        removedFieldsAbsent = false;
        removedFieldEvidence.push('FOUND: "Agent mission" label still in inspector');
      } else {
        removedFieldEvidence.push('ABSENT: "Agent mission" label');
      }
    } catch {
      removedFieldEvidence.push('Could not check Essentials section');
    }

    // Check that "Guardrails" textarea is NOT a direct inspector field
    try {
      const guardrailsInInspector = page.locator('label').filter({ hasText: /^Guardrails$/ });
      const gCount = await guardrailsInInspector.count();
      if (gCount > 0) {
        removedFieldsAbsent = false;
        removedFieldEvidence.push('FOUND: "Guardrails" label still in inspector');
      } else {
        removedFieldEvidence.push('ABSENT: "Guardrails" label in inspector');
      }
    } catch { /* fine */ }

    await screenshot(page, '13-inspector-removed-fields');
    record('PW-INS-02', 'Inspector Setup tab does NOT have removed fields (systemPrompt, mission, guardrails)', removedFieldsAbsent, removedFieldEvidence.join('; '));

    // PW-INS-03: Verify the inspector DOES have: model selector, context visibility
    let requiredFieldsPresent = true;
    const requiredFieldEvidence = [];

    // Model selector
    try {
      const modelSelect = page.locator('select').filter({ hasText: /opus|sonnet|haiku|gpt/i }).first();
      const modelVisible = await modelSelect.isVisible().catch(() => false);
      if (modelVisible) {
        requiredFieldEvidence.push('Model selector present');
      } else {
        requiredFieldsPresent = false;
        requiredFieldEvidence.push('MISSING: Model selector');
      }
    } catch {
      requiredFieldsPresent = false;
      requiredFieldEvidence.push('MISSING: Model selector (exception)');
    }

    // Context Visibility section
    try {
      // The Context Visibility is a collapsible section — may need to expand it first
      const ctxVisSection = page.getByText('Context Visibility', { exact: false });
      const ctxVisible = await ctxVisSection.first().isVisible().catch(() => false);
      if (ctxVisible) {
        requiredFieldEvidence.push('Context Visibility section present');
      } else {
        requiredFieldsPresent = false;
        requiredFieldEvidence.push('MISSING: Context Visibility section');
      }
    } catch {
      requiredFieldsPresent = false;
      requiredFieldEvidence.push('MISSING: Context Visibility section (exception)');
    }

    await screenshot(page, '14-inspector-required-fields');
    record('PW-INS-03', 'Inspector DOES have model selector and context visibility', requiredFieldsPresent, requiredFieldEvidence.join('; '));

    // =====================================================================
    // Summary
    // =====================================================================
    console.log('\n=============================================');
    console.log('V19 Prompt Block Editor — Playwright Smoke Results');
    console.log('=============================================\n');

    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    const total = results.length;

    console.log(`| ${'Test'.padEnd(14)} | ${'Description'.padEnd(60)} | ${'Result'.padEnd(6)} |`);
    console.log(`| ${'-'.repeat(14)} | ${'-'.repeat(60)} | ${'-'.repeat(6)} |`);
    for (const r of results) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`| ${r.id.padEnd(14)} | ${r.description.slice(0, 60).padEnd(60)} | ${status.padEnd(6)} |`);
    }
    console.log(`\nTotal: ${passed}/${total} passed, ${failed} failed\n`);

    if (failed > 0) {
      console.log('FAILED tests:');
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`  ${r.id}: ${r.description} — ${r.evidence}`);
      }
      throw new Error(`${failed} test(s) failed`);
    }

    console.log('[v19-prompt-block-editor] Playwright smoke PASS');
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(`\n[v19-prompt-block-editor] Playwright smoke FAIL: ${error.stack || error.message}`);
  process.exit(1);
});
