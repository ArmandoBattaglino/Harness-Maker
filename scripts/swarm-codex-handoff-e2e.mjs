import fs from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const visualRoot = path.join(repoRoot, 'tests', 'visual', 'swarm');
const fixturesDir = path.join(visualRoot, 'fixtures');
const artifactsDir = path.join(visualRoot, 'artifacts');
const appDataRoot = path.join(visualRoot, '.codex-handoff-e2e-appdata');
const appDataConfigRoot = path.join(appDataRoot, 'ClaudeCodeManager');
const appDataWorkflowsDir = path.join(appDataConfigRoot, 'workflows');

const workflowFixtureName = 'codex-handoff-long.json';
const projectId = '9c28a6d7-725b-4c1b-8b2b-61ab6aa91c44';
const projectName = 'CodexHandoffE2E';
const port = Number.parseInt(process.env.SWARM_CODEX_HANDOFF_E2E_PORT ?? '3314', 10);
const baseUrl = `http://127.0.0.1:${port}`;
const viewport = { width: 1600, height: 1020 };
const runTimeoutMs = Number.parseInt(process.env.SWARM_CODEX_HANDOFF_E2E_WAIT_MS ?? '180000', 10);
const expectedMarker = 'TAIL-MARKER-OMEGA-9271';
const expectedWriterPrefix = `HANDOFF_OK ${expectedMarker} FORCED_CONTEXT`;
const prepareOnly = process.argv.includes('--prepare-only');
const reuseServer = process.argv.includes('--reuse-server') || process.env.SWARM_CODEX_HANDOFF_E2E_REUSE_SERVER === '1';
const terminalStatuses = new Set(['completed', 'stopped', 'failed']);
const browserCandidates = [
  process.env.SWARM_CODEX_HANDOFF_E2E_BROWSER,
  process.env.SWARM_VISREG_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const screenshotPath = path.join(artifactsDir, 'codex-handoff-e2e.png');
const bodyDumpPath = path.join(artifactsDir, 'codex-handoff-e2e.txt');
const summaryPath = path.join(artifactsDir, 'codex-handoff-e2e.summary.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function loadFixture() {
  const fixturePath = path.join(fixturesDir, workflowFixtureName);
  return JSON.parse(await fs.readFile(fixturePath, 'utf8'));
}

async function resetHarnessAppData(fixture) {
  await fs.rm(appDataRoot, { recursive: true, force: true });
  await ensureDir(appDataWorkflowsDir);

  const config = {
    version: '1',
    projects: [
      {
        id: projectId,
        name: projectName,
        path: repoRoot,
        createdAt: new Date().toISOString(),
      },
    ],
    settings: {
      port: 3000,
      idleTimeoutMinutes: 30,
    },
  };

  await fs.writeFile(
    path.join(appDataConfigRoot, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  const workflow = {
    ...fixture,
    projectId,
  };

  await fs.writeFile(
    path.join(appDataWorkflowsDir, `${workflow.id}.json`),
    JSON.stringify(workflow, null, 2)
  );
}

async function waitForHealth(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (_) {
      // Ignore until timeout.
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/health`);
}

async function isServerHealthy(timeoutMs = 2000) {
  try {
    await waitForHealth(timeoutMs);
    return true;
  } catch (_) {
    return false;
  }
}

async function startIsolatedServer() {
  await ensureDir(artifactsDir);

  const stdoutPath = path.join(artifactsDir, 'codex-handoff-e2e-server.out.log');
  const stderrPath = path.join(artifactsDir, 'codex-handoff-e2e-server.err.log');
  const stdoutStream = createWriteStream(stdoutPath, { flags: 'w' });
  const stderrStream = createWriteStream(stderrPath, { flags: 'w' });

  // Use 'node server/index.js' directly instead of 'npm run start' to skip the
  // client Vite rebuild step.  server/public already contains the compiled client,
  // so the rebuild is pure waste and can consume 60-120 s on a cold machine,
  // leaving insufficient time for the health-check + openSwarm waitForFunction.
  const command = process.execPath; // node binary used to launch this script
  const args = [path.join(repoRoot, 'server', 'index.js')];

  let child;
  try {
    child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        NO_OPEN: '1',
        PORT: String(port),
        APPDATA: appDataRoot,
      },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'EINVAL') {
      throw new Error(
        [
          `Unable to launch the isolated Codex handoff E2E server (${error.code}).`,
          'Prepare the fixture appdata and reuse an already running server instead:',
          '1. node scripts/swarm-codex-handoff-e2e.mjs --prepare-only',
          `2. In PowerShell: $env:APPDATA='${appDataRoot}'; $env:PORT='${port}'; $env:NO_OPEN='1'; node server/index.js`,
          '3. node scripts/swarm-codex-handoff-e2e.mjs --reuse-server',
        ].join('\n')
      );
    }
    throw error;
  }

  child.stdout.pipe(stdoutStream);
  child.stderr.pipe(stderrStream);

  try {
    await waitForHealth();
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }

  return child;
}

/**
 * Verify that the fixture workflow is present in the server and inject it if absent.
 *
 * This is required when --reuse-server is used because the target server may have
 * been started with different app-data that does not contain the fixture workflow.
 * Failing late with "Workflow X could not be selected in the Swarm UI" is opaque;
 * a preflight check surfaces the issue before the browser is opened.
 */
async function preflightWorkflowCheck(fixture) {
  // Try GET /api/v1/workflows/:id
  let workflowPresent = false;
  try {
    const response = await fetch(`${baseUrl}/api/v1/workflows/${fixture.id}`, {
      headers: { 'X-Requested-With': 'ClaudeCodeManager' },
    });
    workflowPresent = response.ok;
  } catch (_) {
    // Network error — server may still be starting; treat as absent.
  }

  if (workflowPresent) {
    console.log(`Preflight: fixture workflow ${fixture.id} already present in server.`);
    return;
  }

  console.log(
    `Preflight: fixture workflow ${fixture.id} not found in server at ${baseUrl}. ` +
    'Attempting to inject via POST /api/v1/workflows...'
  );

  // Inject the fixture workflow so the browser can select it.
  const injectResponse = await fetch(`${baseUrl}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'ClaudeCodeManager',
    },
    body: JSON.stringify({ ...fixture }),
  });

  if (!injectResponse.ok) {
    const body = await injectResponse.text().catch(() => '(unreadable)');
    throw new Error(
      [
        `Preflight FAILED: could not inject fixture workflow into ${baseUrl} (HTTP ${injectResponse.status}).`,
        `Response: ${body}`,
        'Start the server with the correct APPDATA pointing to the harness directory instead:',
        '1. node scripts/swarm-codex-handoff-e2e.mjs --prepare-only',
        `2. In PowerShell: $env:APPDATA='${appDataRoot}'; $env:PORT='${port}'; $env:NO_OPEN='1'; node server/index.js`,
        '3. node scripts/swarm-codex-handoff-e2e.mjs --reuse-server',
      ].join('\n')
    );
  }

  console.log(`Preflight: fixture workflow injected successfully.`);
}

async function acquireServer(fixture) {
  if (prepareOnly) {
    await resetHarnessAppData(fixture);
    console.log(`Prepared Codex handoff E2E appdata at ${appDataRoot}`);
    return null;
  }

  if (reuseServer) {
    // In --reuse-server mode the user controls the server process.
    // Verify it is healthy first, then ensure the fixture workflow is present.
    if (!(await isServerHealthy())) {
      throw new Error(
        `No running Swarm server found at ${baseUrl}. Start one first, then rerun with --reuse-server.`
      );
    }
    console.log(`Reusing running Swarm server at ${baseUrl}`);
    await preflightWorkflowCheck(fixture);
    return null;
  }

  // Isolated mode: always reset app-data and spawn a fresh server.
  // Do NOT reuse a server that happens to be alive on the port — it may have been
  // started with different app-data and would silently lack the fixture workflow.
  await resetHarnessAppData(fixture);
  return startIsolatedServer();
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        shell: false,
        stdio: 'ignore',
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

function getBrowserPath() {
  for (const candidate of browserCandidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'No supported browser executable found. Set SWARM_CODEX_HANDOFF_E2E_BROWSER to a local Chrome/Edge path.'
  );
}

async function setRuntimeProvider(page, runtimeValue) {
  return page.evaluate((selectedValue) => {
    const select = Array.from(document.querySelectorAll('select')).find((entry) =>
      Array.from(entry.options).some((option) => ['auto', 'claude', 'codex', 'gemini'].includes(option.value))
    );
    if (!select) return false;
    if (!Array.from(select.options).some((option) => option.value === selectedValue && !option.disabled)) {
      return false;
    }
    select.value = selectedValue;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, runtimeValue);
}

async function selectWorkflow(page, workflowId) {
  return page.evaluate((selectedValue) => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const select of selects) {
      if (Array.from(select.options).some((option) => option.value === selectedValue)) {
        select.value = selectedValue;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, workflowId);
}

async function dumpDebugSnapshot(page, label) {
  const debug = await page.evaluate(() => ({
    title: document.title,
    body: document.body.innerText.slice(0, 5000),
    buttons: Array.from(document.querySelectorAll('button'))
      .map((button) => button.innerText.trim())
      .filter(Boolean),
    selects: Array.from(document.querySelectorAll('select')).map((select) =>
      Array.from(select.options).map((option) => ({
        text: option.text,
        value: option.value,
        selected: option.selected,
      }))
    ),
  }));
  console.error(`DEBUG ${label}: ${JSON.stringify(debug, null, 2)}`);
}

async function openSwarm(page) {
  await page.addInitScript(({ activeProjectId }) => {
    window.localStorage.setItem('ccvm-active-project-id', activeProjectId);
    window.localStorage.setItem('ccvm-app-view', 'swarm');
  }, { activeProjectId: projectId });

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => document.body.innerText.includes('Saved workflows'), { timeout: 30000 });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

async function waitForExecutionCompletion(executionId) {
  const deadline = Date.now() + runTimeoutMs;
  let lastStatus = 'unknown';

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/swarm/${executionId}/status`);
    if (response.ok) {
      const payload = await response.json();
      lastStatus = payload.status ?? 'unknown';
      if (terminalStatuses.has(lastStatus)) {
        return payload;
      }
    }
    await sleep(1500);
  }

  throw new Error(`Timed out waiting for execution ${executionId}. Last status: ${lastStatus}`);
}

async function getExecutionResults(executionId, workflowId) {
  const response = await fetch(
    `${baseUrl}/api/v1/swarm/executions/${executionId}/results?workflowId=${workflowId}`
  );
  if (!response.ok) {
    throw new Error(`Failed to load execution results (${response.status}) for ${executionId}`);
  }
  return response.json();
}

async function collectPageSnapshot(page) {
  return page.evaluate(() => {
    const nodeTexts = Array.from(document.querySelectorAll('.react-flow__node'))
      .map((node) => node.innerText.trim())
      .filter(Boolean);
    const panels = Array.from(document.querySelectorAll('aside, [class*="feed"], [class*="chat"], [class*="History"]'))
      .map((element) => element.innerText.trim())
      .filter((text) => text && text.length > 20)
      .slice(0, 20);
    return {
      bodyText: document.body.innerText,
      nodeTexts,
      panels,
    };
  });
}

async function run() {
  const fixture = await loadFixture();
  const server = await acquireServer(fixture);
  if (prepareOnly) {
    return;
  }

  const browserPath = getBrowserPath();
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  });
  const page = await browser.newPage({ viewport });

  try {
    await openSwarm(page);
    await setRuntimeProvider(page, 'auto');
    await page.waitForTimeout(400);

    const selected = await selectWorkflow(page, fixture.id);
    if (!selected) {
      await dumpDebugSnapshot(page, 'workflow-not-found');
      throw new Error(`Workflow ${fixture.id} could not be selected in the Swarm UI.`);
    }

    await page.getByRole('button', { name: /Load workflow/i }).click({ timeout: 15000 });
    await page.waitForFunction(
      (nodeCount) => document.querySelectorAll('.react-flow__node').length >= nodeCount,
      fixture.nodes.length,
      { timeout: 20000 }
    );
    await page.waitForTimeout(1200);

    const startResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && /\/api\/v1\/swarm\/[^/]+\/start$/.test(response.url())
    );

    const runButton = page.getByRole('button', { name: /^Run$/i });
    await runButton.click({ timeout: 15000 });

    const startResponse = await startResponsePromise;
    const startPayload = await startResponse.json();
    if (!startResponse.ok || !startPayload?.executionId) {
      await dumpDebugSnapshot(page, 'start-failed');
      throw new Error(`Swarm start failed: ${JSON.stringify(startPayload)}`);
    }

    const executionId = startPayload.executionId;
    const finalStatus = await waitForExecutionCompletion(executionId);
    await page.waitForTimeout(1500);

    const results = await getExecutionResults(executionId, fixture.id);
    const snapshot = await collectPageSnapshot(page);
    const writerOutput = String(results.agentOutputs?.['node-b']?.finalText ?? '');
    const writerStatus = results.agentOutputs?.['node-b']?.status ?? 'missing';
    const researcherHandoff = results.agentOutputs?.['node-a']?.handoffPayloads?.[0]?.payload ?? null;
    const failures = [];

    if (!researcherHandoff || typeof researcherHandoff !== 'object') {
      failures.push('Researcher did not produce a structured handoff payload.');
    } else {
      if (!String(researcherHandoff.currentTask ?? '').includes(expectedMarker)) {
        failures.push('Researcher handoff payload is missing the expected tail marker.');
      }
      if (!['true', true].includes(researcherHandoff.forcedHandoff)) {
        failures.push('Researcher handoff was expected to be a forced downstream context handoff.');
      }
    }

    if (writerStatus !== 'done') {
      failures.push(`Writer did not finish cleanly (status: ${writerStatus}).`);
    }

    if (/handoff truncated/i.test(writerOutput) || /handoff truncated/i.test(snapshot.bodyText)) {
      failures.push('Writer reported a truncated handoff.');
    }

    if (!writerOutput.includes(expectedWriterPrefix)) {
      failures.push('Writer output is missing the expected success marker.');
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await fs.writeFile(
      bodyDumpPath,
      [
        snapshot.bodyText,
        '',
        '--- NODE TEXTS ---',
        ...snapshot.nodeTexts,
        '',
        '--- PANELS ---',
        ...snapshot.panels,
      ].join('\n'),
      'utf8'
    );

    const summary = {
      workflowId: fixture.id,
      executionId,
      finalExecutionStatus: finalStatus.status ?? 'unknown',
      writerStatus,
      expectedWriterPrefix,
      writerOutput,
      researcherHandoff,
      screenshotPath,
      bodyDumpPath,
      failures,
    };

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
