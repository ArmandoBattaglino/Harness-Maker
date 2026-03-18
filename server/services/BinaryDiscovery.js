// server/services/BinaryDiscovery.js
// Locates the claude CLI binary using a priority-ordered discovery chain.
// Result is cached in module scope after the first successful call.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Module-level cache
let _cachedPath = null;

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

function findOnPath() {
  // On Windows, use 'where'; on POSIX, use 'which'
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where.exe' : 'which';

  try {
    const result = execFileSync(cmd, ['claude'], {
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

export async function discoverClaudeBinary() {
  if (_cachedPath !== null) {
    return _cachedPath;
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
    _cachedPath = envPath;
    return _cachedPath;
  }

  // Step 2: PATH lookup
  const pathCandidate = findOnPath();
  if (pathCandidate) {
    try {
      validateBinary(pathCandidate);
      _cachedPath = pathCandidate;
      return _cachedPath;
    } catch {
      // Binary found on PATH but failed --version; continue to next step
    }
  }

  // Step 3: %LOCALAPPDATA%\AnthropicClaude\claude.exe
  const localCandidate = findInLocalAppData();
  if (localCandidate) {
    try {
      validateBinary(localCandidate);
      _cachedPath = localCandidate;
      return _cachedPath;
    } catch {
      // Found but failed --version; fall through to error
    }
  }

  // Step 4: Not found
  throw new Error(
    'Claude CLI not found. Install from https://claude.ai/code or set CLAUDE_BIN env var.'
  );
}
