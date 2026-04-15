// tests/prompt-block-editor.test.js
// Integration tests for V19.0 Prompt Block Editor — Tasks #757, #758, #759.
//
// Covers:
//   1. Individual _buildBlock_* methods (role, guardrails, guidance, protocol, hitl)
//   2. Block order and assembly (custom order, disabled blocks, system block immunity)
//   3. Runtime block order verification via _buildSystemPrompt
//   4. POST /api/v1/swarm/prompt-preview endpoint logic
//
// SwarmEngine is instantiated with a fully-mocked SessionManager (no real PTY).

import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SwarmEngine from '../services/SwarmEngine.js';
import CircuitBreaker from '../services/CircuitBreaker.js';
import BudgetTracker from '../services/BudgetTracker.js';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockCreateInterface = vi.hoisted(() => vi.fn());
const mockTreeKill = vi.hoisted(() => vi.fn((pid, signal, cb) => cb?.(null)));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('readline', () => ({
  createInterface: mockCreateInterface,
}));

vi.mock('tree-kill', () => mockTreeKill);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMinimalWorkflow(nodeOverrides = {}) {
  return {
    id: 'wf-test',
    name: 'Test Workflow',
    description: 'A test workflow for prompt block editor.',
    nodes: [
      {
        id: 'node-a',
        data: {
          isTriageNode: true,
          systemPrompt: 'You are agent A.',
          ...nodeOverrides,
        },
      },
      { id: 'node-b', data: { systemPrompt: 'You are agent B.' } },
    ],
    edges: [
      { id: 'edge-ab', source: 'node-a', target: 'node-b' },
    ],
    settings: { budgetTokens: 0, circuitBreakerThreshold: 10 },
    initialContext: {},
  };
}

function buildSoloWorkflow(nodeOverrides = {}) {
  return {
    id: 'wf-solo',
    name: 'Solo Workflow',
    description: 'Single-node workflow for prompt block tests.',
    nodes: [
      {
        id: 'node-solo',
        data: {
          isTriageNode: true,
          systemPrompt: 'You are the solo agent.',
          ...nodeOverrides,
        },
      },
    ],
    edges: [],
    settings: { budgetTokens: 0, circuitBreakerThreshold: 10 },
    initialContext: {},
  };
}

function createMockSession(sessionId) {
  const session = {
    sessionId,
    buffer: [],
    onData: vi.fn(),
    onExit: vi.fn(),
    swarmListeners: new Set(),
  };
  return session;
}

function buildMocks() {
  const sessions = new Map();
  const mockSession = createMockSession('sess-test');
  sessions.set(mockSession.sessionId, mockSession);

  let sessionCallCount = 0;
  const mockSessionManager = {
    claudeBin: '/usr/local/bin/claude',
    codexBin: '/usr/local/bin/codex',
    geminiBin: '/usr/local/bin/gemini',
    createSession: vi.fn().mockImplementation(async () => {
      sessionCallCount++;
      const sid = `sess-test-${sessionCallCount}`;
      const s = createMockSession(sid);
      sessions.set(sid, s);
      return s;
    }),
    getSession: vi.fn().mockImplementation((sid) => sessions.get(sid) ?? null),
    writeInput: vi.fn(),
    killSession: vi.fn().mockResolvedValue(undefined),
  };

  return { mockSession, mockSessionManager };
}

function buildDefaultMockStreamJsonChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: vi.fn() };
  child.pid = 9900 + Math.floor(Math.random() * 100);
  child.killed = false;
  return child;
}

function buildDefaultMockReadline() {
  const rl = new EventEmitter();
  rl.close = vi.fn();
  return rl;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('V19.0 Prompt Block Editor', () => {
  let wsBroadcast;
  let mockSession;
  let mockSessionManager;
  let workflowStoreMock;
  let circuitBreaker;
  let budgetTracker;
  let engine;

  beforeEach(() => {
    vi.useFakeTimers();
    wsBroadcast = vi.fn();
    mockSpawn.mockReset();
    mockCreateInterface.mockReset();
    mockTreeKill.mockClear();

    mockSpawn.mockImplementation(() => buildDefaultMockStreamJsonChild());
    mockCreateInterface.mockImplementation(() => buildDefaultMockReadline());

    ({ mockSession, mockSessionManager } = buildMocks());

    const wf = buildMinimalWorkflow();
    workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };

    circuitBreaker = new CircuitBreaker();
    budgetTracker = new BudgetTracker();

    engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
    engine.setWsBroadcast(wsBroadcast);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Test Group 1: Block functions (Task #757)
  // =========================================================================

  describe('block functions', () => {
    it('_buildBlock_role merges mission and systemPrompt when both are set', () => {
      const node = {
        id: 'node-test',
        data: {
          mission: 'You are the lead researcher.',
          systemPrompt: 'Focus on scientific papers only.',
        },
      };
      const workflowContext = { currentTask: 'Research AI', workflowDescription: 'Science workflow' };

      const result = engine._buildBlock_role(node, workflowContext);

      expect(result).toContain('=== YOUR ROLE ===');
      expect(result).toContain('You are the lead researcher.');
      expect(result).toContain('Focus on scientific papers only.');
      // Mission should appear before systemPrompt
      const missionIdx = result.indexOf('You are the lead researcher.');
      const promptIdx = result.indexOf('Focus on scientific papers only.');
      expect(missionIdx).toBeLessThan(promptIdx);
    });

    it('_buildBlock_role uses only mission when systemPrompt is empty', () => {
      const node = { id: 'node-test', data: { mission: 'You handle security audits.', systemPrompt: '' } };
      const workflowContext = { currentTask: '', workflowDescription: '' };

      const result = engine._buildBlock_role(node, workflowContext);

      expect(result).toContain('=== YOUR ROLE ===');
      expect(result).toContain('You handle security audits.');
    });

    it('_buildBlock_role uses only systemPrompt when mission is absent', () => {
      const node = { id: 'node-test', data: { systemPrompt: 'You are the code reviewer.' } };
      const workflowContext = {};

      const result = engine._buildBlock_role(node, workflowContext);

      expect(result).toContain('=== YOUR ROLE ===');
      expect(result).toContain('You are the code reviewer.');
    });

    it('_buildBlock_role falls back to currentTask and workflowDescription when neither mission nor systemPrompt is set', () => {
      const node = { id: 'node-test', data: {} };
      const workflowContext = {
        currentTask: 'Analyze codebase',
        workflowDescription: 'Code analysis pipeline',
      };

      const result = engine._buildBlock_role(node, workflowContext);

      expect(result).not.toContain('=== YOUR ROLE ===');
      expect(result).toContain('Current task: Analyze codebase');
      expect(result).toContain('Workflow goal: Code analysis pipeline');
    });

    it('_buildBlock_role returns empty string when everything is empty', () => {
      const node = { id: 'node-test', data: {} };
      const workflowContext = {};

      const result = engine._buildBlock_role(node, workflowContext);

      expect(result).toBe('');
    });

    it('_buildBlock_guardrails injects guardrails text with header', () => {
      const node = { id: 'node-test', data: { guardrails: 'Never delete files. Always ask before writing.' } };

      const result = engine._buildBlock_guardrails(node);

      expect(result).toBe('=== GUARDRAILS ===\nNever delete files. Always ask before writing.');
    });

    it('_buildBlock_guardrails returns empty string when guardrails is empty', () => {
      const node = { id: 'node-test', data: { guardrails: '' } };
      const result = engine._buildBlock_guardrails(node);
      expect(result).toBe('');
    });

    it('_buildBlock_guardrails returns empty string when guardrails is undefined', () => {
      const node = { id: 'node-test', data: {} };
      const result = engine._buildBlock_guardrails(node);
      expect(result).toBe('');
    });

    it('_buildBlock_guardrails trims whitespace-only guardrails to empty', () => {
      const node = { id: 'node-test', data: { guardrails: '   \n  \t  ' } };
      const result = engine._buildBlock_guardrails(node);
      expect(result).toBe('');
    });

    it('_buildBlock_guidance wraps guidance lines when tools/skillHints/expectedOutput present', () => {
      const node = {
        id: 'node-test',
        data: {
          tools: ['Read', 'Grep', 'Bash'],
          skillHints: ['code-review'],
          expectedOutput: 'A comprehensive code review report',
        },
      };

      const result = engine._buildBlock_guidance(node);

      expect(result).toContain('=== AGENT QUALITY GUIDANCE ===');
      expect(result).toContain('Tool boundary: Read, Grep, Bash');
      expect(result).toContain('Preferred skills/workflows: code-review');
      expect(result).toContain('Expected output: A comprehensive code review report');
      expect(result).toContain('These controls guide and expose expected behavior in wave 1');
    });

    it('_buildBlock_guidance returns empty string when no guidance data exists', () => {
      const node = { id: 'node-test', data: {} };

      const result = engine._buildBlock_guidance(node);

      expect(result).toBe('');
    });

    it('_buildBlock_protocol produces HANDOFF protocol with targets', () => {
      const result = engine._buildBlock_protocol(['node-b', 'node-c']);

      expect(result).toContain('=== PROTOCOL ===');
      expect(result).toContain('__HANDOFF__');
      expect(result).toContain('Valid targets: node-b, node-c');
      expect(result).not.toContain('__DONE__');
    });

    it('_buildBlock_protocol produces DONE protocol when no targets (final agent)', () => {
      const result = engine._buildBlock_protocol([]);

      expect(result).toContain('=== PROTOCOL ===');
      expect(result).toContain('You are the final agent. When done, last line: __DONE__');
      expect(result).not.toContain('__HANDOFF__');
    });

    it('_buildBlock_protocol adds specific target instruction for single target', () => {
      const result = engine._buildBlock_protocol(['node-x']);

      expect(result).toContain('=== PROTOCOL ===');
      expect(result).toContain('__HANDOFF__');
      expect(result).toContain('For this workflow, <targetId> must be node-x.');
    });

    it('_buildBlock_hitl returns HITL section when mode is hitl', () => {
      const execution = {
        workflowDef: { settings: { mode: 'hitl' } },
      };

      const result = engine._buildBlock_hitl(execution);

      expect(result).toContain('=== HITL (Human-in-the-Loop) ===');
      expect(result).toContain('__HITL__');
      expect(result).toContain('"question"');
    });

    it('_buildBlock_hitl returns empty string when mode is autonomous', () => {
      const execution = {
        workflowDef: { settings: { mode: 'autonomous' } },
      };

      const result = engine._buildBlock_hitl(execution);

      expect(result).toBe('');
    });

    it('_buildBlock_hitl returns empty string when mode is unset', () => {
      const execution = {
        workflowDef: { settings: {} },
      };

      const result = engine._buildBlock_hitl(execution);

      expect(result).toBe('');
    });

    it('_buildBlock_hitl returns empty string when execution is null', () => {
      const result = engine._buildBlock_hitl(null);

      expect(result).toBe('');
    });

    it('_buildBlock_awareness returns empty when execution is null', () => {
      const result = engine._buildBlock_awareness(null, 'node-a');
      expect(result).toBe('');
    });

    it('_buildBlock_handoffs returns empty when no inbound handoffs', () => {
      const result = engine._buildBlock_handoffs([]);
      expect(result).toBe('');
    });

    it('_buildBlock_handoffs returns empty for null/undefined', () => {
      expect(engine._buildBlock_handoffs(null)).toBe('');
      expect(engine._buildBlock_handoffs(undefined)).toBe('');
    });

    it('_buildBlock_handoffs formats received handoffs', () => {
      const handoffs = [
        { sourceNodeId: 'node-a', sourceLabel: 'Agent A', payload: { summary: 'done step 1' } },
      ];

      const result = engine._buildBlock_handoffs(handoffs);

      expect(result).toContain('Received handoffs:');
      expect(result).toContain('From Agent A (node-a)');
      expect(result).toContain('done step 1');
    });

    it('_buildBlock_packKnowledge returns knowledge block when data present', () => {
      const workflowContext = {
        packKnowledge: { apiDocs: 'REST endpoint docs', version: '2.0' },
      };

      const result = engine._buildBlock_packKnowledge(workflowContext);

      expect(result).toContain('=== PACK KNOWLEDGE / CONTEXT ===');
      expect(result).toContain('apiDocs');
      expect(result).toContain('REST endpoint docs');
    });

    it('_buildBlock_packKnowledge returns empty when no knowledge', () => {
      expect(engine._buildBlock_packKnowledge({})).toBe('');
      expect(engine._buildBlock_packKnowledge({ packKnowledge: null })).toBe('');
      expect(engine._buildBlock_packKnowledge({ packKnowledge: {} })).toBe('');
    });

    it('_buildBlock_packRules returns rules block when directives present', () => {
      const workflowContext = {
        packBehaviorDirectives: [
          { name: 'no-delete', instruction: 'Never delete production files' },
          { id: 'format-check', instruction: 'Always run linter before commit' },
        ],
      };

      const result = engine._buildBlock_packRules(workflowContext);

      expect(result).toContain('=== PACK BEHAVIOR RULES ===');
      expect(result).toContain('- no-delete: Never delete production files');
      expect(result).toContain('- format-check: Always run linter before commit');
    });

    it('_buildBlock_packRules returns empty when no directives', () => {
      expect(engine._buildBlock_packRules({})).toBe('');
      expect(engine._buildBlock_packRules({ packBehaviorDirectives: [] })).toBe('');
    });
  });

  // =========================================================================
  // Test Group 2: Block order and assembly (Task #758)
  // =========================================================================

  describe('block order and assembly', () => {
    it('default order produces prompt with all user/system sections in correct order', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'Do not delete any files.',
        tools: ['Read', 'Bash'],
        expectedOutput: 'A summary report',
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      // All major sections should be present
      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).toContain('=== GUARDRAILS ===');
      expect(prompt).toContain('=== AGENT QUALITY GUIDANCE ===');
      expect(prompt).toContain('=== PROTOCOL ===');

      // Default order: role < guardrails < guidance < protocol
      const roleIdx = prompt.indexOf('=== YOUR ROLE ===');
      const guardrailsIdx = prompt.indexOf('=== GUARDRAILS ===');
      const guidanceIdx = prompt.indexOf('=== AGENT QUALITY GUIDANCE ===');
      const protocolIdx = prompt.indexOf('=== PROTOCOL ===');

      expect(roleIdx).toBeLessThan(guardrailsIdx);
      expect(guardrailsIdx).toBeLessThan(guidanceIdx);
      expect(guidanceIdx).toBeLessThan(protocolIdx);
    });

    it('custom promptBlockOrder changes section order', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'Safety first.',
        promptBlockOrder: ['protocol', 'role', 'guardrails'],
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      const protocolIdx = prompt.indexOf('=== PROTOCOL ===');
      const roleIdx = prompt.indexOf('=== YOUR ROLE ===');
      const guardrailsIdx = prompt.indexOf('=== GUARDRAILS ===');

      // Custom order: protocol < role < guardrails
      expect(protocolIdx).toBeLessThan(roleIdx);
      expect(roleIdx).toBeLessThan(guardrailsIdx);
    });

    it('promptBlockDisabled skips disabled blocks', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'Do not delete files.',
        promptBlockDisabled: { guardrails: true },
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).not.toContain('=== GUARDRAILS ===');
      expect(prompt).not.toContain('Do not delete files.');
      expect(prompt).toContain('=== PROTOCOL ===');
    });

    it('system blocks (protocol) cannot be disabled', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        promptBlockDisabled: { protocol: true },
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      // Protocol must still be present even though it was in the disabled set
      expect(prompt).toContain('=== PROTOCOL ===');
    });

    it('missing blocks in custom order are appended at end', () => {
      // Custom order only has 'role' — all other defaults should be appended
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'Safety rules here.',
        promptBlockOrder: ['role'],
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      // Role should be first (user-specified), protocol should still appear (appended)
      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).toContain('=== PROTOCOL ===');
      expect(prompt).toContain('=== GUARDRAILS ===');

      // Role should come before guardrails and protocol (which were appended)
      const roleIdx = prompt.indexOf('=== YOUR ROLE ===');
      const guardrailsIdx = prompt.indexOf('=== GUARDRAILS ===');
      const protocolIdx = prompt.indexOf('=== PROTOCOL ===');
      expect(roleIdx).toBeLessThan(guardrailsIdx);
      expect(roleIdx).toBeLessThan(protocolIdx);
    });

    it('unknown block IDs in custom order are silently ignored', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        promptBlockOrder: ['nonexistent-block', 'role', 'another-fake', 'protocol'],
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);

      // Should not throw
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).toContain('=== PROTOCOL ===');
      expect(prompt).not.toContain('nonexistent');
      expect(prompt).not.toContain('another-fake');
    });

    it('multiple blocks can be disabled simultaneously', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'No deletions.',
        tools: ['Read'],
        promptBlockDisabled: { guardrails: true, guidance: true, role: true },
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      expect(prompt).not.toContain('=== GUARDRAILS ===');
      expect(prompt).not.toContain('=== AGENT QUALITY GUIDANCE ===');
      expect(prompt).not.toContain('=== YOUR ROLE ===');
      // System block still present
      expect(prompt).toContain('=== PROTOCOL ===');
    });

    it('promptBlockDisabled with false values does not skip blocks', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'No deletions.',
        promptBlockDisabled: { guardrails: false },
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      expect(prompt).toContain('=== GUARDRAILS ===');
      expect(prompt).toContain('No deletions.');
    });
  });

  // =========================================================================
  // Test Group 3: Runtime block order verification (Task #759)
  // =========================================================================

  describe('runtime block order verification', () => {
    it('_buildSystemPrompt with custom order produces sections in that order', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'Test role',
        guardrails: 'Test guardrails',
        promptBlockOrder: ['guardrails', 'role', 'protocol'],
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      const guardrailsIdx = prompt.indexOf('=== GUARDRAILS ===');
      const roleIdx = prompt.indexOf('=== YOUR ROLE ===');
      const protocolIdx = prompt.indexOf('=== PROTOCOL ===');

      expect(guardrailsIdx).toBeGreaterThan(-1);
      expect(roleIdx).toBeGreaterThan(-1);
      expect(protocolIdx).toBeGreaterThan(-1);

      // Guardrails before role, role before protocol
      expect(guardrailsIdx).toBeLessThan(roleIdx);
      expect(roleIdx).toBeLessThan(protocolIdx);
    });

    it('disabled block is absent from assembled prompt', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'Test role',
        guardrails: 'This should not appear.',
        promptBlockDisabled: { guardrails: true },
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      expect(prompt).not.toContain('=== GUARDRAILS ===');
      expect(prompt).not.toContain('This should not appear.');
      expect(prompt).toContain('=== YOUR ROLE ===');
      expect(prompt).toContain('=== PROTOCOL ===');
    });

    it('default order node produces original-style prompt with role first and protocol last', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the default agent.',
        guardrails: 'Standard safety.',
        tools: ['Read'],
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      // No custom order: role < guardrails < guidance < protocol
      const roleIdx = prompt.indexOf('=== YOUR ROLE ===');
      const guardrailsIdx = prompt.indexOf('=== GUARDRAILS ===');
      const guidanceIdx = prompt.indexOf('=== AGENT QUALITY GUIDANCE ===');
      const protocolIdx = prompt.indexOf('=== PROTOCOL ===');

      expect(roleIdx).toBeGreaterThan(-1);
      expect(guardrailsIdx).toBeGreaterThan(-1);
      expect(guidanceIdx).toBeGreaterThan(-1);
      expect(protocolIdx).toBeGreaterThan(-1);

      expect(roleIdx).toBeLessThan(guardrailsIdx);
      expect(guardrailsIdx).toBeLessThan(guidanceIdx);
      expect(guidanceIdx).toBeLessThan(protocolIdx);
    });

    it('compact Codex provider path produces flat prompt, non-compact Codex uses block assembly', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'Codex agent.',
        guardrails: 'Some guardrails.',
        promptBlockOrder: ['guardrails', 'role', 'protocol'],
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);

      // Compact Codex path: produces flat format, no block headers
      const compactPrompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        'codex',
        { inboundHandoffs: [], compactCodexPrompt: true }
      );
      expect(compactPrompt).not.toContain('=== YOUR ROLE ===');
      expect(compactPrompt).not.toContain('=== GUARDRAILS ===');
      expect(compactPrompt).toContain('__HANDOFF__');

      // Non-compact Codex path: now uses block assembly (V19.0 refactor)
      const fullPrompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        'codex',
        { inboundHandoffs: [] }
      );
      // Non-compact Codex now uses composable blocks
      expect(fullPrompt).toContain('=== YOUR ROLE ===');
      expect(fullPrompt).toContain('=== GUARDRAILS ===');
      // Custom block order is respected
      const guardrailsIdx = fullPrompt.indexOf('=== GUARDRAILS ===');
      const roleIdx = fullPrompt.indexOf('=== YOUR ROLE ===');
      expect(guardrailsIdx).toBeLessThan(roleIdx);
    });

    it('solo agent (no handoff targets) gets __DONE__ protocol via blocks', () => {
      const wf = buildSoloWorkflow({
        systemPrompt: 'You do everything.',
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        [],
        null,
        { inboundHandoffs: [] }
      );

      expect(prompt).toContain('=== PROTOCOL ===');
      expect(prompt).toContain('__DONE__');
      expect(prompt).not.toContain('__HANDOFF__');
    });

    it('HITL block is included when execution mode is hitl', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'HITL agent.',
      });
      wf.settings.mode = 'hitl';
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        {
          inboundHandoffs: [],
          execution: { workflowDef: wf },
        }
      );

      expect(prompt).toContain('=== HITL (Human-in-the-Loop) ===');
      expect(prompt).toContain('__HITL__');
    });

    it('HITL block is absent when execution mode is not hitl', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'Autonomous agent.',
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        {
          inboundHandoffs: [],
          execution: { workflowDef: wf },
        }
      );

      expect(prompt).not.toContain('=== HITL (Human-in-the-Loop) ===');
      expect(prompt).not.toContain('__HITL__');
    });

    it('prompt sections are separated by double newlines', () => {
      const wf = buildMinimalWorkflow({
        systemPrompt: 'You are the triage agent.',
        guardrails: 'No deletions.',
      });
      workflowStoreMock = { get: vi.fn().mockResolvedValue(wf) };
      engine = new SwarmEngine(mockSessionManager, workflowStoreMock, circuitBreaker, budgetTracker);
      engine.setWsBroadcast(wsBroadcast);

      const workflowContext = engine._buildInitialWorkflowContext(wf);
      const prompt = engine._buildSystemPrompt(
        wf.nodes[0],
        workflowContext,
        ['node-b'],
        null,
        { inboundHandoffs: [] }
      );

      // Sections joined by '\n\n' — verify the guardrails header is preceded by \n\n
      const guardrailsIdx = prompt.indexOf('=== GUARDRAILS ===');
      const preceding = prompt.substring(guardrailsIdx - 2, guardrailsIdx);
      expect(preceding).toBe('\n\n');
    });
  });

  // =========================================================================
  // Test Group 4: Prompt preview endpoint
  // =========================================================================

  describe('prompt-preview endpoint logic', () => {
    // Since we're testing endpoint logic without supertest, we exercise the
    // route handler's logic by importing and calling the route module directly
    // via a mock req/res pattern.

    let swarmRoutes;
    let router;

    beforeEach(async () => {
      // Dynamically import swarm routes (top-level import would conflict with mocks)
      const mod = await import('../routes/swarm.js');
      swarmRoutes = mod.default;
      router = swarmRoutes(engine, mockSessionManager, {
        claudeBin: '/usr/local/bin/claude',
        codexBin: null,
      });
    });

    function createMockReqRes(body = {}) {
      const req = {
        body,
        params: {},
        query: {},
      };
      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        },
      };
      return { req, res };
    }

    // Find the prompt-preview handler from the router stack
    function findPromptPreviewHandler() {
      const layer = router.stack.find((l) =>
        l.route && l.route.path === '/prompt-preview' && l.route.methods.post
      );
      if (!layer) throw new Error('prompt-preview route not found in router');
      return layer.route.stack[0].handle;
    }

    it('returns all blocks with correct metadata for a fully populated agent', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview Workflow',
          description: 'Test preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: {
                systemPrompt: 'You are the preview agent.',
                guardrails: 'Be safe.',
                tools: ['Read', 'Write'],
                mission: 'Lead the review.',
              },
            },
            {
              id: 'agent-2',
              type: 'agent',
              data: { systemPrompt: 'Downstream.' },
            },
          ],
          edges: [{ id: 'e1', source: 'agent-1', target: 'agent-2' }],
          settings: {},
        },
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.blocks)).toBe(true);
      expect(typeof res.body.assembledPrompt).toBe('string');
      expect(typeof res.body.totalTokenEstimate).toBe('number');
      expect(typeof res.body.blockCount).toBe('number');
      expect(res.body.cliInjections).toBeDefined();
      expect(Array.isArray(res.body.cliInjections.launchFlags)).toBe(true);
      expect(Array.isArray(res.body.cliInjections.toolsAllowlist)).toBe(true);

      // Verify some specific blocks
      const roleBlock = res.body.blocks.find((b) => b.id === 'role');
      expect(roleBlock).toBeDefined();
      expect(roleBlock.title).toBe('Your Role');
      expect(roleBlock.source).toBe('user');
      expect(roleBlock.enabled).toBe(true);
      expect(roleBlock.compiledText).toContain('=== YOUR ROLE ===');
      expect(roleBlock.compiledText).toContain('Lead the review.');

      const guardrailsBlock = res.body.blocks.find((b) => b.id === 'guardrails');
      expect(guardrailsBlock).toBeDefined();
      expect(guardrailsBlock.compiledText).toContain('Be safe.');

      const protocolBlock = res.body.blocks.find((b) => b.id === 'protocol');
      expect(protocolBlock).toBeDefined();
      expect(protocolBlock.source).toBe('system');
      expect(protocolBlock.compiledText).toContain('__HANDOFF__');
    });

    it('respects blockId filter and returns only the requested block', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview Workflow',
          description: 'Test preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: {
                systemPrompt: 'Filtered agent.',
                guardrails: 'Filter guardrails.',
              },
            },
          ],
          edges: [],
          settings: {},
        },
        selectedAgentId: 'agent-1',
        blockId: 'role',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.blocks).toHaveLength(1);
      expect(res.body.blocks[0].id).toBe('role');
      expect(res.body.blocks[0].compiledText).toContain('Filtered agent.');
    });

    it('returns 400 for missing workflowDef', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('workflowDef');
    });

    it('returns 400 for missing selectedAgentId', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: { nodes: [], edges: [], settings: {} },
      });

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('selectedAgentId');
    });

    it('returns 404 for unknown agent', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview',
          nodes: [
            { id: 'agent-1', type: 'agent', data: { systemPrompt: 'Test.' } },
          ],
          edges: [],
          settings: {},
        },
        selectedAgentId: 'nonexistent-agent',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('nonexistent-agent');
    });

    it('disabled blocks are flagged as not enabled but still present in block list', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: {
                systemPrompt: 'Test.',
                guardrails: 'Disabled guardrails.',
                promptBlockDisabled: { guardrails: true },
              },
            },
          ],
          edges: [],
          settings: {},
        },
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      const guardrailsBlock = res.body.blocks.find((b) => b.id === 'guardrails');
      expect(guardrailsBlock).toBeDefined();
      expect(guardrailsBlock.enabled).toBe(false);

      // Disabled blocks should not appear in assembledPrompt
      expect(res.body.assembledPrompt).not.toContain('Disabled guardrails.');
    });

    it('system blocks remain enabled even when disabled flag is set', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: {
                systemPrompt: 'Test.',
                promptBlockDisabled: { protocol: true },
              },
            },
          ],
          edges: [],
          settings: {},
        },
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      const protocolBlock = res.body.blocks.find((b) => b.id === 'protocol');
      expect(protocolBlock).toBeDefined();
      expect(protocolBlock.enabled).toBe(true);
      expect(res.body.assembledPrompt).toContain('=== PROTOCOL ===');
    });

    it('runtime-only blocks show placeholder text', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: { systemPrompt: 'Test.' },
            },
          ],
          edges: [],
          settings: {},
        },
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      const awarenessBlock = res.body.blocks.find((b) => b.id === 'awareness');
      expect(awarenessBlock).toBeDefined();
      expect(awarenessBlock.source).toBe('runtime');
      expect(awarenessBlock.compiledText).toContain('[Populated at runtime');

      const inputsBlock = res.body.blocks.find((b) => b.id === 'inputs');
      expect(inputsBlock).toBeDefined();
      expect(inputsBlock.compiledText).toContain('[Populated at runtime');

      const handoffsBlock = res.body.blocks.find((b) => b.id === 'handoffs');
      expect(handoffsBlock).toBeDefined();
      expect(handoffsBlock.compiledText).toContain('[Populated at runtime');

      const historyBlock = res.body.blocks.find((b) => b.id === 'history');
      expect(historyBlock).toBeDefined();
      expect(historyBlock.compiledText).toContain('[Populated at runtime');
    });

    it('HITL block is populated when workflow mode is hitl', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: { systemPrompt: 'HITL agent.' },
            },
          ],
          edges: [],
          settings: { mode: 'hitl' },
        },
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      const hitlBlock = res.body.blocks.find((b) => b.id === 'hitl');
      expect(hitlBlock).toBeDefined();
      expect(hitlBlock.compiledText).toContain('HITL');
      expect(hitlBlock.compiledText).toContain('__HITL__');
    });

    it('cliInjections contains expected toolsAllowlist from node data', async () => {
      const handler = findPromptPreviewHandler();
      const { req, res } = createMockReqRes({
        workflowDef: {
          id: 'wf-preview',
          name: 'Preview',
          nodes: [
            {
              id: 'agent-1',
              type: 'agent',
              data: {
                systemPrompt: 'Tool agent.',
                tools: ['Read', 'Bash', 'Grep'],
                model: 'sonnet',
              },
            },
          ],
          edges: [],
          settings: {},
        },
        selectedAgentId: 'agent-1',
      });

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.cliInjections.toolsAllowlist).toEqual(['Read', 'Bash', 'Grep']);
      expect(res.body.cliInjections.launchFlags).toContain('--model');
      expect(res.body.cliInjections.launchFlags).toContain('sonnet');
    });
  });
});
