// server/stores/ExecutionHistoryStore.js
// Persists execution history per workflow to
// %APPDATA%\ClaudeCodeManager\execution-history\<workflowId>.json
// Max 100 entries per workflow — trims oldest on overflow.

import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';

const MAX_ENTRIES_PER_WORKFLOW = 100;

export class ExecutionHistoryStore {
  /**
   * @param {string} configDir — same CONFIG_DIR used by WorkflowStore
   */
  constructor(configDir) {
    this._historyDir = path.join(configDir, 'execution-history');
  }

  // -------------------------------------------------------------------------
  // init() — create the execution-history/ directory if it does not exist
  // -------------------------------------------------------------------------
  async init() {
    if (!fs.existsSync(this._historyDir)) {
      fs.mkdirSync(this._historyDir, { recursive: true });
    }
  }

  // -------------------------------------------------------------------------
  // addEntry(workflowId, entry) — append an ExecutionHistoryEntry
  // Trims to MAX_ENTRIES_PER_WORKFLOW (oldest first).
  // -------------------------------------------------------------------------
  async addEntry(workflowId, entry) {
    if (!workflowId || typeof workflowId !== 'string') {
      throw new Error('workflowId is required');
    }
    if (!entry || typeof entry !== 'object') {
      throw new Error('entry must be an object');
    }
    if (!entry.executionId || typeof entry.executionId !== 'string') {
      throw new Error('entry.executionId is required');
    }

    const entries = await this._readEntries(workflowId);

    // Build a normalized entry
    const normalized = {
      executionId: entry.executionId,
      workflowId,
      status: entry.status ?? 'completed',
      startedAt: entry.startedAt ?? null,
      endedAt: entry.endedAt ?? null,
      durationMs: entry.durationMs ?? null,
      nodesRun: entry.nodesRun ?? 0,
      outcome: entry.outcome ?? '',
      nodeSnapshots: entry.nodeSnapshots ?? {},
      agentOutputs: entry.agentOutputs ?? {},
      aggregatedArtifact: entry.aggregatedArtifact ?? '',
    };

    entries.push(normalized);

    // Trim oldest entries if over limit
    while (entries.length > MAX_ENTRIES_PER_WORKFLOW) {
      entries.shift();
    }

    await this._writeEntries(workflowId, entries);
    return normalized;
  }

  // -------------------------------------------------------------------------
  // getHistory(workflowId) — returns all entries for a workflow (newest last)
  // -------------------------------------------------------------------------
  async getHistory(workflowId) {
    if (!workflowId || typeof workflowId !== 'string') {
      return [];
    }
    return this._readEntries(workflowId);
  }

  // -------------------------------------------------------------------------
  // getEntry(workflowId, executionId) — returns a single entry or null
  // -------------------------------------------------------------------------
  async getEntry(workflowId, executionId) {
    if (!workflowId || typeof workflowId !== 'string') return null;
    if (!executionId || typeof executionId !== 'string') return null;
    // Validate executionId against traversal
    if (executionId.includes('/') || executionId.includes('\\') || executionId.includes('..') || executionId.includes('\0')) {
      return null;
    }
    const entries = await this._readEntries(workflowId);
    return entries.find((e) => e.executionId === executionId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Resolves the file path for a given workflow ID.
   * Returns null if the ID contains path-traversal characters.
   */
  _resolveFilePath(workflowId) {
    if (typeof workflowId !== 'string' || workflowId.trim() === '') return null;
    if (workflowId.includes('/') || workflowId.includes('\\') || workflowId.includes('..') || workflowId.includes('\0')) {
      return null;
    }

    const resolved = path.resolve(this._historyDir, `${workflowId}.json`);

    // Assert the resolved path is within the history directory
    if (!resolved.startsWith(this._historyDir + path.sep) && resolved !== this._historyDir) {
      return null;
    }

    return resolved;
  }

  /**
   * Reads all entries for a workflow from disk. Returns [] on any error.
   */
  async _readEntries(workflowId) {
    const filePath = this._resolveFilePath(workflowId);
    if (filePath === null) return [];
    if (!fs.existsSync(filePath)) return [];

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Apply backward-compat defaults for newer fields
      return parsed.map((entry) => ({
        ...entry,
        agentOutputs: entry.agentOutputs ?? {},
        aggregatedArtifact: entry.aggregatedArtifact ?? '',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Writes all entries for a workflow to disk using write-file-atomic.
   */
  async _writeEntries(workflowId, entries) {
    if (!fs.existsSync(this._historyDir)) {
      fs.mkdirSync(this._historyDir, { recursive: true });
    }

    const filePath = this._resolveFilePath(workflowId);
    if (filePath === null) {
      throw new Error(`Invalid workflowId: ${workflowId}`);
    }

    await writeFileAtomic(filePath, JSON.stringify(entries, null, 2));
  }
}
