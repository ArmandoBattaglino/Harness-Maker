// server/services/ConfigStore.js
// Manages per-user config at %APPDATA%\ClaudeCodeManager\config.json
// Fallback: os.homedir()\.claudecodemanager\config.json

import fs from 'fs';
import path from 'path';
import os from 'os';
import writeFileAtomic from 'write-file-atomic';

// ---------------------------------------------------------------------------
// Resolve config directory and file path
// ---------------------------------------------------------------------------
function resolveConfigDir() {
  const appData = process.env.APPDATA;
  if (appData) {
    return path.join(appData, 'ClaudeCodeManager');
  }
  return path.join(os.homedir(), '.claudecodemanager');
}

const CONFIG_DIR = resolveConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ---------------------------------------------------------------------------
// Default config shape
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  version: '1',
  projects: [],
  settings: {
    port: 3000,
    idleTimeoutMinutes: 30,
  },
};

// ---------------------------------------------------------------------------
// In-memory state — populated by load()
// ---------------------------------------------------------------------------
let _config = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function validateSchema(parsed) {
  // Belt-and-suspenders: ensure required top-level keys exist
  if (typeof parsed !== 'object' || parsed === null) {
    return false;
  }
  if (typeof parsed.version !== 'string') return false;
  if (!Array.isArray(parsed.projects)) return false;
  if (typeof parsed.settings !== 'object' || parsed.settings === null) return false;
  return true;
}

async function persist() {
  ensureDir();
  await writeFileAtomic(CONFIG_FILE, JSON.stringify(_config, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function load() {
  ensureDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    await persist();
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  } catch (err) {
    // File exists but unreadable — start fresh
    _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    await persist();
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — start fresh
    _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    await persist();
    return;
  }

  if (!validateSchema(parsed)) {
    // Invalid structure — start fresh
    _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    await persist();
    return;
  }

  // Merge defaults for any missing settings keys
  _config = {
    ...DEFAULT_CONFIG,
    ...parsed,
    settings: {
      ...DEFAULT_CONFIG.settings,
      ...parsed.settings,
    },
  };
}

function getProjects() {
  if (_config === null) throw new Error('ConfigStore not loaded. Call load() first.');
  return _config.projects;
}

async function addProject(project) {
  if (_config === null) throw new Error('ConfigStore not loaded. Call load() first.');
  _config.projects.push(project);
  await persist();
}

async function removeProject(id) {
  if (_config === null) throw new Error('ConfigStore not loaded. Call load() first.');
  _config.projects = _config.projects.filter((p) => p.id !== id);
  await persist();
}

function getSettings() {
  if (_config === null) throw new Error('ConfigStore not loaded. Call load() first.');
  return _config.settings;
}

async function updateSettings(partial) {
  if (_config === null) throw new Error('ConfigStore not loaded. Call load() first.');
  _config.settings = { ..._config.settings, ...partial };
  await persist();
}

export const ConfigStore = {
  load,
  getProjects,
  addProject,
  removeProject,
  getSettings,
  updateSettings,
  // Exposed for other services that need the config directory path
  CONFIG_DIR,
};
