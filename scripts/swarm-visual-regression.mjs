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
const baselinesDir = path.join(visualRoot, 'baselines');
const artifactsDir = path.join(visualRoot, 'artifacts');
const appDataRoot = path.join(visualRoot, '.appdata');
const appDataConfigRoot = path.join(appDataRoot, 'ClaudeCodeManager');
const appDataWorkflowsDir = path.join(appDataConfigRoot, 'workflows');

const port = Number.parseInt(process.env.SWARM_VISREG_PORT ?? '3310', 10);
const baseUrl = `http://127.0.0.1:${port}`;
const updateBaselines = process.argv.includes('--update');
const prepareOnly = process.argv.includes('--prepare-only');
const reuseServer = process.argv.includes('--reuse-server') || process.env.SWARM_VISREG_REUSE_SERVER === '1';
const viewport = { width: 1460, height: 920 };
const diffPixelThreshold = 18;
const maxChangedPixels = 140;
const browserCandidates = [
  process.env.SWARM_VISREG_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const cases = [
  {
    id: 'parallel-greetings-overview',
    fixture: 'parallel-greetings.json',
    focus: false,
  },
  {
    id: 'parallel-greetings-merge-selected',
    fixture: 'parallel-greetings.json',
    focus: true,
    selectNodeLabel: 'Merge Node',
  },
  {
    id: 'research-loop-overview',
    fixture: 'research-loop.json',
    focus: false,
  },
  {
    id: 'research-loop-analyst-selected',
    fixture: 'research-loop.json',
    focus: true,
    selectNodeLabel: 'Analyst',
  },
  {
    id: 'flow-control-overview',
    fixture: 'flow-control.json',
    focus: false,
  },
  {
    id: 'infinite-loop-v2-overview',
    fixture: 'infinite-loop-v2.json',
    focus: false,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function resetHarnessAppData() {
  await fs.rm(appDataRoot, { recursive: true, force: true });
  await ensureDir(appDataWorkflowsDir);

  const fixtureFiles = await fs.readdir(fixturesDir);
  for (const fileName of fixtureFiles) {
    if (!fileName.endsWith('.json')) continue;
    const sourcePath = path.join(fixturesDir, fileName);
    const fixture = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    const targetPath = path.join(appDataWorkflowsDir, `${fixture.id}.json`);
    await fs.writeFile(targetPath, JSON.stringify(fixture, null, 2));
  }
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

  const stdoutPath = path.join(artifactsDir, 'visual-regression-server.out.log');
  const stderrPath = path.join(artifactsDir, 'visual-regression-server.err.log');
  const stdoutStream = createWriteStream(stdoutPath, { flags: 'w' });
  const stderrStream = createWriteStream(stderrPath, { flags: 'w' });

  const command = process.platform === 'win32'
    ? (process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe')
    : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm run start']
    : ['run', 'start'];

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
          `Unable to launch the isolated Swarm server (${error.code}).`,
          'Prepare the fixture appdata and reuse an already running server instead:',
          '1. node scripts/swarm-visual-regression.mjs --prepare-only',
          `2. In PowerShell: $env:APPDATA='${appDataRoot}'; $env:PORT='${port}'; $env:NO_OPEN='1'; npm run start`,
          '3. node scripts/swarm-visual-regression.mjs --reuse-server',
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

async function acquireServer() {
  if (prepareOnly) {
    await resetHarnessAppData();
    console.log(`Prepared Swarm visual regression appdata at ${appDataRoot}`);
    return null;
  }

  if (await isServerHealthy()) {
    console.log(`Reusing running Swarm server at ${baseUrl}`);
    return null;
  }

  if (reuseServer) {
    throw new Error(
      `No running Swarm server found at ${baseUrl}. Start one first, then rerun with --reuse-server.`
    );
  }

  await resetHarnessAppData();
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
    'No supported browser executable found. Set SWARM_VISREG_BROWSER to a local Chrome/Edge path.'
  );
}

function toDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function compareImages(browser, baselineBuffer, actualBuffer) {
  const page = await browser.newPage({ viewport: { width: 32, height: 32 } });

  try {
    const result = await page.evaluate(
      async ({ baselineDataUrl, actualDataUrl, threshold }) => {
        const loadImage = (src) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to load image'));
            image.src = src;
          });

        const [baseline, actual] = await Promise.all([
          loadImage(baselineDataUrl),
          loadImage(actualDataUrl),
        ]);

        if (baseline.width !== actual.width || baseline.height !== actual.height) {
          return {
            sameSize: false,
            width: actual.width,
            height: actual.height,
            changedPixels: Number.POSITIVE_INFINITY,
            totalPixels: actual.width * actual.height,
            diffDataUrl: null,
          };
        }

        const canvas = document.createElement('canvas');
        canvas.width = baseline.width;
        canvas.height = baseline.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        context.drawImage(baseline, 0, 0);
        const baselineData = context.getImageData(0, 0, canvas.width, canvas.height);

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(actual, 0, 0);
        const actualData = context.getImageData(0, 0, canvas.width, canvas.height);

        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = canvas.width;
        diffCanvas.height = canvas.height;
        const diffContext = diffCanvas.getContext('2d');
        const diffImage = diffContext.createImageData(canvas.width, canvas.height);

        let changedPixels = 0;

        for (let index = 0; index < baselineData.data.length; index += 4) {
          const delta = Math.max(
            Math.abs(baselineData.data[index] - actualData.data[index]),
            Math.abs(baselineData.data[index + 1] - actualData.data[index + 1]),
            Math.abs(baselineData.data[index + 2] - actualData.data[index + 2]),
            Math.abs(baselineData.data[index + 3] - actualData.data[index + 3])
          );

          if (delta > threshold) {
            changedPixels += 1;
            diffImage.data[index] = 255;
            diffImage.data[index + 1] = 0;
            diffImage.data[index + 2] = 140;
            diffImage.data[index + 3] = 255;
          } else {
            const gray = Math.round(
              (actualData.data[index] + actualData.data[index + 1] + actualData.data[index + 2]) / 3
            );
            diffImage.data[index] = gray;
            diffImage.data[index + 1] = gray;
            diffImage.data[index + 2] = gray;
            diffImage.data[index + 3] = 36;
          }
        }

        diffContext.putImageData(diffImage, 0, 0);

        return {
          sameSize: true,
          width: canvas.width,
          height: canvas.height,
          changedPixels,
          totalPixels: canvas.width * canvas.height,
          diffDataUrl: changedPixels > 0 ? diffCanvas.toDataURL('image/png') : null,
        };
      },
      {
        baselineDataUrl: toDataUrl(baselineBuffer),
        actualDataUrl: toDataUrl(actualBuffer),
        threshold: diffPixelThreshold,
      }
    );

    return result;
  } finally {
    await page.close();
  }
}

async function openSwarm(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const swarmButton = page.locator('button').filter({ hasText: 'Swarm' }).first();
  await swarmButton.click();
  await page.waitForFunction(() => document.body.innerText.includes('Saved workflows'));

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

async function loadWorkflow(page, workflowId, expectedNodes) {
  const workflowSelect = page.locator('select').nth(1);
  await workflowSelect.selectOption({ value: workflowId });
  await page.getByRole('button', { name: /Load workflow/i }).click();
  await page.waitForFunction(
    (nodeCount) => document.querySelectorAll('.react-flow__node').length >= nodeCount,
    expectedNodes
  );
  await sleep(1000);
}

async function setFocusMode(page, enabled) {
  const focusButton = page.getByRole('button', { name: 'Focus' });
  const className = (await focusButton.getAttribute('class')) ?? '';
  const isEnabled = className.includes('bg-sky-700');

  if (isEnabled !== enabled) {
    await focusButton.click();
    await sleep(250);
  }
}

async function selectNode(page, label) {
  const node = page.locator('.react-flow__node').filter({ hasText: label }).first();
  await node.waitFor({ state: 'visible' });
  await node.click({ force: true });
  await sleep(500);
}

async function captureCase(browser, workflowFixtures, testCase) {
  const fixture = workflowFixtures.get(testCase.fixture);
  const page = await browser.newPage({ viewport });

  try {
    await openSwarm(page);
    await loadWorkflow(page, fixture.id, fixture.nodes.length);
    await setFocusMode(page, testCase.focus);

    if (testCase.selectNodeLabel) {
      await selectNode(page, testCase.selectNodeLabel);
    }

    const flowLocator = page.locator('.react-flow').first();
    await flowLocator.waitFor({ state: 'visible' });
    await sleep(300);
    return await flowLocator.screenshot();
  } finally {
    await page.close();
  }
}

async function writeArtifacts(fileName, buffer, diffDataUrl = null) {
  await ensureDir(artifactsDir);
  await fs.writeFile(path.join(artifactsDir, fileName), buffer);

  if (diffDataUrl) {
    const diffBuffer = Buffer.from(diffDataUrl.split(',')[1], 'base64');
    await fs.writeFile(path.join(artifactsDir, fileName.replace('.png', '.diff.png')), diffBuffer);
  }
}

async function loadFixtures() {
  const entries = await fs.readdir(fixturesDir);
  const fixtureMap = new Map();

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const fixture = JSON.parse(await fs.readFile(path.join(fixturesDir, entry), 'utf8'));
    fixtureMap.set(entry, fixture);
  }

  return fixtureMap;
}

async function run() {
  await ensureDir(baselinesDir);
  await ensureDir(artifactsDir);

  const server = await acquireServer();
  if (prepareOnly) {
    return;
  }

  const browserPath = getBrowserPath();
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  });

  const fixtures = await loadFixtures();
  const failures = [];

  try {
    for (const testCase of cases) {
      const actualBuffer = await captureCase(browser, fixtures, testCase);
      const baselinePath = path.join(baselinesDir, `${testCase.id}.png`);
      const artifactPath = `${testCase.id}.actual.png`;

      if (updateBaselines) {
        await fs.writeFile(baselinePath, actualBuffer);
        await writeArtifacts(artifactPath, actualBuffer);
        console.log(`Updated baseline: ${testCase.id}`);
        continue;
      }

      if (!existsSync(baselinePath)) {
        failures.push(`${testCase.id}: missing baseline (${baselinePath})`);
        await writeArtifacts(artifactPath, actualBuffer);
        continue;
      }

      const baselineBuffer = await fs.readFile(baselinePath);
      const comparison = await compareImages(browser, baselineBuffer, actualBuffer);
      await writeArtifacts(artifactPath, actualBuffer, comparison.diffDataUrl);

      if (!comparison.sameSize || comparison.changedPixels > maxChangedPixels) {
        failures.push(
          `${testCase.id}: ${comparison.changedPixels} pixels changed (limit ${maxChangedPixels})`
        );
        continue;
      }

      console.log(`PASS ${testCase.id}: ${comparison.changedPixels} pixels changed`);
    }
  } finally {
    await browser.close();
    await stopServer(server);
  }

  if (failures.length > 0) {
    console.error('\nSwarm visual regression failures:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(updateBaselines ? '\nBaselines updated successfully.' : '\nSwarm visual regression suite passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
