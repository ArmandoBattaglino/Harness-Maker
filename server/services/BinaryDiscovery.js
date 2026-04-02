// server/services/BinaryDiscovery.js
// Locates the claude CLI binary using a priority-ordered discovery chain.
// Result is cached in module scope after the first successful call.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Module-level cache
let _cachedClaudePath = null;
let _cachedCodexPath = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function validateBinary(binaryPath) {
  // Confirm the binary runs and responds to --version
  execFileSync(binaryPath, ['--version'], {
    shell: false,
    stdio: 'pipe',
    timeout: 10000,
  });
}

function findOnPath(binaryName) {
  // On Windows, use 'where'; on POSIX, use 'which'
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where.exe' : 'which';

  try {
    const result = execFileSync(cmd, [binaryName], {
      shell: false,
      stdio: 'pipe',
      timeout: 5000,
    });
    // 'where' on Windows may return multiple lines; take the first non-empty one
    const lines = result.toString().trim().split(/\r?\n/);
    const candidate = lines[0].trim();
    if (candidate && fileExists(candidate)) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

function findInLocalAppData() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const candidate = path.join(localAppData, 'AnthropicClaude', 'claude.exe');
  if (fileExists(candidate)) {
    return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function findCodexSandboxBinary() {
  const userHome = process.env.USERPROFILE || process.env.HOME;
  if (!userHome) return null;

  const candidate = path.join(userHome, '.codex', '.sandbox-bin', 'codex.exe');
  if (fileExists(candidate)) {
    return candidate;
  }
  return null;
}

export async function discoverClaudeBinary() {
  if (_cachedClaudePath !== null) {
    return _cachedClaudePath;
  }

  // Step 1: Explicit env override
  if (process.env.CLAUDE_BIN) {
    const envPath = process.env.CLAUDE_BIN;
    if (!fileExists(envPath)) {
      throw new Error(
        `CLAUDE_BIN is set to "${envPath}" but the file does not exist or is not executable.`
      );
    }
    validateBinary(envPath);
    _cachedClaudePath = envPath;
    return _cachedClaudePath;
  }

  // Step 2: PATH lookup
  const pathCandidate = findOnPath('claude');
  if (pathCandidate) {
    try {
      validateBinary(pathCandidate);
      _cachedClaudePath = pathCandidate;
      return _cachedClaudePath;
    } catch {
      // Binary found on PATH but failed --version; continue to next step
    }
  }

  // Step 3: %LOCALAPPDATA%\AnthropicClaude\claude.exe
  const localCandidate = findInLocalAppData();
  if (localCandidate) {
    try {
      validateBinary(localCandidate);
      _cachedClaudePath = localCandidate;
      return _cachedClaudePath;
    } catch {
      // Found but failed --version; fall through to error
    }
  }

  // Step 4: Not found
  throw new Error(
    'Claude CLI not found. Install from https://claude.ai/code or set CLAUDE_BIN env var.'
  );
}

export async function discoverCodexBinary() {
  if (_cachedCodexPath !== null) {
    return _cachedCodexPath;
  }

  if (process.env.CODEX_BIN) {
    const envPath = process.env.CODEX_BIN;
    if (!fileExists(envPath)) {
      throw new Error(
        `CODEX_BIN is set to "${envPath}" but the file does not exist or is not executable.`
      );
    }
    validateBinary(envPath);
    _cachedCodexPath = envPath;
    return _cachedCodexPath;
  }

  const pathCandidate = findOnPath('codex');
  if (pathCandidate) {
    try {
      validateBinary(pathCandidate);
      _cachedCodexPath = pathCandidate;
      return _cachedCodexPath;
    } catch {
      // continue to sandbox fallback
    }
  }

  const sandboxCandidate = findCodexSandboxBinary();
  if (sandboxCandidate) {
    try {
      validateBinary(sandboxCandidate);
      _cachedCodexPath = sandboxCandidate;
      return _cachedCodexPath;
    } catch {
      // fall through to error
    }
  }

  throw new Error(
    'Codex CLI not found. Set CODEX_BIN or install/configure a local Codex executable.'
  );
}
