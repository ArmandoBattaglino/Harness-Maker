// server/routes/claudemd.js
// Read and update CLAUDE.md files (user scope and project scope)
// FR-37, FR-38, FR-39

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Router } from 'express';

import { ApiError } from '../middleware/pathValidation.js';
import { ConfigStore } from '../services/ConfigStore.js';
import { fileManager } from '../services/FileManager.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const USER_CLAUDE_DIR = path.join(os.homedir(), '.claude');
const USER_CLAUDE_MD = path.join(USER_CLAUDE_DIR, 'CLAUDE.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findProject(projectId) {
  if (!projectId) return null;
  return ConfigStore.getProjects().find((p) => p.id === projectId) ?? null;
}

/**
 * Safely read a file; returns empty string if it does not exist.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function safeRead(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/claudemd?projectId=<id>
// Returns both user and project CLAUDE.md content (empty string if absent)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const project = findProject(projectId);

    const [userContent, projectContent] = await Promise.all([
      safeRead(USER_CLAUDE_MD),
      project
        ? safeRead(path.join(project.path, '.claude', 'CLAUDE.md'))
        : Promise.resolve(''),
    ]);

    res.json({
      userScope: {
        path: USER_CLAUDE_MD,
        content: userContent,
      },
      projectScope: {
        path: project ? path.join(project.path, '.claude', 'CLAUDE.md') : null,
        content: projectContent,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/claudemd/user
// Body: { content: string }
// Writes ~/.claude/CLAUDE.md atomically
// ---------------------------------------------------------------------------
router.put('/user', async (req, res, next) => {
  try {
    const { content } = req.body ?? {};

    if (typeof content !== 'string') {
      throw new ApiError(400, 'content must be a string');
    }

    await fileManager.writeFile(USER_CLAUDE_MD, content, USER_CLAUDE_DIR);

    res.json({
      path: USER_CLAUDE_MD,
      lineCount: content.split('\n').length,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/claudemd/project
// Body: { content: string, projectId: string }
// Writes <projectPath>/.claude/CLAUDE.md atomically
// ---------------------------------------------------------------------------
router.put('/project', async (req, res, next) => {
  try {
    const { content, projectId } = req.body ?? {};

    if (typeof content !== 'string') {
      throw new ApiError(400, 'content must be a string');
    }

    if (!projectId) {
      throw new ApiError(400, 'projectId is required');
    }

    const project = findProject(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const claudeMdPath = path.join(project.path, '.claude', 'CLAUDE.md');
    const allowedBase = project.path;

    await fileManager.writeFile(claudeMdPath, content, allowedBase);

    res.json({
      path: claudeMdPath,
      lineCount: content.split('\n').length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
