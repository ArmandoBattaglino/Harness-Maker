import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright-core';

const repoRoot = process.cwd();
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
