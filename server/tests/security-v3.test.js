// tests/security-v3.test.js
// V3 Security Layer tests — SEC-V3-01 through SEC-V3-07
// Covers: SSRF prevention, WorkflowStore schema validation,
//         HandoffParser payload cap, and HITL text size cap.

import { describe, it, expect, beforeEach } from 'vitest';
import { isSafeUrl } from '../utils/ssrfGuard.js';
import { WorkflowStore } from '../services/WorkflowStore.js';
import { HandoffParser } from '../services/HandoffParser.js';
import { validateResumeText } from '../middleware/hitlValidation.js';
import { formatHitlResponse } from '../routes/inbox.js';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// SEC-V3-03: isSafeUrl — SSRF prevention
// ---------------------------------------------------------------------------
describe('isSafeUrl (SEC-V3-03)', () => {
  describe('blocked: private IPv4 ranges', () => {
    it('should return false for 192.168.x.x', () => {
      expect(isSafeUrl('http://192.168.1.1/feed')).toBe(false);
      expect(isSafeUrl('http://192.168.0.0')).toBe(false);
      expect(isSafeUrl('http://192.168.255.255')).toBe(false);
    });

    it('should return false for 10.x.x.x', () => {
      expect(isSafeUrl('http://10.0.0.1')).toBe(false);
      expect(isSafeUrl('http://10.255.255.255')).toBe(false);
    });

    it('should return false for 172.16.x - 172.31.x', () => {
      expect(isSafeUrl('http://172.16.0.1')).toBe(false);
      expect(isSafeUrl('http://172.20.10.1')).toBe(false);
      expect(isSafeUrl('http://172.31.255.255')).toBe(false);
    });

    it('should return true for 172.15.x (just outside the block)', () => {
      expect(isSafeUrl('http://172.15.0.1')).toBe(true);
    });

    it('should return true for 172.32.x (just outside the block)', () => {
      expect(isSafeUrl('http://172.32.0.1')).toBe(true);
    });
  });

  describe('blocked: loopback', () => {
    it('should return false for 127.0.0.1', () => {
      expect(isSafeUrl('http://127.0.0.1')).toBe(false);
    });

    it('should return false for 127.x.x.x', () => {
      expect(isSafeUrl('http://127.100.50.25')).toBe(false);
    });

    it('should return false for localhost', () => {
      expect(isSafeUrl('http://localhost')).toBe(false);
      expect(isSafeUrl('http://localhost:3000/api')).toBe(false);
    });

    it('should return false for IPv6 loopback ::1', () => {
      expect(isSafeUrl('http://[::1]')).toBe(false);
      expect(isSafeUrl('http://[::1]:8080/feed')).toBe(false);
    });
  });

  describe('blocked: unspecified and link-local', () => {
    it('should return false for 0.0.0.0', () => {
      expect(isSafeUrl('http://0.0.0.0')).toBe(false);
    });

    it('should return false for link-local 169.254.x.x', () => {
      expect(isSafeUrl('http://169.254.1.1')).toBe(false);
      expect(isSafeUrl('http://169.254.0.0')).toBe(false);
    });
  });

  describe('blocked: IPv4-mapped IPv6', () => {
    it('should return false for ::ffff:127.0.0.1', () => {
      expect(isSafeUrl('http://[::ffff:127.0.0.1]')).toBe(false);
    });

    it('should return false for ::ffff:192.168.1.1', () => {
      expect(isSafeUrl('http://[::ffff:192.168.1.1]')).toBe(false);
    });
  });

  describe('allowed: public addresses', () => {
    it('should return true for http://example.com', () => {
      expect(isSafeUrl('http://example.com')).toBe(true);
    });

    it('should return true for https://feeds.example.com/rss', () => {
      expect(isSafeUrl('https://feeds.example.com/rss')).toBe(true);
    });

    it('should return true for a public IP (8.8.8.8)', () => {
      expect(isSafeUrl('http://8.8.8.8')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should return false for an empty string', () => {
      expect(isSafeUrl('')).toBe(false);
    });

    it('should return false for a non-URL string', () => {
      expect(isSafeUrl('not-a-url')).toBe(false);
    });

    it('should return false for a URL with no host', () => {
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// SEC-V3-02 & SEC-V3-06: WorkflowStore schema validation
// ---------------------------------------------------------------------------
describe('WorkflowStore validation (SEC-V3-02 + SEC-V3-06)', () => {
  let store;
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `wf-sec-test-${randomUUID()}`);
    store = new WorkflowStore(tempDir);
    await store.init();
  });

  it('should reject a workflow with systemPrompt > 16 KB', async () => {
    const bigPrompt = 'x'.repeat(16385); // 16 KB + 1 byte
    await expect(
      store.create({
        name: 'test-workflow',
        nodes: [{ id: 'agent-a', data: { systemPrompt: bigPrompt } }],
      })
    ).rejects.toThrow(/systemPrompt must be at most 16384/);
  });

  it('should accept a workflow with systemPrompt exactly at 16 KB', async () => {
    const maxPrompt = 'x'.repeat(16384);
    const result = await store.create({
      name: 'boundary-test',
      nodes: [{ id: 'agent-a', data: { systemPrompt: maxPrompt } }],
    });
    expect(result.id).toBeTruthy();
  });

  it('should reject a workflow with more than 50 nodes', async () => {
    const nodes = Array.from({ length: 51 }, (_, i) => ({ id: `agent-${String(i).padStart(2, '0')}`, data: {} }));
    await expect(
      store.create({ name: 'too-many-nodes', nodes })
    ).rejects.toThrow(/nodes must contain at most 50/);
  });

  it('should accept a workflow with exactly 50 nodes', async () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({ id: `agent-${String(i).padStart(2, '0')}`, data: {} }));
    const result = await store.create({ name: 'fifty-nodes', nodes });
    expect(result.id).toBeTruthy();
  });

  it('should reject a workflow name with script injection characters', async () => {
    await expect(
      store.create({ name: '<script>alert(1)</script>' })
    ).rejects.toThrow(/name contains invalid characters/);
  });

  it('should reject a workflow name with semicolons', async () => {
    await expect(
      store.create({ name: 'evil; rm -rf /' })
    ).rejects.toThrow(/name contains invalid characters/);
  });

  it('should reject a workflow name exceeding 100 characters', async () => {
    await expect(
      store.create({ name: 'a'.repeat(101) })
    ).rejects.toThrow(/name must be at most 100 characters/);
  });

  it('should reject a workflow description exceeding 500 characters', async () => {
    await expect(
      store.create({ name: 'valid-name', description: 'x'.repeat(501) })
    ).rejects.toThrow(/description must be at most 500 characters/);
  });

  it('should accept a valid workflow name with allowed characters', async () => {
    const result = await store.create({ name: 'My Workflow-v1.2' });
    expect(result.name).toBe('My Workflow-v1.2');
  });

  it('should persist a node tools array through create/get/update round-trips', async () => {
    const created = await store.create({
      name: 'tools-roundtrip',
      nodes: [{ id: 'agent-a', data: { tools: ['Bash', 'Read'] } }],
    });

    const loaded = await store.get(created.id);
    expect(loaded.nodes[0].data.tools).toEqual(['Bash', 'Read']);

    await store.update(created.id, {
      ...loaded,
      nodes: [{ id: 'agent-a', data: { tools: ['Read', 'Glob', 'LS'] } }],
    });

    const updated = await store.get(created.id);
    expect(updated.nodes[0].data.tools).toEqual(['Read', 'Glob', 'LS']);
  });
});

// ---------------------------------------------------------------------------
// SEC-V3-07: HandoffParser — oversized context payload dropped without crashing
// ---------------------------------------------------------------------------
describe('HandoffParser oversized payload (SEC-V3-07)', () => {
  let parser;

  beforeEach(() => {
    parser = new HandoffParser();
  });

  it('should drop a contextUpdate with > 50 keys without crashing', () => {
    const bigObj = {};
    for (let i = 0; i < 51; i++) bigObj[`key${i}`] = 'value';
    const payload = Buffer.from(JSON.stringify(bigObj)).toString('base64');
    const chunk = `__HANDOFF__:agent-b:${payload}`;

    expect(() => {
      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    }).not.toThrow();
  });

  it('should drop a contextUpdate with a string value > 4096 chars without crashing', () => {
    const obj = { key: 'x'.repeat(4097) };
    const payload = Buffer.from(JSON.stringify(obj)).toString('base64');
    const chunk = `__HANDOFF__:agent-b:${payload}`;

    expect(() => {
      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    }).not.toThrow();
  });

  it('should enforce 8KB buffer cap and not crash on oversized accumulation', () => {
    // Feed 10 KB of garbage — should not throw and buffer stays at max 8192 (SEC-V3-07 raised for TUI frames)
    expect(() => {
      parser.feed('Z'.repeat(10240));
    }).not.toThrow();
    expect(parser._buf.length).toBeLessThanOrEqual(8192);
  });
});

// ---------------------------------------------------------------------------
// SEC-V3-05: validateResumeText — HITL text size cap
// ---------------------------------------------------------------------------
describe('validateResumeText (SEC-V3-05)', () => {
  function makeReq(resumeText) {
    return { body: { resumeText } };
  }

  function makeRes() {
    let statusCode = null;
    let body = null;
    return {
      status(code) {
        statusCode = code;
        return this;
      },
      json(b) {
        body = b;
        return this;
      },
      _statusCode: () => statusCode,
      _body: () => body,
    };
  }

  it('should return 400 when resumeText exceeds 8192 characters', () => {
    const req = makeReq('x'.repeat(8193));
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(res._statusCode()).toBe(400);
    expect(res._body()).toEqual({ error: 'resumeText exceeds 8KB limit' });
    expect(nextCalled).toBe(false);
  });

  it('should call next() when resumeText is exactly 8192 characters', () => {
    const req = makeReq('x'.repeat(8192));
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(res._statusCode()).toBe(null);
  });

  it('should call next() when resumeText is absent', () => {
    const req = { body: {} };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should call next() when body is absent', () => {
    const req = {};
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should call next() when resumeText is within limit', () => {
    const req = makeReq('approve this task');
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  // V13.1: selectedOptions validation
  it('should return 400 when selectedOptions is not an array', () => {
    const req = { body: { selectedOptions: 'not-an-array' } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(res._statusCode()).toBe(400);
    expect(res._body().error).toContain('must be an array');
    expect(nextCalled).toBe(false);
  });

  it('should return 400 when selectedOptions exceeds 50 items', () => {
    const req = { body: { selectedOptions: Array.from({ length: 51 }, (_, i) => `opt-${i}`) } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(res._statusCode()).toBe(400);
    expect(res._body().error).toContain('exceeds 50 items');
    expect(nextCalled).toBe(false);
  });

  it('should return 400 when a selectedOptions element is not a string', () => {
    const req = { body: { selectedOptions: ['valid', 42] } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(res._statusCode()).toBe(400);
    expect(res._body().error).toContain('must be a string');
    expect(nextCalled).toBe(false);
  });

  it('should return 400 when a selectedOptions element exceeds 500 chars', () => {
    const req = { body: { selectedOptions: ['x'.repeat(501)] } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(res._statusCode()).toBe(400);
    expect(res._body().error).toContain('exceeds 500 chars');
    expect(nextCalled).toBe(false);
  });

  it('should call next() when selectedOptions is a valid array of strings', () => {
    const req = { body: { selectedOptions: ['PostgreSQL', 'SQLite'], resumeText: 'go ahead' } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should call next() when selectedOptions is null or undefined', () => {
    const req = { body: { selectedOptions: null } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should call next() when selectedOptions is an empty array', () => {
    const req = { body: { selectedOptions: [] } };
    const res = makeRes();
    let nextCalled = false;
    validateResumeText(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V13.1: formatHitlResponse — combines selectedOptions + resumeText
// ---------------------------------------------------------------------------
describe('formatHitlResponse (V13.1)', () => {
  it('should return combined text when both selectedOptions and resumeText are present', () => {
    const result = formatHitlResponse(['PostgreSQL', 'SQLite'], 'Use PostgreSQL as primary');
    expect(result).toBe('Selected: PostgreSQL, SQLite\nUse PostgreSQL as primary');
  });

  it('should return only selected options when resumeText is empty', () => {
    const result = formatHitlResponse(['MySQL'], '');
    expect(result).toBe('Selected: MySQL');
  });

  it('should return only selected options when resumeText is undefined', () => {
    const result = formatHitlResponse(['A', 'B', 'C'], undefined);
    expect(result).toBe('Selected: A, B, C');
  });

  it('should return only resumeText when selectedOptions is empty', () => {
    const result = formatHitlResponse([], 'just a note');
    expect(result).toBe('just a note');
  });

  it('should return only resumeText when selectedOptions is undefined', () => {
    const result = formatHitlResponse(undefined, 'free text');
    expect(result).toBe('free text');
  });

  it('should return undefined when both are empty/absent', () => {
    expect(formatHitlResponse(undefined, undefined)).toBeUndefined();
    expect(formatHitlResponse([], '')).toBeUndefined();
    expect(formatHitlResponse(null, '   ')).toBeUndefined();
  });
});
