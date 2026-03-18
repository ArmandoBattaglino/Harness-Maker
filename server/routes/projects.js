// server/routes/projects.js
// REST API: Project management — Task #4

import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import writeFileAtomic from 'write-file-atomic';

import { ApiError, validateProjectPath } from '../middleware/pathValidation.js';
import { ConfigStore } from '../services/ConfigStore.js';

const router = Router();

// ---------------------------------------------------------------------------
// Scaffold helper
// Creates .claude/, .claude/agents/, .claude/commands/, .claude/CLAUDE.md
// ---------------------------------------------------------------------------
async function scaffoldProject(projectPath, projectName) {
  const claudeDir = path.join(projectPath, '.claude');
  const agentsDir = path.join(claudeDir, 'agents');
  const commandsDir = path.join(claudeDir, 'commands');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  // Create directories — recursive so parent .claude/ is created first
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(commandsDir, { recursive: true });

  // Write CLAUDE.md only if it does not already exist
  if (!fs.existsSync(claudeMdPath)) {
    const content = [
      `# ${projectName}`,
      '',
      '## Overview',
      '[Add project description here]',
      '',
      '## Running the Project',
      '[Add startup commands here]',
      '',
      '## Agent Team Workflow',
      '[Add workflow instructions here]',
      '',
    ].join('\n');

    await writeFileAtomic(claudeMdPath, content);
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/projects
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const projects = ConfigStore.getProjects();
  res.json({ projects });
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects
// Body: { name: string, path: string, scaffold?: boolean }
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { name, path: inputPath, scaffold } = req.body ?? {};

    // Validate name
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ApiError(400, 'name is required');
    }
    if (name.trim().length > 100) {
      throw new ApiError(400, 'name must be 100 characters or fewer');
    }
    const trimmedName = name.trim();

    // Validate and resolve path — throws ApiError(400) on bad input
    const resolvedPath = validateProjectPath(inputPath);

    // Check path exists on disk
    if (!fs.existsSync(resolvedPath)) {
      throw new ApiError(400, 'Path does not exist on disk');
    }

    // Check for duplicate path
    const existing = ConfigStore.getProjects();
    if (existing.some((p) => p.path === resolvedPath)) {
      throw new ApiError(409, 'A project with this path is already registered');
    }

    // Decide whether to scaffold
    const claudeDir = path.join(resolvedPath, '.claude');
    const shouldScaffold = scaffold === true || !fs.existsSync(claudeDir);
    if (shouldScaffold) {
      await scaffoldProject(resolvedPath, trimmedName);
    }

    // Build and persist the project record
    const project = {
      id: uuidv4(),
      name: trimmedName,
      path: resolvedPath,
      createdAt: new Date().toISOString(),
    };

    await ConfigStore.addProject(project);

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:id
// ---------------------------------------------------------------------------
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const projects = ConfigStore.getProjects();
    const project = projects.find((p) => p.id === id);

    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const pathExists = fs.existsSync(project.path);
    res.json({ project, pathExists });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/projects/:id
// Removes from registry — does NOT delete files on disk
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const projects = ConfigStore.getProjects();
    const exists = projects.some((p) => p.id === id);

    if (!exists) {
      throw new ApiError(404, 'Project not found');
    }

    await ConfigStore.removeProject(id);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:id/scaffold
// ---------------------------------------------------------------------------
router.post('/:id/scaffold', async (req, res, next) => {
  try {
    const { id } = req.params;
    const projects = ConfigStore.getProjects();
    const project = projects.find((p) => p.id === id);

    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    if (!fs.existsSync(project.path)) {
      throw new ApiError(400, 'Project path no longer exists on disk');
    }

    await scaffoldProject(project.path, project.name);

    res.json({ scaffolded: true, path: project.path });
  } catch (err) {
    next(err);
  }
});

export default router;
