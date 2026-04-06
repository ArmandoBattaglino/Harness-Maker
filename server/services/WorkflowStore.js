// server/services/WorkflowStore.js
// Manages workflow definition JSON files persisted to
// %APPDATA%\ClaudeCodeManager\workflows\<id>.json
// Follows the same init(), atomic write, and error-handling patterns as ConfigStore.js

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import writeFileAtomic from 'write-file-atomic';

// ---------------------------------------------------------------------------
// Validation constants (FR-V3-03, SEC-V3-02, SEC-V3-06)
// ---------------------------------------------------------------------------
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_NODES = 50;
const MAX_SYSTEM_PROMPT_LENGTH = 16384; // 16 KB
const MAX_VERSIONS_PER_WORKFLOW = 50;
const NAME_REGEX = /^[\w\s\-.]+$/;
const NODE_ID_REGEX = /^[a-z][a-z0-9-]*$/;

export class WorkflowStore {
  constructor(configDir) {
    this._workflowsDir = path.join(configDir, 'workflows');
  }

  // -------------------------------------------------------------------------
  // init() — create the workflows/ directory if it does not exist
  // -------------------------------------------------------------------------
  async init() {
    if (!fs.existsSync(this._workflowsDir)) {
      fs.mkdirSync(this._workflowsDir, { recursive: true });
    }
  }

  // -------------------------------------------------------------------------
  // list() — returns an array of all WorkflowDefinition objects
  // Returns [] when the directory is empty or unreadable.
  // -------------------------------------------------------------------------
  async list() {
    if (!fs.existsSync(this._workflowsDir)) {
      return [];
    }

    let entries;
    try {
      entries = fs.readdirSync(this._workflowsDir);
    } catch {
      return [];
    }

    const workflows = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const id = entry.slice(0, -5); // strip .json
      const wf = await this.get(id);
      if (wf !== null) {
        workflows.push(wf);
      }
    }
    return workflows;
  }

  // -------------------------------------------------------------------------
  // get(id) — returns a single WorkflowDefinition or null (never throws)
  // Path validation prevents directory traversal.
  // -------------------------------------------------------------------------
  async get(id) {
    const filePath = this._resolveFilePath(id);
    if (filePath === null) return null;

    if (!fs.existsSync(filePath)) return null;

    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // create(data) — generates UUID, validates schema, atomic write
  // Returns the created WorkflowDefinition object, or throws on validation failure.
  // NOTE: The server generates the UUID — never trust client-supplied IDs.
  // -------------------------------------------------------------------------
  async create(data) {
    const validation = this.validate(data);
    if (!validation.valid) {
      const err = new Error(`Validation failed: ${validation.errors.join('; ')}`);
      err.statusCode = 400;
      throw err;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const workflow = {
      id,
      name: data.name,
      projectId: data.projectId,
      description: data.description ?? '',
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      settings: data.settings ?? {},
      initialContext: data.initialContext ?? {},
      createdAt: now,
      updatedAt: now,
    };

    await this._writeWorkflow(workflow);
    return workflow;
  }

  // -------------------------------------------------------------------------
  // update(id, data) — validates schema, atomic write, returns updated object
  // Throws 404 if the workflow does not exist.
  // -------------------------------------------------------------------------
  async update(id, data) {
    const existing = await this.get(id);
    if (existing === null) {
      const err = new Error(`Workflow not found: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    const validation = this.validate(data);
    if (!validation.valid) {
      const err = new Error(`Validation failed: ${validation.errors.join('; ')}`);
      err.statusCode = 400;
      throw err;
    }

    // Save version snapshot BEFORE overwriting (FR-V5-53)
    await this._saveVersion(id, existing);

    const updated = {
      ...existing,
      name: data.name,
      projectId: data.projectId ?? existing.projectId,
      description: data.description ?? existing.description,
      nodes: data.nodes ?? existing.nodes,
      edges: data.edges ?? existing.edges,
      settings: data.settings ?? existing.settings,
      initialContext: data.initialContext ?? existing.initialContext,
      updatedAt: new Date().toISOString(),
    };

    await this._writeWorkflow(updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // delete(id) — unlinks the workflow file, returns true/false
  // -------------------------------------------------------------------------
  async delete(id) {
    const filePath = this._resolveFilePath(id);
    if (filePath === null) return false;

    if (!fs.existsSync(filePath)) return false;

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // validate(data) — returns { valid: boolean, errors: string[] }
  // Never throws. Called on every create() and update().
  // -------------------------------------------------------------------------
  validate(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      errors.push('data must be an object');
      return { valid: false, errors };
    }

    // name: required, max 100 chars, whitelist regex
    if (typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push('name is required');
    } else {
      if (data.name.length > MAX_NAME_LENGTH) {
        errors.push(`name must be at most ${MAX_NAME_LENGTH} characters`);
      }
      if (!NAME_REGEX.test(data.name)) {
        errors.push('name contains invalid characters (allowed: word characters, spaces, hyphens, dots)');
      }
    }

    // description: optional, max 500 chars
    if (data.description !== undefined && data.description !== null) {
      if (typeof data.description !== 'string') {
        errors.push('description must be a string');
      } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
        errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
      }
    }

    // nodes: array, max 50 items
    if (data.nodes !== undefined && data.nodes !== null) {
      if (!Array.isArray(data.nodes)) {
        errors.push('nodes must be an array');
      } else {
        if (data.nodes.length > MAX_NODES) {
          errors.push(`nodes must contain at most ${MAX_NODES} items`);
        }

        data.nodes.forEach((node, idx) => {
          if (!node || typeof node !== 'object') {
            errors.push(`nodes[${idx}] must be an object`);
            return;
          }

          // node id: must match ^[a-z][a-z0-9-]*$
          if (typeof node.id !== 'string' || !NODE_ID_REGEX.test(node.id)) {
            errors.push(`nodes[${idx}].id must match ^[a-z][a-z0-9-]*$`);
          }

          // node data.systemPrompt: max 16384 chars
          if (node.data && typeof node.data === 'object') {
            if (
              node.data.systemPrompt !== undefined &&
              node.data.systemPrompt !== null &&
              typeof node.data.systemPrompt === 'string' &&
              node.data.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH
            ) {
              errors.push(`nodes[${idx}].data.systemPrompt must be at most ${MAX_SYSTEM_PROMPT_LENGTH} characters`);
            }
          }
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // -------------------------------------------------------------------------
  // listVersions(id) — returns version metadata for a workflow
  // -------------------------------------------------------------------------
  async listVersions(id) {
    const versionsDir = this._resolveVersionsDir(id);
    if (versionsDir === null) return [];
    if (!fs.existsSync(versionsDir)) return [];

    let entries;
    try {
      entries = fs.readdirSync(versionsDir);
    } catch {
      return [];
    }

    const versions = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const timestamp = entry.slice(0, -5); // strip .json
      const filePath = path.join(versionsDir, entry);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const wf = JSON.parse(raw);
        versions.push({
          timestamp,
          name: wf.name ?? '',
          nodeCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
          savedAt: timestamp,
        });
      } catch {
        // Skip corrupt version files
      }
    }

    // Sort chronologically (oldest first)
    versions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return versions;
  }

  // -------------------------------------------------------------------------
  // getVersion(id, timestamp) — returns a specific version snapshot or null
  // -------------------------------------------------------------------------
  async getVersion(id, timestamp) {
    const versionsDir = this._resolveVersionsDir(id);
    if (versionsDir === null) return null;

    // Validate timestamp format to prevent traversal
    if (typeof timestamp !== 'string' || timestamp.includes('/') || timestamp.includes('\\') || timestamp.includes('..') || timestamp.includes('\0')) {
      return null;
    }

    const filePath = path.resolve(versionsDir, `${timestamp}.json`);
    if (!filePath.startsWith(versionsDir + path.sep) && filePath !== versionsDir) {
      return null;
    }

    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // restoreVersion(id, timestamp) — copies a version as the current workflow
  // Returns the restored WorkflowDefinition, or throws 404.
  // -------------------------------------------------------------------------
  async restoreVersion(id, timestamp) {
    const version = await this.getVersion(id, timestamp);
    if (version === null) {
      const err = new Error(`Version not found: ${id}@${timestamp}`);
      err.statusCode = 404;
      throw err;
    }

    // Save the current workflow as a version before restoring
    const current = await this.get(id);
    if (current !== null) {
      await this._saveVersion(id, current);
    }

    // Restore the version as the current workflow
    const restored = {
      ...version,
      id, // Ensure the ID stays the same
      updatedAt: new Date().toISOString(),
    };

    await this._writeWorkflow(restored);
    return restored;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Resolves the file path for a given workflow ID.
   * Returns null if the ID contains path-traversal characters or is invalid.
   * This prevents directory traversal attacks (SEC-V3-06).
   */
  _resolveFilePath(id) {
    if (typeof id !== 'string' || id.trim() === '') return null;

    // Prevent any path separators or traversal sequences
    if (id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0')) {
      return null;
    }

    const resolved = path.resolve(this._workflowsDir, `${id}.json`);

    // Assert the resolved path is within the workflows directory
    if (!resolved.startsWith(this._workflowsDir + path.sep) && resolved !== this._workflowsDir) {
      return null;
    }

    return resolved;
  }

  /**
   * Resolves the versions directory for a given workflow ID.
   * Returns null if the ID is invalid or contains traversal characters.
   */
  _resolveVersionsDir(id) {
    if (typeof id !== 'string' || id.trim() === '') return null;
    if (id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0')) {
      return null;
    }

    const resolved = path.resolve(this._workflowsDir, 'versions', id);

    // Assert the resolved path is within the workflows/versions/ directory
    const versionsBase = path.resolve(this._workflowsDir, 'versions');
    if (!resolved.startsWith(versionsBase + path.sep) && resolved !== versionsBase) {
      return null;
    }

    return resolved;
  }

  /**
   * Saves a version snapshot of a workflow before it is overwritten.
   * Trims to MAX_VERSIONS_PER_WORKFLOW (oldest first).
   */
  async _saveVersion(id, workflowData) {
    const versionsDir = this._resolveVersionsDir(id);
    if (versionsDir === null) return;

    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.resolve(versionsDir, `${timestamp}.json`);

    // Path safety check
    if (!filePath.startsWith(versionsDir + path.sep) && filePath !== versionsDir) {
      return;
    }

    await writeFileAtomic(filePath, JSON.stringify(workflowData, null, 2));

    // Trim old versions if over limit
    try {
      const entries = fs.readdirSync(versionsDir)
        .filter((e) => e.endsWith('.json'))
        .sort(); // Chronological order (ISO timestamps sort lexicographically)

      while (entries.length > MAX_VERSIONS_PER_WORKFLOW) {
        const oldest = entries.shift();
        const oldPath = path.join(versionsDir, oldest);
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // Best-effort cleanup
        }
      }
    } catch {
      // Best-effort — version trimming is not critical
    }
  }

  /**
   * Writes a workflow object to disk using write-file-atomic.
   * Path is validated before write.
   */
  async _writeWorkflow(workflow) {
    if (!fs.existsSync(this._workflowsDir)) {
      fs.mkdirSync(this._workflowsDir, { recursive: true });
    }

    const filePath = this._resolveFilePath(workflow.id);
    if (filePath === null) {
      throw new Error(`Invalid workflow ID: ${workflow.id}`);
    }

    await writeFileAtomic(filePath, JSON.stringify(workflow, null, 2));
  }
}
