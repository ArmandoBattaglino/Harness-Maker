// server/routes/swarm.js
// Execution control REST API for the V3 Swarm Orchestrator â€” Task #47.1
//
// POST   /api/v1/swarm/scaffold                   â†’ 201 { workflowId, workflowDef }
// POST   /api/v1/swarm/:workflowId/start         â†’ 201 { executionId, status }
// POST   /api/v1/swarm/:executionId/pause        â†’ 200 { ok: true }
// POST   /api/v1/swarm/:executionId/resume       â†’ 200 { ok: true }
// DELETE /api/v1/swarm/:executionId              â†’ 204
// GET    /api/v1/swarm/:executionId/status       â†’ 200 { executionId, status, agentStates, edgeCounters, budget }
// GET    /api/v1/swarm/:executionId/agent/:nodeId/output â†’ 200 { output: string }
// POST   /api/v1/swarm/:executionId/broadcast    â†’ 200 { sent: number }
// POST   /api/v1/swarm/prompt-preview            â†’ 200 { blocks, assembledPrompt, ... }

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Router } from 'express';
import { generateWorkflowFromPrompt } from '../services/ScaffoldGenerator.js';
import { getRuntimeCapabilitySnapshot } from '../services/SwarmEngine.js';
import { compileExecutionContract } from '../services/ExecutionContractResolver.js';
import {
  TERMINAL_EXECUTION_STATUSES,
  buildExecutionResultsPayload,
  buildLiveExecutionResults,
  getExecutionHistoryStore,
  lookupExecution,
} from '../services/ExecutionResultsService.js';
import { ConfigStore } from '../services/ConfigStore.js';

const STRUCTURED_AGENT_SPAWN_MODES = new Set(['stream-json', 'codex-sdk']);

// -------------------------------------------------------------------------
// Prompt-preview constants (mirrored from SwarmEngine — route-local to avoid
// coupling to internal engine state)
// -------------------------------------------------------------------------
const PREVIEW_DEFAULT_BLOCK_ORDER = [
  'role', 'guardrails', 'guidance', 'awareness', 'inputs',
  'pack-knowledge', 'pack-rules', 'handoffs', 'history', 'protocol', 'hitl',
];

const PREVIEW_SYSTEM_BLOCKS = new Set(['protocol']);

const BLOCK_METADATA = {
  'role':           { title: 'Your Role',           source: 'user' },
  'guardrails':     { title: 'Guardrails',          source: 'user' },
  'guidance':       { title: 'Quality Guidance',    source: 'user' },
  'awareness':      { title: 'Agent Awareness',     source: 'runtime' },
  'inputs':         { title: 'Workflow Inputs',     source: 'runtime' },
  'pack-knowledge': { title: 'Pack Knowledge',      source: 'pack' },
  'pack-rules':     { title: 'Pack Behavior Rules', source: 'pack' },
  'handoffs':       { title: 'Inbound Handoffs',    source: 'runtime' },
  'history':        { title: 'Interaction History',  source: 'runtime' },
  'protocol':       { title: 'Protocol',            source: 'system' },
  'hitl':           { title: 'HITL Protocol',        source: 'system' },
};

const RUNTIME_PLACEHOLDERS = {
  'awareness': '[Populated at runtime: agent identity, peers, and connection status within the workflow]',
  'inputs':    '[Populated at runtime: workflow run inputs scoped to this agent]',
  'handoffs':  '[Populated at runtime: inbound handoff payloads from upstream agents]',
  'history':   '[Populated at runtime: interaction transcript based on context visibility setting]',
};

/** Placeholder descriptions shown when a block has no user content configured yet */
const EMPTY_PLACEHOLDERS = {
  'role':           '[Not configured — add a system prompt or mission to define this agent\'s role]',
  'guardrails':     '[Not configured — add safety constraints and behavioral limits]',
  'guidance':       '[Not configured — add tools, skill hints, or expected output format]',
  'pack-knowledge': '[From pack: domain knowledge and context injected by the linked pack]',
  'pack-rules':     '[From pack: behavioral rules and directives from the linked pack]',
  'hitl':           '[Active only in HITL mode: human-in-the-loop interaction protocol]',
};

const USER_CLAUDE_DIR = path.join(os.homedir(), '.claude');
const USER_CLAUDE_MD = path.join(USER_CLAUDE_DIR, 'CLAUDE.md');

/**
 * Safely read a file; returns empty string on ENOENT.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function safeReadFile(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

/**
 * Build guidance lines for prompt-preview (mirrors SwarmEngine._buildAgentGuidanceLines).
 * @param {object} node - agent node definition
 * @returns {string[]}
 */
function buildGuidanceLines(node) {
  const data = node?.data ?? {};
  const lines = [];
  if (Array.isArray(data.tools) && data.tools.length > 0) {
    lines.push(`Tool boundary: ${data.tools.join(', ')}`);
  }
  if (Array.isArray(data.skillHints) && data.skillHints.length > 0) {
    lines.push(`Preferred skills/workflows: ${data.skillHints.join(', ')}`);
  }
  if (Array.isArray(data.contextSources) && data.contextSources.length > 0) {
    lines.push(`Context/source focus: ${data.contextSources.join(', ')}`);
  }
  if (data.expectedOutputContract && typeof data.expectedOutputContract === 'object') {
    const format = typeof data.expectedOutputContract.format === 'string'
      ? data.expectedOutputContract.format
      : 'markdown';
    const instructions = typeof data.expectedOutputContract.instructions === 'string'
      ? data.expectedOutputContract.instructions.trim()
      : '';
    lines.push(`Expected output contract format: ${format}`);
    if (instructions) {
      lines.push(`Expected output contract instructions: ${instructions}`);
    }
  }
  if (typeof data.expectedOutput === 'string' && data.expectedOutput.trim()) {
    const format = typeof data.expectedOutputFormat === 'string' && data.expectedOutputFormat.trim()
      ? ` (${data.expectedOutputFormat.trim()})`
      : '';
    lines.push(`Expected output${format}: ${data.expectedOutput.trim()}`);
  }
  return lines;
}

function getAgentNodeById(workflowDef, nodeId) {
  return workflowDef?.nodes?.find((node) => node.id === nodeId && node.type === 'agent') ?? null;
}

function isAgentInDepartment(agentNode, departmentId) {
  if (!agentNode || !departmentId) return false;
  return agentNode.parentId === departmentId || agentNode.data?.parentDepartmentId === departmentId;
}

export function resolveBroadcastNodeTargets(execution, scope, targetId) {
  const normalizedScope = scope === 'department' || scope === 'agent' ? scope : 'all';
  const targets = [];

  for (const [nodeId, state] of Object.entries(execution.agentStates ?? {})) {
    const agentNode = getAgentNodeById(execution.workflowDef, nodeId);
    if (!agentNode) continue;

    const matchesScope =
      normalizedScope === 'all'
      || (normalizedScope === 'agent' && nodeId === targetId)
      || (normalizedScope === 'department' && isAgentInDepartment(agentNode, targetId));

    if (!matchesScope) continue;

    targets.push({
      nodeId,
      sessionId: state?.sessionId ?? null,
      label: agentNode.data?.label || nodeId,
    });
  }

  return targets;
}

export function serializeSessionOutput(session) {
  if (!session?.buffer) return '';
  if (typeof session.buffer.toBuffer === 'function') {
    return session.buffer.toBuffer().toString('utf8');
  }
  return String(session.buffer);
}

/**
 * Factory function â€” returns an Express router with all swarm execution control endpoints.
 *
 * @param {import('../services/SwarmEngine.js').default} swarmEngine
 * @param {import('../services/SessionManager.js').SessionManager} sessionManager
 * @param {{ claudeBin?: string|null, codexBin?: string|null }} scaffoldProviders
 * @returns {Router}
 */
export default function swarmRoutes(swarmEngine, sessionManager, scaffoldProviders = {}) {
  const router = Router();

  router.get('/runtime-capabilities', (_req, res) => {
    return res.status(200).json(getRuntimeCapabilitySnapshot(sessionManager));
  });

  router.post('/compiled-preview', (req, res) => {
    try {
      const {
        workflowDef,
        workflowInput,
        pack,
        packInput,
        runtimeProvider,
        runtimeModels,
        selectedAgentId,
      } = req.body ?? {};

      const preview = compileExecutionContract({
        workflowDef,
        workflowInput,
        pack,
        packInput,
        runtimeProvider,
        runtimeModels,
        selectedAgentId,
        runtimeSnapshot: getRuntimeCapabilitySnapshot(sessionManager),
      });

      if (!preview.ok) {
        return res.status(400).json({
          error: 'Compiled execution preview is invalid',
          preview,
          details: preview.errors,
        });
      }

      return res.status(200).json({ preview });
    } catch (err) {
      console.error(`[swarm] POST /compiled-preview error: ${err.message}`);
      return res.status(err.statusCode ?? 500).json({
        error: err.message ?? 'Internal server error',
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/prompt-preview
  // Simulates system-prompt assembly for a single agent node without a live
  // execution.  Returns block-level metadata, the assembled prompt text,
  // token estimates, and the CLI injection envelope.
  //
  // Body: { workflowDef, selectedAgentId, blockId?, projectId? }
  // → 200 { blocks, assembledPrompt, totalTokenEstimate, blockCount, cliInjections }
  // → 400 if workflowDef or selectedAgentId missing
  // → 404 if selectedAgentId not found in workflowDef.nodes
  // -------------------------------------------------------------------------
  router.post('/prompt-preview', async (req, res) => {
    try {
      const { workflowDef, selectedAgentId, blockId } = req.body ?? {};

      if (!workflowDef || typeof workflowDef !== 'object') {
        return res.status(400).json({ error: 'workflowDef is required and must be an object' });
      }
      if (!selectedAgentId || typeof selectedAgentId !== 'string') {
        return res.status(400).json({ error: 'selectedAgentId is required and must be a string' });
      }

      const node = (workflowDef.nodes || []).find((n) => n.id === selectedAgentId);
      if (!node) {
        return res.status(404).json({ error: `Agent ${selectedAgentId} not found in workflow` });
      }

      // Derive handoff targets from edges
      const handoffTargets = (workflowDef.edges || [])
        .filter((e) => e.source === selectedAgentId)
        .map((e) => e.target);

      // Build a mock workflow context from the definition
      const workflowContext = {
        currentTask: workflowDef.settings?.currentTask || '',
        workflowDescription: workflowDef.description || '',
        packKnowledge: workflowDef.settings?.packKnowledge || null,
        packBehaviorDirectives: workflowDef.settings?.packBehaviorDirectives || [],
        workflowRun: null,
      };

      const visibility = node.data?.contextVisibility || 'full';

      // Determine block order and disabled set (mirrors SwarmEngine._buildSystemPrompt)
      const blockOrder = Array.isArray(node.data?.promptBlockOrder)
        ? [...node.data.promptBlockOrder]
        : [...PREVIEW_DEFAULT_BLOCK_ORDER];
      const blockDisabled =
        node.data?.promptBlockDisabled && typeof node.data.promptBlockDisabled === 'object'
          ? node.data.promptBlockDisabled
          : {};

      // Ensure any missing default blocks are appended at the end
      for (const def of PREVIEW_DEFAULT_BLOCK_ORDER) {
        if (!blockOrder.includes(def)) {
          blockOrder.push(def);
        }
      }

      // Build each block
      const blocks = [];
      for (const bid of blockOrder) {
        const meta = BLOCK_METADATA[bid];
        if (!meta) continue;

        const enabled = !blockDisabled[bid] || PREVIEW_SYSTEM_BLOCKS.has(bid);
        let compiledText = '';

        if (RUNTIME_PLACEHOLDERS[bid]) {
          // Runtime-only blocks show placeholder text
          compiledText = RUNTIME_PLACEHOLDERS[bid];
        } else {
          // Compute user / pack / system blocks inline
          switch (bid) {
            case 'role': {
              const mission = (node.data?.mission || '').trim();
              const systemPrompt = (node.data?.systemPrompt || '').trim();
              const parts = [mission, systemPrompt].filter(Boolean);
              if (parts.length > 0) {
                compiledText = '=== YOUR ROLE ===\n' + parts.join('\n');
              } else {
                const fb = [];
                if (workflowContext.currentTask) fb.push('Current task: ' + workflowContext.currentTask);
                if (workflowContext.workflowDescription) fb.push('Workflow goal: ' + workflowContext.workflowDescription);
                compiledText = fb.join('\n');
              }
              break;
            }

            case 'guardrails': {
              const g = (node.data?.guardrails || '').trim();
              if (g) compiledText = '=== GUARDRAILS ===\n' + g;
              break;
            }

            case 'guidance': {
              const lines = buildGuidanceLines(node);
              if (lines.length > 0) {
                compiledText =
                  '=== AGENT QUALITY GUIDANCE ===\n' +
                  lines.join('\n') +
                  '\nThese controls guide and expose expected behavior in wave 1; they are not a hard policy engine.';
              }
              break;
            }

            case 'pack-knowledge': {
              const pk = workflowContext.packKnowledge;
              if (pk && typeof pk === 'object' && Object.keys(pk).length > 0) {
                compiledText = '=== PACK KNOWLEDGE / CONTEXT ===\n' + JSON.stringify(pk, null, 2);
              }
              break;
            }

            case 'pack-rules': {
              const dirs = workflowContext.packBehaviorDirectives;
              if (Array.isArray(dirs) && dirs.length > 0) {
                compiledText =
                  '=== PACK BEHAVIOR RULES ===\n' +
                  dirs.map((r) => `- ${r.name || r.id}: ${r.instruction}`).join('\n');
              }
              break;
            }

            case 'protocol': {
              const pl = ['=== PROTOCOL ===', 'Do real work before emitting any control token.'];
              if (handoffTargets.length > 0) {
                pl.push('When done, last line: __HANDOFF__:<targetId>:{“summary”:”...”,”result”:”...”}');
                pl.push('Valid targets: ' + handoffTargets.join(', '));
                if (handoffTargets.length === 1) {
                  pl.push(`For this workflow, <targetId> must be ${handoffTargets[0]}.`);
                }
              } else {
                pl.push('You are the final agent. When done, last line: __DONE__');
              }
              pl.push('Token must be plain text on its own last line, no fences or formatting.');
              compiledText = pl.join('\n');
              break;
            }

            case 'hitl': {
              if (workflowDef.settings?.mode === 'hitl') {
                compiledText = [
                  '=== HITL (Human-in-the-Loop) ===',
                  'You are running in HITL mode. When you need human input, feedback, a decision, or approval, emit on its own line:',
                  '__HITL__:{“question”:”your question or request for the human”}',
                  'To offer multiple-choice options the human can pick from, add an “options” array:',
                  '__HITL__:{“question”:”Which approach?”,”options”:[“Option A”,”Option B”,”Option C”]}',
                  'The human can select one or more options and optionally add free-text notes.',
                  '”options” is optional \u2014 omit it for open-ended questions. Keep options concise (3-6 recommended).',
                  'The workflow will pause and present your question to the human operator.',
                  'After the human responds, you will receive their answer and can continue your work.',
                  'Only use __HITL__ when you genuinely need human input \u2014 not for status updates.',
                ].join('\n');
              }
              break;
            }

            // Unknown user/pack/system block — leave empty
            default:
              break;
          }
        }

        // If no real content, use a descriptive placeholder
        if (!compiledText && EMPTY_PLACEHOLDERS[bid]) {
          compiledText = EMPTY_PLACEHOLDERS[bid];
        }

        const tokenEstimate = Math.ceil((compiledText || '').length / 4);

        // If filtering to a single block, skip non-matching blocks
        if (blockId && bid !== blockId) continue;

        blocks.push({
          id: bid,
          title: meta.title,
          source: meta.source,
          enabled,
          compiledText: compiledText || '',
          tokenEstimate,
        });
      }

      // Assembled prompt: only enabled blocks with non-empty text
      const assembledPrompt = blocks
        .filter((b) => b.enabled && b.compiledText)
        .map((b) => b.compiledText)
        .join('\n\n');

      const totalTokenEstimate = Math.ceil(assembledPrompt.length / 4);

      // --- CLI injections envelope ---
      const nodeTools = Array.isArray(node.data?.tools) && node.data.tools.length > 0
        ? node.data.tools
        : ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'LS'];
      const nodeModel = node.data?.model || 'opus';
      const launchFlags = [
        '--model', nodeModel,
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--tools', nodeTools.join(','),
      ];

      // Attempt to read CLAUDE.md from the project path
      let claudeMdContent = null;
      let claudeMdPath = null;
      const projectId = req.body.projectId || workflowDef.projectId;
      if (projectId && typeof projectId === 'string') {
        const project = ConfigStore.getProjects().find((p) => p.id === projectId);
        if (project?.path) {
          const candidatePath = path.join(project.path, 'CLAUDE.md');
          const content = await safeReadFile(candidatePath);
          if (content) {
            claudeMdContent = content;
            claudeMdPath = candidatePath;
          }
        }
      }

      const bootstrapPrompt =
        'Claude runtime is active for this Swarm agent.\nContinue the workflow using the shared task context below.';
      const cliTexts = [bootstrapPrompt, launchFlags.join(' ')];
      if (claudeMdContent) cliTexts.push(claudeMdContent);

      const cliInjections = {
        bootstrapPrompt,
        appendSystemPrompt: null,
        launchFlags,
        claudeMdContent,
        claudeMdPath,
        toolsAllowlist: nodeTools,
        totalCliTokenEstimate: Math.ceil(cliTexts.join(' ').length / 4),
      };

      return res.status(200).json({
        blocks,
        assembledPrompt,
        totalTokenEstimate,
        blockCount: blocks.filter((b) => b.enabled && b.compiledText).length,
        cliInjections,
      });
    } catch (err) {
      console.error(`[swarm] POST /prompt-preview error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // Execution History Store â€” initialized lazily on first use
  // -------------------------------------------------------------------------
  function getHistoryStore(appLocals = null) {
    return getExecutionHistoryStore(appLocals);
  }

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/history/:workflowId
  // Returns all execution history entries for a workflow.
  // â†’ 200 { executions: [...] }
  // -------------------------------------------------------------------------
  router.get('/history/:workflowId', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const store = getHistoryStore();
      const executions = await store.getHistory(workflowId);
      return res.status(200).json({ executions });
    } catch (err) {
      console.error(`[swarm] GET /history/:workflowId error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/history/:workflowId/:executionId
  // Returns a single execution history entry.
  // â†’ 200 { execution: {...} }
  // â†’ 404 if entry not found
  // -------------------------------------------------------------------------
  router.get('/history/:workflowId/:executionId', async (req, res) => {
    try {
      const { workflowId, executionId } = req.params;
      const store = getHistoryStore();
      const entry = await store.getEntry(workflowId, executionId);

      if (!entry) {
        return res.status(404).json({ error: 'Execution history entry not found' });
      }

      return res.status(200).json({ execution: entry });
    } catch (err) {
      console.error(`[swarm] GET /history/:workflowId/:executionId error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/scaffold
  // Body: { prompt: string, projectId?: string }
  // Calls the configured scaffold provider(s) to generate a workflow definition,
  // then saves it to WorkflowStore.
  // â†’ 201 { workflowId, workflowDef }
  // â†’ 400 if prompt missing, empty, or > 2000 chars
  // â†’ 503 if WorkflowStore or scaffold providers are unavailable
  // â†’ 500 on provider failure or invalid response
  // IMPORTANT: This literal route must be declared BEFORE /:workflowId/* routes
  //            so Express does not treat 'scaffold' as a workflowId param.
  // -------------------------------------------------------------------------
  router.post('/scaffold', async (req, res) => {
    const { prompt, projectId } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'prompt exceeds 2000 character limit' });
    }

    if (!scaffoldProviders.claudeBin && !scaffoldProviders.codexBin) {
      return res.status(503).json({ error: 'No scaffold provider configured â€” restart the server' });
    }

    try {
      const workflowDef = await generateWorkflowFromPrompt({
        prompt: prompt.trim(),
        claudeBin: scaffoldProviders.claudeBin,
        codexBin: scaffoldProviders.codexBin,
        geminiBin: scaffoldProviders.geminiBin,
      });

      if (projectId && typeof projectId === 'string') {
        workflowDef.projectId = projectId.trim();
      }

      const store = req.app.locals.workflowStore;
      if (!store) return res.status(503).json({ error: 'WorkflowStore unavailable' });

      const created = await store.create(workflowDef);
      return res.status(201).json({ workflowId: created.id, workflowDef: created });
    } catch (err) {
      console.error(`[swarm] POST /scaffold error: ${err.message}`);
      return res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:workflowId/start
  // Body: { projectId, projectPath, runtimeProvider? }
  // â†’ 201 { executionId, status, runtimeProvider, providerStrategy, lastFallback? }
  // â†’ 400 if projectId or projectPath missing
  // â†’ 404 if workflowId not found
  // -------------------------------------------------------------------------
  router.post('/:workflowId/start', async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { projectId, projectPath, runtimeProvider, provider, runtimeModels, workflowInput, input } = req.body ?? {};

      if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
        return res.status(400).json({ error: 'projectId is required' });
      }
      if (!projectPath || typeof projectPath !== 'string' || projectPath.trim() === '') {
        return res.status(400).json({ error: 'projectPath is required' });
      }

      let executionId;
      try {
        executionId = await swarmEngine.startExecution(workflowId, projectId.trim(), projectPath.trim(), {
          runtimeProvider: runtimeProvider ?? provider,
          runtimeModels: runtimeModels && typeof runtimeModels === 'object' ? runtimeModels : undefined,
          ...(Object.prototype.hasOwnProperty.call(req.body ?? {}, 'workflowInput')
            || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'input')
            ? { workflowInput: workflowInput ?? input ?? {} }
            : {}),
        });
      } catch (err) {
        if (err.message === 'Workflow not found') {
          return res.status(404).json({ error: 'Workflow not found' });
        }
        if (err.statusCode) {
          return res.status(err.statusCode).json({
            error: err.message,
            code: err.code ?? null,
            ...(Array.isArray(err.details) ? { details: err.details } : {}),
          });
        }
        throw err;
      }

      const status = swarmEngine.getStatus(executionId);
      return res.status(201).json({
        executionId,
        status: status?.status ?? 'running',
        runtimeProvider: status?.runtimeProvider ?? null,
        activeProvider: status?.activeProvider ?? null,
        providerStrategy: status?.providerStrategy ?? null,
        lastFallback: status?.lastFallback ?? null,
        ...(status?.workflowRun ? { workflowRun: status.workflowRun } : {}),
      });
    } catch (err) {
      console.error(`[swarm] POST /:workflowId/start error: ${err.message}`);
      return res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/pause
  // Canonical pause transition. SwarmEngine owns PTY interruption + status updates.
  // â†’ 200 { ok: true }
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/pause', async (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      if (execution.status !== 'running') {
        return res.status(409).json({ error: `Execution cannot be paused from status '${execution.status}'` });
      }

      const nextStatus = swarmEngine.pauseExecution(executionId);

      return res.status(200).json({ ok: true, status: nextStatus?.status ?? 'paused' });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/pause error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/resume
  // Canonical resume transition. SwarmEngine owns PTY re-entry + status updates.
  // â†’ 200 { ok: true }
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/resume', async (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      if (execution.status !== 'paused') {
        return res.status(409).json({ error: `Execution cannot be resumed from status '${execution.status}'` });
      }

      const nextStatus = await swarmEngine.resumeExecution(executionId);

      return res.status(200).json({ ok: true, status: nextStatus?.status ?? 'running' });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/resume error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/swarm/:executionId
  // â†’ 204 (no content)
  // -------------------------------------------------------------------------
  router.delete('/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;
      const nodeId = typeof req.query?.nodeId === 'string' ? req.query.nodeId : null;
      const mode = typeof req.query?.mode === 'string' ? req.query.mode : 'forced';
      const execution = swarmEngine.getStatus(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      if (nodeId) {
        const agentState = execution.agentStates?.[nodeId];
        if (!agentState) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        if (!STRUCTURED_AGENT_SPAWN_MODES.has(agentState.spawnMode)) {
          return res.status(409).json({ error: 'Agent is not using a structured runtime mode' });
        }
        await swarmEngine.stopStreamJsonAgent(executionId, nodeId, mode);
        return res.status(204).end();
      }

      await swarmEngine.stopExecution(executionId);
      return res.status(204).end();
    } catch (err) {
      console.error(`[swarm] DELETE /:executionId error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/:executionId/status
  // â†’ 200 { executionId, status, agentStates, edgeCounters, budget }
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/status', (req, res) => {
    try {
      const { executionId } = req.params;
      const status = swarmEngine.getStatus(executionId);

      if (!status) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      return res.status(200).json(status);
    } catch (err) {
      console.error(`[swarm] GET /:executionId/status error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/:executionId/agent/:nodeId/output
  // Returns the ring buffer contents for the agent's PTY session.
  // Falls back to persisted/live execution output when the PTY session no
  // longer exists, so completed/stopped nodes remain inspectable.
  // â†’ 200 { output: string }
  // â†’ 404 if execution or agent not found
  // -------------------------------------------------------------------------
  router.get('/:executionId/agent/:nodeId/output', async (req, res) => {
    try {
      const { executionId, nodeId } = req.params;
      const workflowIdHint = req.query.workflowId || null;
      let execution = swarmEngine.getStatus(executionId);

      if (!execution) {
        const result = await lookupExecution(executionId, workflowIdHint, req.app.locals, swarmEngine);
        if (!result) {
          return res.status(404).json({ error: 'Execution not found' });
        }

        if (result.source === 'history') {
          const persistedOutput = result.data?.agentOutputs?.[nodeId]?.finalText || '';
          if (!persistedOutput) {
            return res.status(404).json({ error: 'Agent output not found' });
          }
          return res.status(200).json({ output: persistedOutput });
        }

        execution = result.data;
      }

      const agentState = execution.agentStates?.[nodeId];
      if (!agentState) {
        return res.status(404).json({ error: 'Agent not found in execution' });
      }

      if (agentState.sessionId) {
        const session = sessionManager.getSession(agentState.sessionId);
        if (session) {
          return res.status(200).json({ output: serializeSessionOutput(session) });
        }
      }

      const liveResults = buildLiveExecutionResults(execution, execution?.workflowDef?.name || '', swarmEngine);
      const fallbackOutput =
        liveResults.agentOutputs?.[nodeId]?.finalText
        || agentState.lastChatSnippet
        || agentState.lastOutputSnippet
        || '';

      if (!fallbackOutput) {
        return res.status(404).json({ error: 'Agent output not found' });
      }

      return res.status(200).json({ output: fallbackOutput });
    } catch (err) {
      console.error(`[swarm] GET /:executionId/agent/:nodeId/output error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/swarm/:executionId/broadcast
  // Body: { text, scope: 'all' | departmentId | agentNodeId, mode: 'soft' | 'hard' }
  // Sends text to messageable agents filtered by scope.
  // Soft: text + ESC + newline. Hard: Ctrl-C â†’ wait 300ms â†’ text + ESC â†’ wait 100ms â†’ newline.
  // Fire-and-forget for hard mode delays (setTimeout, no await).
  // â†’ 200 { sent: number }
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.post('/:executionId/broadcast', async (req, res) => {
    try {
      const { executionId } = req.params;
      const { text, scope, targetId, mode } = req.body ?? {};

      const execution = swarmEngine.getStatus(executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      if (typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required and must be a string' });
      }

      if (scope && !['all', 'department', 'agent'].includes(scope)) {
        return res.status(400).json({ error: "scope must be 'all', 'department', or 'agent'" });
      }
      if ((scope === 'department' || scope === 'agent') && (!targetId || typeof targetId !== 'string')) {
        return res.status(400).json({ error: 'targetId is required for department and agent broadcasts' });
      }

      const broadcastMode = mode === 'hard' ? 'hard' : 'soft';
      const executionRecord = swarmEngine.getExecution(executionId);
      const targets = resolveBroadcastNodeTargets(
        {
          ...execution,
          workflowDef: executionRecord?.workflowDef ?? null,
        },
        scope,
        targetId
      );

      const deliveries = [];
      for (const target of targets) {
        const result = typeof swarmEngine.sendBroadcast === 'function'
          ? await swarmEngine.sendBroadcast(executionId, target.nodeId, text.trim(), { mode: broadcastMode })
          : null;

        if (!result?.sent) continue;

        deliveries.push({
          nodeId: target.nodeId,
          delivery: result.delivery ?? 'injected',
        });
      }

      // Emit user message to chat for each recipient
      for (const delivery of deliveries) {
        if (typeof swarmEngine.emitUserChatMessage === 'function') {
          swarmEngine.emitUserChatMessage(executionId, delivery.nodeId, text.trim());
        }
      }

      return res.status(200).json({
        sent: deliveries.length,
        scope: scope ?? 'all',
        targetId: targetId ?? null,
        recipientNodeIds: deliveries.map((target) => target.nodeId),
        deliveries,
      });
    } catch (err) {
      console.error(`[swarm] POST /:executionId/broadcast error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // UUID validation regex â€” shared by results and artifact endpoints
  // -------------------------------------------------------------------------
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/executions/:executionId/results
  // Returns execution results â€” agent outputs, aggregated artifact, and meta.
  // Looks up in live SwarmEngine first, then in persisted history.
  // Optional query param: ?workflowId= to speed up history lookup.
  // â†’ 200 { executionId, workflowName, status, agentOutputs, aggregatedArtifact, meta }
  // â†’ 400 if executionId is not a valid UUID
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/executions/:executionId/results', async (req, res) => {
    try {
      const { executionId } = req.params;

      if (!UUID_RE.test(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID format' });
      }

      const workflowIdHint = req.query.workflowId || null;
      const result = await lookupExecution(executionId, workflowIdHint, req.app.locals, swarmEngine);

      if (!result) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      return res.status(200).json(buildExecutionResultsPayload(result, swarmEngine));
    } catch (err) {
      console.error(`[swarm] GET /executions/:executionId/results error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/swarm/executions/:executionId/artifact.md
  // Downloads the aggregated artifact as a Markdown file.
  // Optional query param: ?workflowId= to speed up history lookup.
  // â†’ 200 text/markdown with Content-Disposition attachment
  // â†’ 400 if executionId is not a valid UUID
  // â†’ 404 if execution not found
  // -------------------------------------------------------------------------
  router.get('/executions/:executionId/artifact.md', async (req, res) => {
    try {
      const { executionId } = req.params;

      if (!UUID_RE.test(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID format' });
      }

      const workflowIdHint = req.query.workflowId || null;
      const result = await lookupExecution(executionId, workflowIdHint, req.app.locals, swarmEngine);

      if (!result) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      // Determine artifact content
      let artifactContent = '';
      if (result.source === 'history') {
        artifactContent = result.data.aggregatedArtifact || '';
      } else if (TERMINAL_EXECUTION_STATUSES.has(result.data?.status)) {
        artifactContent = buildExecutionResultsPayload(result, swarmEngine)?.aggregatedArtifact || '';
      }

      // Build safe filename
      const safeName = (result.workflowName || result.data?.workflowDef?.name || 'workflow')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 64) || 'workflow';
      const shortId = executionId.substring(0, 8);

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${shortId}.md"`);
      return res.send(artifactContent);
    } catch (err) {
      console.error(`[swarm] GET /executions/:executionId/artifact.md error: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
