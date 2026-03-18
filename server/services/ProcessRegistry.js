// server/services/ProcessRegistry.js
// Tracks active child process PIDs across server restarts.
// Persists to %APPDATA%\ClaudeCodeManager\active_pids.json (same dir as config).

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import writeFileAtomic from 'write-file-atomic';
import { ConfigStore } from './ConfigStore.js';

// tree-kill is CommonJS only — use createRequire to import it
const require = createRequire(import.meta.url);
const treeKill = require('tree-kill');

const PIDS_FILE_NAME = 'active_pids.json';

// ---------------------------------------------------------------------------
// PID validation
// ---------------------------------------------------------------------------

const MIN_PID = 1;
const MAX_PID = 65535; // safe upper bound; covers all realistic OS PID ranges

/**
 * Returns true if pid is a valid OS process identifier: a positive integer
 * in the range [1, 65535]. Values outside this range are rejected to prevent
 * a tampered active_pids.json from triggering kills of unrelated OS processes.
 *
 * @param {unknown} pid
 * @returns {boolean}
 */
function isValidPid(pid) {
  return typeof pid === 'number' && Number.isInteger(pid) && pid >= MIN_PID && pid <= MAX_PID;
}

function getPidsFilePath() {
  return path.join(ConfigStore.CONFIG_DIR, PIDS_FILE_NAME);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readRegistry() {
  const filePath = getPidsFilePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    // Must be an object mapping pid strings to metadata objects
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    // Missing or corrupt file — start fresh
    return {};
  }
}

async function writeRegistry(registry) {
  const filePath = getPidsFilePath();
  await writeFileAtomic(filePath, JSON.stringify(registry, null, 2));
}

function isProcessAlive(pid) {
  try {
    // signal 0 checks existence without sending an actual signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid) {
  return new Promise((resolve) => {
    treeKill(pid, 'SIGKILL', (err) => {
      // Ignore errors — process may have already exited
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function register(pid, metadata) {
  if (!isValidPid(pid)) {
    console.warn(`[ProcessRegistry] Refusing to register out-of-range PID ${pid}`);
    return;
  }
  const registry = readRegistry();
  registry[String(pid)] = { pid, ...metadata, registeredAt: new Date().toISOString() };
  await writeRegistry(registry);
}

async function unregister(pid) {
  const registry = readRegistry();
  delete registry[String(pid)];
  await writeRegistry(registry);
}

async function cleanupStale() {
  const registry = readRegistry();
  const pids = Object.keys(registry).map(Number).filter((n) => {
    if (!isValidPid(n)) {
      console.warn(`[ProcessRegistry] Skipping out-of-range PID ${n} in cleanupStale()`);
      return false;
    }
    return true;
  });

  const killPromises = pids
    .filter((pid) => isProcessAlive(pid))
    .map((pid) => killProcess(pid));

  await Promise.all(killPromises);

  // Clear the registry regardless of kill results
  await writeRegistry({});
}

export const ProcessRegistry = {
  register,
  unregister,
  cleanupStale,
};
