// server/routes/skills.js
// CRUD for Claude skill files (.claude/skills/<name>/SKILL.md and legacy .claude/commands/*.md)
// FR-33, FR-34, FR-35, FR-36

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
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const SKILL_NAME_MAX = 64;

const USER_CLAUDE_DIR = path.join(os.homedir(), '.claude');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findProject(projectId) {
  if (!projectId) return null;
  return ConfigStore.getProjects().find((p) => p.id === projectId) ?? null;
}

/**
 * Scan <base>/.claude/skills/ for modern skill directories containing SKILL.md
 * Returns array of skill record objects.
 *
 * @param {string} claudeDir  - e.g. ~/.claude or <project>/.claude
 * @param {string} allowedBase - root for FileManager path validation
 * @param {'user'|'project'} scope
 * @returns {Promise<object[]>}
 */
async function readModernSkills(claudeDir, allowedBase, scope) {
  const skillsDir = path.join(claudeDir, 'skills');

  let entries;
  try {
    entries = await fileManager.listDirectory(skillsDir, allowedBase);
  } catch {
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry);
    const skillFile = path.join(skillDir, 'SKILL.md');

    // Must be a directory with a SKILL.md inside
    let stat;
    try {
      stat = await fs.promises.stat(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (!fs.existsSync(skillFile)) continue;

    let content;
    try {
      content = await fileManager.readFile(skillFile, allowedBase);
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);

    skills.push({
      id: filePathToId(skillFile),
      name: typeof frontmatter.name === 'string' ? frontmatter.name : entry,
      scope,
      format: 'modern',
      filePath: skillFile,
      dirPath: skillDir,
      frontmatter,
      body,
    });
  }

  return skills;
}

/**
 * Scan <base>/.claude/commands/ for legacy command files (*.md)
 *
 * @param {string} claudeDir
 * @param {string} allowedBase
 * @param {'user'|'project'} scope
 * @returns {Promise<object[]>}
 */
async function readLegacySkills(claudeDir, allowedBase, scope) {
  const commandsDir = path.join(claudeDir, 'commands');

  let entries;
  try {
    entries = await fileManager.listDirectory(commandsDir, allowedBase);
  } catch {
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    const filePath = path.join(commandsDir, entry);
    let content;
    try {
      content = await fileManager.readFile(filePath, allowedBase);
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const nameFromFile = path.basename(entry, '.md');

    skills.push({
      id: filePathToId(filePath),
      name: typeof frontmatter.name === 'string' ? frontmatter.name : nameFromFile,
      scope,
      format: 'legacy',
      filePath,
      dirPath: null,
      frontmatter,
      body,
    });
  }

  return skills;
}

// ---------------------------------------------------------------------------
// GET /api/v1/skills?projectId=<id>
// Scans 4 locations: user modern, project modern, user legacy, project legacy
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const project = findProject(projectId);

    const [
      userModern,
      userLegacy,
      projectModern,
      projectLegacy,
    ] = await Promise.all([
      readModernSkills(USER_CLAUDE_DIR, USER_CLAUDE_DIR, 'user'),
      readLegacySkills(USER_CLAUDE_DIR, USER_CLAUDE_DIR, 'user'),
      project
        ? readModernSkills(path.join(project.path, '.claude'), project.path, 'project')
        : Promise.resolve([]),
      project
        ? readLegacySkills(path.join(project.path, '.claude'), project.path, 'project')
        : Promise.resolve([]),
    ]);

    res.json({ skills: [...userModern, ...userLegacy, ...projectModern, ...projectLegacy] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/skills
// Body: { name, scope, projectId?, frontmatter, body }
// Creates <base>/skills/<name>/SKILL.md
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { name, scope, projectId, frontmatter = {}, body = '' } = req.body ?? {};

    // Validate name
    if (typeof name !== 'string' || !SKILL_NAME_RE.test(name) || name.length > SKILL_NAME_MAX) {
      throw new ApiError(
        400,
        `name is required, must match ^[a-z0-9][a-z0-9-]*$ and be at most ${SKILL_NAME_MAX} characters`
      );
    }

    // Validate scope
    if (scope !== 'user' && scope !== 'project') {
      throw new ApiError(400, 'scope must be "user" or "project"');
    }

    if (typeof body !== 'string') {
      throw new ApiError(400, 'body must be a string');
    }
    if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
      throw new ApiError(400, 'frontmatter must be an object');
    }

    let claudeDir;
    let allowedBase;

    if (scope === 'user') {
      claudeDir = USER_CLAUDE_DIR;
      allowedBase = USER_CLAUDE_DIR;
    } else {
      const project = findProject(projectId);
      if (!project) {
        throw new ApiError(400, 'projectId is required and must refer to a registered project for scope "project"');
      }
      claudeDir = path.join(project.path, '.claude');
      allowedBase = project.path;
    }

    const skillDir = path.join(claudeDir, 'skills', name);
    const skillFile = path.join(skillDir, 'SKILL.md');

    // Check for duplicate
    if (fs.existsSync(skillFile)) {
      throw new ApiError(409, `Skill "${name}" already exists in ${scope} scope`);
    }

    // Ensure directory exists
    await fileManager.ensureDirectory(skillDir, allowedBase);

    // Merge name into frontmatter
    const fm = { ...frontmatter, name };
    const content = serializeFrontmatter(fm, body);
    await fileManager.writeFile(skillFile, content, allowedBase);

    const skill = {
      id: filePathToId(skillFile),
      name,
      scope,
      format: 'modern',
      filePath: skillFile,
      dirPath: skillDir,
      frontmatter: fm,
      body,
    };

    res.status(201).json({ skill });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/skills/:id
// Body: { frontmatter, body, filePath }
// Updates the SKILL.md (or legacy .md) atomically
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

    const allowedBase = resolveAllowedBase(filePath);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Skill file not found');
    }

    const content = serializeFrontmatter(frontmatter, body);
    await fileManager.writeFile(filePath, content, allowedBase);

    res.json({
      skill: {
        id: filePathToId(filePath),
        name: typeof frontmatter.name === 'string'
          ? frontmatter.name
          : path.basename(path.dirname(filePath)),
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
// DELETE /api/v1/skills/:id
// Body or query: { filePath } for legacy files, or { dirPath } for modern skills
// Removes the entire skill directory (modern) or the single .md file (legacy)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const bodyData = req.body ?? {};
    const dirPath = bodyData.dirPath ?? req.query.dirPath ?? null;
    const filePath = bodyData.filePath ?? req.query.filePath ?? null;

    if (!dirPath && !filePath) {
      throw new ApiError(400, 'dirPath (modern skill) or filePath (legacy skill) is required');
    }

    if (dirPath) {
      // Modern skill — remove entire directory
      const allowedBase = resolveAllowedBase(dirPath);
      const resolvedDir = path.resolve(dirPath);

      if (!fs.existsSync(resolvedDir)) {
        throw new ApiError(404, 'Skill directory not found');
      }

      await fs.promises.rm(resolvedDir, { recursive: true, force: true });
      // Validate the path was within allowedBase (resolveAllowedBase already did this)
      void allowedBase; // already validated above
    } else {
      // Legacy skill — remove single file
      const allowedBase = resolveAllowedBase(filePath);
      if (!fs.existsSync(filePath)) {
        throw new ApiError(404, 'Skill file not found');
      }
      await fileManager.deleteFile(filePath, allowedBase);
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Internal: resolve allowed base for a file or directory path
// ---------------------------------------------------------------------------
function resolveAllowedBase(targetPath) {
  const resolved = path.resolve(targetPath);

  // User scope (anywhere under ~/.claude)
  const userBase = path.resolve(USER_CLAUDE_DIR);
  if (resolved === userBase || resolved.startsWith(userBase + path.sep)) {
    return USER_CLAUDE_DIR;
  }

  // Project scope
  const projects = ConfigStore.getProjects();
  for (const project of projects) {
    const projectBase = path.resolve(project.path);
    if (resolved === projectBase || resolved.startsWith(projectBase + path.sep)) {
      return project.path;
    }
  }

  throw new ApiError(400, 'path is outside all allowed directories');
}

export default router;
