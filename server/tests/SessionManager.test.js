// tests/SessionManager.test.js
// Unit tests for SessionManager — mocks node-pty and ProcessRegistry
// so tests do not require a real PTY or filesystem state.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node-pty BEFORE importing SessionManager (hoisted mock)
// ---------------------------------------------------------------------------
vi.mock('node-pty', () => {
  const makeMockPty = () => ({
    pid: Math.floor(Math.random() * 90000) + 10000,
    _dataHandlers: [],
    _exitHandlers: [],
    onData(handler) { this._dataHandlers.push(handler); },
    onExit(handler) { this._exitHandlers.push(handler); },
    write: vi.fn(),
    resize: vi.fn(),
    // Helper to simulate PTY data emission
    _emit(data) { for (const h of this._dataHandlers) h(data); },
    // Helper to simulate PTY exit
    _exit() { for (const h of this._exitHandlers) h(); },
  });
  return {
    default: { spawn: vi.fn(() => makeMockPty()) },
  };
});

// Mock ProcessRegistry to avoid filesystem writes
vi.mock('../services/ProcessRegistry.js', () => ({
  ProcessRegistry: {
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
    cleanupStale: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock tree-kill (CJS require inside SessionManager uses createRequire)
vi.mock('tree-kill', () => ({
  default: vi.fn((pid, signal, cb) => { if (cb) cb(); }),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are set
// ---------------------------------------------------------------------------
import { SessionManager } from '../services/SessionManager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FAKE_PROJECT_ID = 'proj-123';
const FAKE_PROJECT_PATH = '/fake/project';
const FAKE_CLAUDE_BIN = '/usr/local/bin/claude';

async function createTestSession(manager) {
  return manager.createSession(FAKE_PROJECT_ID, FAKE_PROJECT_PATH, FAKE_CLAUDE_BIN);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SessionManager', () => {
  let manager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(async () => {
    // Kill all sessions to clean up intervals
    await manager.killAll();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------
  describe('createSession', () => {
    it('should create a session and return it with correct shape', async () => {
      const session = await createTestSession(manager);
      expect(session).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(session.projectId).toBe(FAKE_PROJECT_ID);
      expect(session.status).toBe('active');
      expect(session.clients).toBeDefined();
      expect(session.buffer).toBeDefined();
    });

    it('should store the session in the internal map', async () => {
      const session = await createTestSession(manager);
      const retrieved = manager.getSession(session.sessionId);
      expect(retrieved).toBe(session);
    });

    it('should give each session a unique sessionId', async () => {
      const s1 = await createTestSession(manager);
      const s2 = await createTestSession(manager);
      expect(s1.sessionId).not.toBe(s2.sessionId);
    });

    it('should include the session in listSessions', async () => {
      const session = await createTestSession(manager);
      const list = manager.listSessions();
      expect(list).toContain(session);
    });
  });

  // -------------------------------------------------------------------------
  // getSession
  // -------------------------------------------------------------------------
  describe('getSession', () => {
    it('should return undefined for an unknown sessionId', () => {
      const result = manager.getSession('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should return the correct session for a known sessionId', async () => {
      const session = await createTestSession(manager);
      const result = manager.getSession(session.sessionId);
      expect(result).toBe(session);
    });
  });

  // -------------------------------------------------------------------------
  // listSessions
  // -------------------------------------------------------------------------
  describe('listSessions', () => {
    it('should return empty array when no sessions exist', () => {
      expect(manager.listSessions()).toEqual([]);
    });

    it('should return all active sessions', async () => {
      await createTestSession(manager);
      await createTestSession(manager);
      expect(manager.listSessions()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // attachClient / detachClient
  // -------------------------------------------------------------------------
  describe('attachClient', () => {
    it('should add a ws client to the session', async () => {
      const session = await createTestSession(manager);
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: vi.fn(),
      };
      manager.attachClient(session.sessionId, ws);
      expect(session.clients.has(ws)).toBe(true);
    });

    it('should replay ring buffer content to newly attached client', async () => {
      const session = await createTestSession(manager);
      // Simulate PTY data being pushed to buffer
      session.buffer.push('buffered output');
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: vi.fn(),
      };
      manager.attachClient(session.sessionId, ws);
      expect(ws.send).toHaveBeenCalled();
      const sentData = ws.send.mock.calls[0][0];
      expect(sentData.toString()).toContain('buffered output');
    });

    it('should sanitize replay-only TUI cursor controls while preserving readable content', async () => {
      const session = await createTestSession(manager);
      session.buffer.push('\x1b[?1049h\x1b[2J\x1b[H\x1b[32mVisible line\x1b[0m\r\n\x1b7\x1b[10;5HReplayed text\x1b8');
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: vi.fn(),
      };

      manager.attachClient(session.sessionId, ws);

      const replayed = ws.send.mock.calls[0][0].toString();
      expect(replayed).toContain('\x1b[32mVisible line\x1b[0m');
      expect(replayed).toContain('Replayed text');
      expect(replayed).not.toContain('\x1b[?1049h');
      expect(replayed).not.toContain('\x1b[2J');
      expect(replayed).not.toContain('\x1b[H');
      expect(replayed).not.toContain('\x1b7');
    });

    it('should continue streaming live PTY output after the replay is sent', async () => {
      const session = await createTestSession(manager);
      session.buffer.push('buffered output');
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: vi.fn(),
      };

      manager.attachClient(session.sessionId, ws);
      session.pty._emit(' live output');

      expect(ws.send).toHaveBeenNthCalledWith(1, 'buffered output', { binary: false });
      expect(ws.send).toHaveBeenNthCalledWith(2, ' live output', { binary: false });
    });

    it('should do nothing for unknown sessionId', () => {
      // Should not throw
      expect(() => manager.attachClient('bad-id', {})).not.toThrow();
    });
  });

  describe('detachClient', () => {
    it('should remove the ws client from the session', async () => {
      const session = await createTestSession(manager);
      const ws = { readyState: 1, bufferedAmount: 0, send: vi.fn() };
      manager.attachClient(session.sessionId, ws);
      manager.detachClient(session.sessionId, ws);
      expect(session.clients.has(ws)).toBe(false);
    });

    it('should keep the session alive after all clients detach (PTY persistence)', async () => {
      const session = await createTestSession(manager);
      const ws = { readyState: 1, bufferedAmount: 0, send: vi.fn() };
      manager.attachClient(session.sessionId, ws);
      manager.detachClient(session.sessionId, ws);
      // Session must still exist — this is the core persistence requirement
      expect(manager.getSession(session.sessionId)).toBe(session);
      expect(session.status).toBe('active');
    });
  });

  // -------------------------------------------------------------------------
  // writeInput
  // -------------------------------------------------------------------------
  describe('writeInput', () => {
    it('should write to the PTY and update lastActivityAt', async () => {
      const session = await createTestSession(manager);
      const before = session.lastActivityAt;
      // Small delay to ensure time advances
      await new Promise(r => setTimeout(r, 5));
      manager.writeInput(session.sessionId, 'ls -la\r');
      expect(session.pty.write).toHaveBeenCalledWith('ls -la\r');
      expect(session.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should do nothing for an unknown session', () => {
      expect(() => manager.writeInput('bad-id', 'data')).not.toThrow();
    });

    it('should do nothing for a killed session', async () => {
      const session = await createTestSession(manager);
      session.status = 'killed';
      manager.writeInput(session.sessionId, 'data');
      expect(session.pty.write).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // killSession
  // -------------------------------------------------------------------------
  describe('killSession', () => {
    it('should remove the session from the map after killing', async () => {
      const session = await createTestSession(manager);
      await manager.killSession(session.sessionId);
      expect(manager.getSession(session.sessionId)).toBeUndefined();
    });

    it('should mark session as killed', async () => {
      const session = await createTestSession(manager);
      const { sessionId } = session;
      await manager.killSession(sessionId);
      // Session is removed from map; verify it was marked before removal
      expect(session.status).toBe('killed');
    });

    it('should close all attached WebSocket clients when session is killed', async () => {
      const session = await createTestSession(manager);
      const ws = {
        readyState: 1,
        bufferedAmount: 0,
        send: vi.fn(),
        close: vi.fn(),
      };
      manager.attachClient(session.sessionId, ws);
      await manager.killSession(session.sessionId);
      expect(ws.close).toHaveBeenCalled();
    });

    it('should do nothing when sessionId does not exist', async () => {
      // Should not throw
      await expect(manager.killSession('nonexistent')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // PTY session persistence — core feature test
  // -------------------------------------------------------------------------
  describe('PTY session persistence (tab switch simulation)', () => {
    it('should retain ring buffer data when client disconnects and reconnects', async () => {
      const session = await createTestSession(manager);

      // Client connects
      const ws1 = { readyState: 1, bufferedAmount: 0, send: vi.fn() };
      manager.attachClient(session.sessionId, ws1);

      // PTY emits data (simulated via direct buffer push since pty is mocked)
      session.buffer.push('\x1b[32mSession output line 1\x1b[0m\r\n');
      session.buffer.push('\x1b[32mSession output line 2\x1b[0m\r\n');

      // Client disconnects (tab closed)
      manager.detachClient(session.sessionId, ws1);
      expect(session.status).toBe('active'); // PTY must survive

      // Client reconnects (tab switch back)
      const ws2 = { readyState: 1, bufferedAmount: 0, send: vi.fn() };
      manager.attachClient(session.sessionId, ws2);

      // Ring buffer replay must be sent to ws2
      expect(ws2.send).toHaveBeenCalled();
      const replayed = ws2.send.mock.calls[0][0].toString();
      expect(replayed).toContain('Session output line 1');
      expect(replayed).toContain('Session output line 2');
    });
  });

  // -------------------------------------------------------------------------
  // Session switching — second project gets its own session
  // -------------------------------------------------------------------------
  describe('session switching', () => {
    it('should support independent sessions for different projects', async () => {
      const s1 = await manager.createSession('proj-A', '/path/A', FAKE_CLAUDE_BIN);
      const s2 = await manager.createSession('proj-B', '/path/B', FAKE_CLAUDE_BIN);

      expect(s1.sessionId).not.toBe(s2.sessionId);
      expect(s1.projectId).toBe('proj-A');
      expect(s2.projectId).toBe('proj-B');
      expect(manager.listSessions()).toHaveLength(2);
    });

    it('should keep live PTY streams isolated per session when multiple clients are attached', async () => {
      const sessionA = await manager.createSession('proj-A', '/path/A', FAKE_CLAUDE_BIN);
      const sessionB = await manager.createSession('proj-B', '/path/B', FAKE_CLAUDE_BIN);
      const wsA = { readyState: 1, bufferedAmount: 0, send: vi.fn() };
      const wsB = { readyState: 1, bufferedAmount: 0, send: vi.fn() };

      manager.attachClient(sessionA.sessionId, wsA);
      manager.attachClient(sessionB.sessionId, wsB);

      sessionA.pty._emit('A-only output');
      sessionB.pty._emit('B-only output');

      expect(wsA.send).toHaveBeenCalledTimes(1);
      expect(wsA.send).toHaveBeenCalledWith('A-only output', { binary: false });
      expect(wsB.send).toHaveBeenCalledTimes(1);
      expect(wsB.send).toHaveBeenCalledWith('B-only output', { binary: false });
    });
  });
});
