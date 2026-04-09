import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const artifactsDir = path.join(repoRoot, 'tests', 'artifacts');
const screenshotPath = path.join(artifactsDir, 'swarm-e2e-chat-check.png');
const bodyDumpPath = path.join(artifactsDir, 'swarm-e2e-chat-check.txt');

const baseUrl = process.env.SWARM_E2E_URL || 'http://127.0.0.1:3000';
const browserPath = process.env.SWARM_E2E_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const projectNeedle = process.env.SWARM_E2E_PROJECT || 'Prova';
const workflowNeedle = process.env.SWARM_E2E_WORKFLOW || 'Parallel Greetings Workflow';
const runtimeNeedle = process.env.SWARM_E2E_RUNTIME || 'codex';
const runWaitMs = Number.parseInt(process.env.SWARM_E2E_WAIT_MS || '70000', 10);
const ACTIVE_PROJECT_STORAGE_KEY = 'ccvm-active-project-id';
const APP_VIEW_STORAGE_KEY = 'ccvm-app-view';

const badPatterns = [
  /HANDOFF:/i,
  /__HANDOFF__/i,
  /Now using extra/i,
  /extra usage/i,
  /Opus4\.6withmediumeffort/i,
  /\buminating\b/i,
  /Generaunsalutoinun/i,
  /Agent-B:greeting/i,
  /k now t ha t/i,
  /Ilmiocompito/i,
  /dupl i che r à/i,
  /Hello t here/i,
  /\bbr i ght\b/i,
];

// ---------------------------------------------------------------------------
// Freshness guard — warn if the target server may be serving stale code.
//
// This script always targets a shared/long-running server (default: :3000).
// If the server has been up longer than SWARM_E2E_FRESHNESS_THRESHOLD_MINUTES
// (default 30), or if source files were modified after the server started,
// we emit a clear warning so results are not misread as current-code regressions.
//
// Environment variables:
//   SWARM_E2E_SKIP_FRESHNESS_CHECK=1          — bypass entirely (known-fresh CI env)
//   SWARM_E2E_FRESHNESS_THRESHOLD_MINUTES=N   — uptime threshold in minutes (default 30)
// ---------------------------------------------------------------------------
async function checkServerFreshness() {
  if (process.env.SWARM_E2E_SKIP_FRESHNESS_CHECK === '1') {
    console.log('[freshness-check] Skipped (SWARM_E2E_SKIP_FRESHNESS_CHECK=1).');
    return;
  }

  const thresholdMinutes = Number.parseFloat(
    process.env.SWARM_E2E_FRESHNESS_THRESHOLD_MINUTES || '30'
  );

  // Fetch /health
  let health = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) health = await res.json();
  } catch {
    // Server not reachable — main() will surface this more clearly
    console.warn('[freshness-check] Could not reach /health — skipping freshness check.');
    return;
  }

  const uptimeSeconds = typeof health?.uptime === 'number' ? health.uptime : 0;
  const serverVersion = health?.version ?? 'unknown';
  const uptimeMinutes = uptimeSeconds / 60;

  function fmt(sec) {
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
  }

  console.log(`[freshness-check] Server at ${baseUrl}: version=${serverVersion}, uptime=${fmt(uptimeSeconds)}`);

  const staleReasons = [];

  // Threshold check
  if (uptimeMinutes > thresholdMinutes) {
    staleReasons.push(
      `Uptime ${fmt(uptimeSeconds)} exceeds ${thresholdMinutes}min threshold — ` +
      `server may be serving code from an earlier build.`
    );
  }

  // Source-file mtime check: scan server/ (excluding public/, node_modules/, tests/)
  const serverDir = path.join(repoRoot, 'server');
  const excludes = new Set([
    path.join(serverDir, 'public'),
    path.join(serverDir, 'node_modules'),
    path.join(serverDir, 'tests'),
  ]);
  const exts = new Set(['.js', '.mjs', '.json']);
  const nowMs = Date.now();
  const serverStartMs = nowMs - uptimeSeconds * 1000;

  let newestMs = 0;
  let newestFile = '';

  async function walkMtimes(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (excludes.has(full)) continue;
      if (entry.isDirectory()) { await walkMtimes(full); }
      else if (entry.isFile() && exts.has(path.extname(entry.name))) {
        try {
          const stat = await fs.stat(full);
          if (stat.mtimeMs > newestMs) {
            newestMs = stat.mtimeMs;
            newestFile = path.relative(repoRoot, full);
          }
        } catch { /* ignore */ }
      }
    }
  }

  await walkMtimes(serverDir);

  if (newestMs > serverStartMs) {
    const driftSec = Math.round((newestMs - serverStartMs) / 1000);
    const changedAgo = Math.round((nowMs - newestMs) / 1000);
    staleReasons.push(
      `"${newestFile}" was modified ${fmt(changedAgo)} ago but server started ` +
      `${fmt(uptimeSeconds)} ago — server is ~${fmt(driftSec)} behind the working tree.`
    );
  }

  if (staleReasons.length === 0) {
    console.log('[freshness-check] PASS — server appears fresh.');
    return;
  }

  console.warn('');
  console.warn('[freshness-check] *** STALE SERVER WARNING ***');
  console.warn('[freshness-check] Results from this run may NOT reflect the current working tree.');
  for (const reason of staleReasons) {
    console.warn(`[freshness-check]   - ${reason}`);
  }
  console.warn('[freshness-check] Restart the server before trusting these results:');
  console.warn('[freshness-check]   npm start');
  console.warn('[freshness-check] Or target a fresh isolated server via SWARM_E2E_URL.');
  console.warn('');
}

async function ensureArtifactsDir() {
  await fs.mkdir(artifactsDir, { recursive: true });
}

async function findOptionValue(page, needle) {
  return page.evaluate((workflowNeedleText) => {
    const selects = Array.from(document.querySelectorAll('select'));
    for (const select of selects) {
      const option = Array.from(select.options).find((entry) =>
        entry.text.toLowerCase().includes(workflowNeedleText.toLowerCase())
      );
      if (option) {
        return option.value;
      }
    }
    return null;
  }, needle);
}

async function selectOptionValue(page, value) {
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
  }, value);
}

async function selectRuntimeProvider(page, runtimeValue) {
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

async function dumpDebugSnapshot(page, label) {
  const debug = await page.evaluate(() => ({
    title: document.title,
    body: document.body.innerText.slice(0, 5000),
    buttons: Array.from(document.querySelectorAll('button')).map((button) => button.innerText.trim()).filter(Boolean),
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

async function main() {
  await ensureArtifactsDir();
  await checkServerFreshness();

  const projectsResponse = await fetch(`${baseUrl}/api/v1/projects`);
  if (!projectsResponse.ok) {
    throw new Error(`Failed to load projects from ${baseUrl}/api/v1/projects (${projectsResponse.status})`);
  }
  const projectsPayload = await projectsResponse.json();
  const activeProject = (projectsPayload.projects ?? []).find((project) =>
    project?.name?.toLowerCase().includes(projectNeedle.toLowerCase())
  );
  if (!activeProject?.id) {
    throw new Error(`Project containing "${projectNeedle}" not found.`);
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  try {
    await page.addInitScript(({ activeProjectId }) => {
      window.localStorage.setItem('ccvm-active-project-id', activeProjectId);
      window.localStorage.setItem('ccvm-app-view', 'swarm');
    }, { activeProjectId: activeProject.id });

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1500);

    if (!await page.locator('text=Saved workflows').first().isVisible().catch(() => false)) {
      const swarmButton = page.getByRole('button', { name: /Swarm/i }).first();
      await swarmButton.click({ timeout: 15000 });
      await page.waitForTimeout(1000);
    }

    await page.waitForFunction(() => document.body.innerText.includes('Saved workflows'), { timeout: 20000 });

    await selectRuntimeProvider(page, runtimeNeedle);
    await page.waitForTimeout(400);

    const workflowValue = await findOptionValue(page, workflowNeedle);
    if (!workflowValue) {
      await dumpDebugSnapshot(page, 'workflow-not-found');
      throw new Error(`Workflow containing "${workflowNeedle}" not found in any select.`);
    }

    const selected = await selectOptionValue(page, workflowValue);

    if (!selected) {
      throw new Error(`Unable to select workflow value ${workflowValue}.`);
    }

    await page.getByRole('button', { name: /Load workflow/i }).click({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length >= 4, { timeout: 20000 });
    await page.waitForTimeout(1000);

    const runButton = page.getByRole('button', { name: /^Run$/i });
    try {
      await runButton.click({ timeout: 15000 });
    } catch (error) {
      await dumpDebugSnapshot(page, 'run-disabled');
      throw error;
    }
    await page.waitForTimeout(runWaitMs);

    const snapshot = await page.evaluate(() => {
      const nodeTexts = Array.from(document.querySelectorAll('.react-flow__node')).map((node) => node.innerText.trim()).filter(Boolean);
      const bodyText = document.body.innerText;
      const chatCards = Array.from(document.querySelectorAll('[class*="chat"], [class*="Chat"]'))
        .map((element) => element.innerText.trim())
        .filter((text) => text && text.length > 20)
        .slice(0, 20);
      return { bodyText, nodeTexts, chatCards };
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await fs.writeFile(bodyDumpPath, `${snapshot.bodyText}\n\n--- NODE TEXTS ---\n${snapshot.nodeTexts.join('\n\n---\n\n')}\n`, 'utf8');

    const hits = badPatterns
      .map((pattern) => {
        const match = snapshot.bodyText.match(pattern);
        return match ? { pattern: pattern.toString(), match: match[0] } : null;
      })
      .filter(Boolean);

    const summary = {
      workflowNeedle,
      projectNeedle,
      activeProjectId: activeProject.id,
      runtimeNeedle,
      screenshotPath,
      bodyDumpPath,
      badPatternHits: hits,
      finalReporterExcerpt: snapshot.bodyText.includes('Final Reporter')
        ? snapshot.bodyText.slice(snapshot.bodyText.indexOf('Final Reporter'), snapshot.bodyText.indexOf('Final Reporter') + 1200)
        : '',
      nodeTexts: snapshot.nodeTexts,
      chatCards: snapshot.chatCards,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (hits.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
