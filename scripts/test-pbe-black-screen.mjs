#!/usr/bin/env node
/**
 * Test: does clicking "Edit Prompts" cause a black screen?
 * Requires: server running at http://127.0.0.1:3000
 */
import { existsSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(repoRoot, 'server', 'package.json'));
const { chromium } = serverRequire('playwright-core');

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findBrowser() {
  for (const c of browserCandidates) { if (existsSync(c)) return c; }
  throw new Error('No browser found');
}

const RESULTS = [];
function pass(n) { RESULTS.push({ n, ok: true }); console.log(`  PASS  ${n}`); }
function fail(n, r) { RESULTS.push({ n, ok: false, r }); console.log(`  FAIL  ${n} -- ${r}`); }

(async () => {
  const executablePath = findBrowser();
  const browser = await chromium.launch({ executablePath, headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  try {
    // 1. Navigate
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded', timeout: 10000 });
    pass('Page loaded');

    // 2. Go to Swarm
    await page.getByRole('button', { name: /Swarm/i }).click();
    await page.waitForTimeout(500);
    pass('Navigated to Swarm');

    // 3. Drag Agent Node to canvas
    const palette = page.getByText('Agent NodeAI agent with').first();
    const canvas = page.locator('[data-testid="rf__wrapper"]');
    if (await palette.isVisible({ timeout: 3000 }) && await canvas.isVisible({ timeout: 3000 })) {
      await palette.dragTo(canvas);
      await page.waitForTimeout(600);
      pass('Agent node dragged to canvas');
    } else {
      fail('Agent node drag', 'palette or canvas not found');
    }

    // 4. Click agent node
    const agentNode = page.locator('.react-flow__node-agent').first();
    if (await agentNode.isVisible({ timeout: 3000 })) {
      await agentNode.click();
      await page.waitForTimeout(400);
      pass('Agent node selected');
    } else {
      fail('Agent select', 'node not visible');
    }

    // 5. Verify Edit Prompts button exists
    const editBtn = page.getByText('Edit Prompts');
    if (await editBtn.isVisible({ timeout: 3000 })) {
      pass('Edit Prompts button visible');
    } else {
      fail('Edit Prompts button', 'not found');
    }

    // 6. Screenshot BEFORE
    await page.screenshot({ path: 'screenshots/test-pbe-before.png' });

    // 7. CLICK EDIT PROMPTS -- critical test
    consoleErrors.length = 0; // reset
    await editBtn.click();
    await page.waitForTimeout(1000); // wait for rAF + fitView + render

    // 8. Screenshot AFTER
    await page.screenshot({ path: 'screenshots/test-pbe-after.png' });

    // 9. Check for TDZ / JS errors
    if (consoleErrors.length === 0) {
      pass('No JavaScript errors after clicking Edit Prompts');
    } else {
      fail('JS errors', consoleErrors.join('; '));
    }

    // 10. Check canvas is still visible
    const viewport = page.locator('.react-flow__viewport').first();
    if (await viewport.isVisible({ timeout: 2000 })) {
      pass('React Flow viewport still visible (no black screen)');
    } else {
      fail('Black screen', 'React Flow viewport not visible');
    }

    // 11. Check prompt panel appeared
    const panel = page.locator('.nowheel.nodrag.nopan').first();
    if (await panel.isVisible({ timeout: 2000 })) {
      pass('PromptBlockEditor panel visible');
    } else {
      fail('Panel', 'PromptBlockEditor panel not visible');
    }

    // 12. Check blocks are shown in the panel
    const blockCards = page.locator('.nowheel.nodrag.nopan >> text=/Your Role|Protocol|Guardrails/');
    const blockCount = await blockCards.count();
    if (blockCount > 0) {
      pass(`Block cards visible (${blockCount} found)`);
    } else {
      fail('Block cards', 'no block cards found in panel');
    }

    // 13. Final screenshot
    await page.screenshot({ path: 'screenshots/test-pbe-final.png' });
    pass('Final screenshot captured');

  } catch (err) {
    fail('Unexpected error', err.message);
    await page.screenshot({ path: 'screenshots/test-pbe-error.png' }).catch(() => {});
  }

  // Summary
  console.log('\n=== RESULTS ===');
  const passed = RESULTS.filter(r => r.ok).length;
  const failed = RESULTS.filter(r => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    RESULTS.filter(r => !r.ok).forEach(r => console.log(`  - ${r.n}: ${r.r}`));
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
