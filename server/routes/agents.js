// server/routes/agents.js
// CRUD for Claude agent definition files (.claude/agents/*.md)
// FR-28, FR-29, FR-30, FR-31

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Router } from 'express';

import { ApiError } from '../middleware/pathValidation.js';
import { ConfigStore } from '../services/ConfigStore.js';
import { fileManager } from '../services/FileManager.js';
import { parseFrontmatter, serializeFrontmatter, filePathToId } from '../utils/frontmatter.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;
const USER_AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a project by id.  Returns the project object or null.
 */
function findProject(projectId) {
  if (!projectId) return null;
  return ConfigStore.getProjects().find((p) => p.id === projectId) ?? null;
}

/**
 * Read all .md files from a directory and convert them to agent records.
 * If the directory does not exist or is unreadable, returns an empty array.
 *
 * @param {string} dir        - Directory to scan
 * @param {string} allowedBase - Same as dir (FileManager path validation base)
 * @param {'user'|'project'} scope
 * @returns {Promise<object[]>}
 */
async function readAgentsFromDir(dir, allowedBase, scope) {
  let entries;
  try {
    entries = await fileManager.listDirectory(dir, allowedBase);
  } catch {
    return [];
  }

  const agents = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    const filePath = path.join(dir, entry);
    let content;
    try {
      content = await fileManager.readFile(filePath, allowedBase);
    } catch {
      continue; // Skip unreadable files
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const nameFromFile = path.basename(entry, '.md');

    agents.push({
      id: filePathToId(filePath),
      name: typeof frontmatter.name === 'string' ? frontmatter.name : nameFromFile,
      scope,
      filePath,
      frontmatter,
      body,
    });
  }

  return agents;
}

// ---------------------------------------------------------------------------
// GET /api/v1/agents?projectId=<id>
// Returns agents from user scope (~/.claude/agents) and optionally project scope
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const project = findProject(projectId);

    const [userAgents, projectAgents] = await Promise.all([
      readAgentsFromDir(USER_AGENTS_DIR, USER_AGENTS_DIR, 'user'),
      project
        ? readAgentsFromDir(
            path.join(project.path, '.claude', 'agents'),
            project.path,
            'project'
          )
        : Promise.resolve([]),
    ]);

    res.json({ agents: [...userAgents, ...projectAgents] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/agents
// Body: { name, scope, projectId?, frontmatter, body }
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { name, scope, projectId, frontmatter = {}, body = '' } = req.body ?? {};

    // Validate name
    if (typeof name !== 'string' || !AGENT_NAME_RE.test(name)) {
      throw new ApiError(
        400,
        'name is required and must match ^[a-z][a-z0-9-]*$'
      );
    }

    // Validate scope
    if (scope !== 'user' && scope !== 'project') {
      throw new ApiError(400, 'scope must be "user" or "project"');
    }

    // Validate body / frontmatter types
    if (typeof body !== 'string') {
      throw new ApiError(400, 'body must be a string');
    }
    if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
      throw new ApiError(400, 'frontmatter must be an object');
    }

    let targetDir;
    let allowedBase;

    if (scope === 'user') {
      targetDir = USER_AGENTS_DIR;
      allowedBase = USER_AGENTS_DIR;
    } else {
      // project scope — projectId required
      const project = findProject(projectId);
      if (!project) {
        throw new ApiError(400, 'projectId is required and must refer to a registered project for scope "project"');
      }
      targetDir = path.join(project.path, '.claude', 'agents');
      allowedBase = project.path;
    }

    const filePath = path.join(targetDir, `${name}.md`);

    // Check for duplicate
    if (fs.existsSync(filePath)) {
      throw new ApiError(409, `Agent "${name}" already exists in ${scope} scope`);
    }

    // Merge name into frontmatter so it is preserved in the file
    const fm = { ...frontmatter, name };
    const content = serializeFrontmatter(fm, body);

    await fileManager.writeFile(filePath, content, allowedBase);

    const agent = {
      id: filePathToId(filePath),
      name,
      scope,
      filePath,
      frontmatter: fm,
      body,
    };

    res.status(201).json({ agent });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/agents/:id
// Body: { frontmatter, body, filePath }
// filePath is required because the ID alone cannot reverse-hash to a path.
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res, next) => {
  try {
    const { frontmatter, body, filePath } = req.body ?? {};

    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new ApiError(400, 'filePath is required');
    }
    if (typeof body !== 'string') {
      throw new ApiError(400, 'body must be a string');
    }
    if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
      throw new ApiError(400, 'frontmatter must be an object');
    }

    // Determine allowedBase from file location
    const allowedBase = resolveAllowedBase(filePath);

    // Verify the file exists
    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Agent file not found');
    }

    const content = serializeFrontmatter(frontmatter, body);
    await fileManager.writeFile(filePath, content, allowedBase);

    res.json({
      agent: {
        id: filePathToId(filePath),
        name: typeof frontmatter.name === 'string'
          ? frontmatter.name
          : path.basename(filePath, '.md'),
        filePath,
        frontmatter,
        body,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/agents/:id
// Body or query: { filePath }
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    // Accept filePath from body (preferred) or query string
    const filePath = (req.body ?? {}).filePath ?? req.query.filePath;

    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new ApiError(400, 'filePath is required');
    }

    const allowedBase = resolveAllowedBase(filePath);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Agent file not found');
    }

    await fileManager.deleteFile(filePath, allowedBase);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Internal: resolve the allowed base directory for a given agent filePath.
// The file must be inside USER_AGENTS_DIR or a registered project's path.
// Throws ApiError(400) if it does not match any allowed location.
// ---------------------------------------------------------------------------
function resolveAllowedBase(filePath) {
  const resolved = path.resolve(filePath);

  // User scope
  const userBase = path.resolve(USER_AGENTS_DIR);
  if (resolved === userBase || resolved.startsWith(userBase + path.sep)) {
    return USER_AGENTS_DIR;
  }

  // Project scope — match against registered projects
  const projects = ConfigStore.getProjects();
  for (const project of projects) {
    const projectBase = path.resolve(project.path);
    if (resolved === projectBase || resolved.startsWith(projectBase + path.sep)) {
      return project.path;
    }
  }

  throw new ApiError(400, 'filePath is outside all allowed directories');
}

export default router;
