/**
 * check-server-freshness.mjs
 *
 * Guard against stale local server drift during client verification.
 *
 * Problem: if a server at a shared port (e.g. 127.0.0.1:3000) has been
 * running for a long time, it may be serving code from an earlier build.
 * Tests that pass or fail against it are not reliable indicators of the
 * current working tree state.
 *
 * What this script does:
 *  1. Fetches /health from the target URL to get process uptime.
 *  2. Scans key server source files to find the most-recently-modified one.
 *  3. If the most-recent source change is NEWER than the server start time
 *     (i.e. uptime > age of newest source change), the server is stale.
 *  4. If server uptime exceeds STALE_UPTIME_THRESHOLD_MINUTES, it warns
 *     unconditionally — the server may have drifted even without mtime evidence.
 *
 * Exit codes:
 *  0 — server is fresh (or --warn-only was passed and server is stale)
 *  1 — server is stale and --warn-only was NOT passed (blocks CI pipelines)
 *  2 — server unreachable (cannot assess freshness)
 *
 * Environment variables:
 *  SERVER_FRESHNESS_URL              Target base URL (default: http://127.0.0.1:3000)
 *  SERVER_FRESHNESS_THRESHOLD_MINUTES  Uptime threshold for unconditional warn (default: 30)
 *  SERVER_FRESHNESS_WARN_ONLY        Set to '1' to warn but not fail (default: unset = fail)
 *
 * CLI flags:
 *  --url <url>         Override SERVER_FRESHNESS_URL
 *  --warn-only         Override SERVER_FRESHNESS_WARN_ONLY
 *  --threshold <min>   Override SERVER_FRESHNESS_THRESHOLD_MINUTES
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing (simple, no external deps)
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const baseUrl =
  argValue('--url') ||
  process.env.SERVER_FRESHNESS_URL ||
  'http://127.0.0.1:3000';

const warnOnly =
  args.includes('--warn-only') ||
  process.env.SERVER_FRESHNESS_WARN_ONLY === '1';

const thresholdMinutes = Number.parseFloat(
  argValue('--threshold') ||
  process.env.SERVER_FRESHNESS_THRESHOLD_MINUTES ||
  '30'
);

// ---------------------------------------------------------------------------
// Source directories to scan for "newest modification time"
// We only scan server/ source files — the client build artefacts in
// server/public/ are intentionally excluded (they change on every build
// and are not a reliable staleness indicator by themselves).
// ---------------------------------------------------------------------------
const SOURCE_SCAN_DIRS = [
  path.join(repoRoot, 'server'),
];
const SOURCE_SCAN_EXCLUDES = new Set([
  path.join(repoRoot, 'server', 'public'),
  path.join(repoRoot, 'server', 'node_modules'),
  path.join(repoRoot, 'server', 'tests'),
]);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.json']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk a directory recursively and return mtimes of matching files.
 * @param {string} dir
 * @returns {Promise<number[]>} array of mtime timestamps (ms since epoch)
 */
async function collectMtimes(dir) {
  const mtimes = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return mtimes;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (SOURCE_SCAN_EXCLUDES.has(full)) continue;

    if (entry.isDirectory()) {
      const sub = await collectMtimes(full);
      mtimes.push(...sub);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      try {
        const stat = await fs.stat(full);
        mtimes.push(stat.mtimeMs);
      } catch {
        // ignore unreadable files
      }
    }
  }
  return mtimes;
}

/**
 * Fetch the /health endpoint and return the parsed body, or null on failure.
 * @param {string} url
 * @returns {Promise<{status:string, version:string, uptime:number}|null>}
 */
async function fetchHealth(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[freshness-check] Target: ${baseUrl}`);
  console.log(`[freshness-check] Uptime threshold: ${thresholdMinutes} minutes`);
  console.log(`[freshness-check] Mode: ${warnOnly ? 'warn-only (will not fail)' : 'strict (will exit 1 if stale)'}`);

  // 1. Probe the health endpoint
  const health = await fetchHealth(baseUrl);

  if (!health) {
    console.error(`[freshness-check] ERROR: Server at ${baseUrl} is not reachable or /health returned an error.`);
    console.error(`[freshness-check] Cannot assess freshness. Start the server first or check the URL.`);
    process.exit(2);
  }

  const uptimeSeconds = typeof health.uptime === 'number' ? health.uptime : 0;
  const uptimeMinutes = uptimeSeconds / 60;
  const serverVersion = health.version ?? 'unknown';

  console.log(`[freshness-check] Server responded: version=${serverVersion}, uptime=${formatDuration(uptimeSeconds)}`);

  let isStale = false;
  const staleReasons = [];

  // 2. Check unconditional uptime threshold
  if (uptimeMinutes > thresholdMinutes) {
    staleReasons.push(
      `Server uptime is ${formatDuration(uptimeSeconds)} which exceeds the ${thresholdMinutes}min threshold.` +
      ` The process may be serving code from an earlier build.`
    );
    isStale = true;
  }

  // 3. Compare newest source mtime vs server start time
  // Server start time (approximate) = now - uptime
  const nowMs = Date.now();
  const serverStartMs = nowMs - uptimeSeconds * 1000;

  let newestSourceMs = 0;
  let newestSourceFile = '';

  for (const dir of SOURCE_SCAN_DIRS) {
    const mtimes = await collectMtimes(dir);
    for (const mtime of mtimes) {
      if (mtime > newestSourceMs) {
        newestSourceMs = mtime;
      }
    }
  }

  // Also find the specific file for reporting
  if (newestSourceMs > 0) {
    outer: for (const dir of SOURCE_SCAN_DIRS) {
      const check = async (d) => {
        let entries;
        try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const full = path.join(d, entry.name);
          if (SOURCE_SCAN_EXCLUDES.has(full)) continue;
          if (entry.isDirectory()) { await check(full); }
          else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
            try {
              const stat = await fs.stat(full);
              if (stat.mtimeMs === newestSourceMs) {
                newestSourceFile = path.relative(repoRoot, full);
              }
            } catch { /* ignore */ }
          }
        }
      };
      await check(dir);
      if (newestSourceFile) break outer;
    }
  }

  if (newestSourceMs > serverStartMs) {
    const driftMs = newestSourceMs - serverStartMs;
    const driftSec = Math.round(driftMs / 1000);
    const changedAgo = Math.round((nowMs - newestSourceMs) / 1000);
    staleReasons.push(
      `Source file "${newestSourceFile}" was modified ${formatDuration(changedAgo)} ago,` +
      ` but the server started ${formatDuration(uptimeSeconds)} ago` +
      ` — the server is at least ${formatDuration(driftSec)} behind the working tree.`
    );
    isStale = true;
  }

  // 4. Report result
  if (!isStale) {
    console.log(`[freshness-check] PASS — server appears fresh (uptime=${formatDuration(uptimeSeconds)}, no source changes detected after server start).`);
    process.exit(0);
  }

  // Stale path
  console.warn('');
  console.warn('[freshness-check] WARNING: STALE SERVER DETECTED');
  console.warn('[freshness-check] ============================================================');
  for (const reason of staleReasons) {
    console.warn(`[freshness-check]   - ${reason}`);
  }
  console.warn('[freshness-check] ============================================================');
  console.warn('[freshness-check] Verification results against this server may not reflect the');
  console.warn('[freshness-check] current working tree. Restart the server before trusting results:');
  console.warn('[freshness-check]   npm start');
  console.warn('');

  if (warnOnly) {
    console.warn('[freshness-check] --warn-only is set: continuing despite stale server.');
    process.exit(0);
  } else {
    console.error('[freshness-check] Exiting with code 1. Pass --warn-only to suppress this failure.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[freshness-check] Unexpected error:', error.message);
  process.exit(1);
});
