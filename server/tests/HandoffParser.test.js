// tests/HandoffParser.test.js
// Unit tests for HandoffParser — stateful rolling buffer token extractor (DEC-012)
// Covers ConPTY chunk-splitting, ANSI stripping, security limits, and edge cases.

import { describe, it, expect, beforeEach } from 'vitest';
import { HandoffParser } from '../services/HandoffParser.js';

/** Helper: base64-encode a JSON object */
function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

describe('HandoffParser', () => {
  let parser;

  beforeEach(() => {
    parser = new HandoffParser();
  });

  describe('Scenario 1: Token split across 2 chunks', () => {
    it('should detect a handoff token split across two feed() calls', () => {
      const payload = b64({ key: 'val' });
      const full = `some output __HANDOFF__:agent-b:${payload}`;
      const splitAt = 'some output __HANDOFF__:agent-'.length;

      const r1 = parser.feed(full.slice(0, splitAt));
      expect(r1).toEqual([]);

      const r2 = parser.feed(full.slice(splitAt));
      expect(r2).toHaveLength(1);
      expect(r2[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { key: 'val' },
      });
    });
  });

  describe('Scenario 2: Token split across 3 chunks', () => {
    it('should detect a handoff token split across three feed() calls', () => {
      const payload = b64({ key: 'val' });
      const full = `__HANDOFF__:agent-copywriter:${payload}`;

      // Split into 3 parts: "__HANDOFF__:agent" | "-copywriter:eyJr" | rest
      const r1 = parser.feed('__HANDOFF__:agent');
      expect(r1).toEqual([]);

      // Find a good split point in the middle of the payload
      const remaining = full.slice('__HANDOFF__:agent'.length);
      const mid = '-copywriter:' + payload.slice(0, 4);
      const tail = payload.slice(4);

      const r2 = parser.feed(mid);
      expect(r2).toEqual([]);

      const r3 = parser.feed(tail);
      expect(r3).toHaveLength(1);
      expect(r3[0].type).toBe('handoff');
      expect(r3[0].targetId).toBe('agent-copywriter');
      expect(r3[0].contextUpdate).toEqual({ key: 'val' });
    });
  });

  describe('Scenario 3: ANSI-polluted chunk', () => {
    it('should strip ANSI escape codes and detect the handoff token', () => {
      const payload = b64({ key: 'val' });
      const chunk = `\x1b[32m__HANDOFF__:agent-b:${payload}\x1b[0m`;

      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { key: 'val' },
      });
    });

    it('should strip OSC sequences', () => {
      const payload = b64({ ok: true });
      const chunk = `\x1b]0;title\x07__HANDOFF__:agent-c:${payload}`;

      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0].targetId).toBe('agent-c');
    });

    it('should detect a handoff token when terminal wrapping inserts newlines and indentation', () => {
      const contextUpdate = {
        summary:
          'Explained that the sky appears blue because air molecules scatter shorter wavelengths more strongly.',
      };
      const payload = b64(contextUpdate);
      const splitOne = Math.floor(payload.length / 3);
      const splitTwo = Math.floor((payload.length * 2) / 3);
      const chunk = [
        '__HANDOFF__:node-',
        `  b:${payload.slice(0, splitOne)}`,
        `  ${payload.slice(splitOne, splitTwo)}`,
        `  ${payload.slice(splitTwo)}`,
      ].join('\n');

      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'node-b',
        contextUpdate,
      });
    });

    it('should normalize lightweight emphasis around a direct JSON handoff target', () => {
      const results = parser.feed('__HANDOFF__:_loop-main:{"summary":"fact ready","result":"forward"}');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'loop-main',
        contextUpdate: { summary: 'fact ready', result: 'forward' },
      });
    });
  });

  describe('Scenario 4: Oversized contextUpdate (>50 keys)', () => {
    it('should reject contextUpdate with more than 50 keys and return 0 events', () => {
      const bigObj = {};
      for (let i = 0; i < 51; i++) {
        bigObj[`key${i}`] = 'value';
      }
      const payload = b64(bigObj);
      const chunk = `__HANDOFF__:agent-b:${payload}`;

      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    });

    it('should reject contextUpdate with a string value longer than 1024 chars', () => {
      const obj = { longkey: 'x'.repeat(1025) };
      const payload = b64(obj);
      const chunk = `__HANDOFF__:agent-b:${payload}`;

      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    });

    it('should reject non-primitive values in contextUpdate', () => {
      const obj = { nested: { inner: 'val' } };
      const payload = b64(obj);
      const chunk = `__HANDOFF__:agent-b:${payload}`;

      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    });

    it('should reject array contextUpdate', () => {
      const payload = b64([1, 2, 3]);
      const chunk = `__HANDOFF__:agent-b:${payload}`;

      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    });
  });

  describe('Scenario 5: Malformed base64', () => {
    it('should return 0 events and not throw on invalid base64', () => {
      const chunk = '__HANDOFF__:agent-b:not+valid+base64==';

      // The regex matches base64-like chars, so if the decoded result
      // is not valid JSON, it should be skipped silently
      expect(() => {
        const results = parser.feed(chunk);
        // Should not crash — results may be empty
      }).not.toThrow();
    });

    it('should handle payload that decodes but is not valid JSON', () => {
      // "hello" in base64 is "aGVsbG8=" — valid base64 but not JSON
      const chunk = '__HANDOFF__:agent-b:aGVsbG8=';

      const results = parser.feed(chunk);
      expect(results).toEqual([]);
    });
  });

  describe('Scenario 6: __DONE__ detection', () => {
    it('should detect __DONE__ token and return a done event', () => {
      const results = parser.feed('task complete output __DONE__ end');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'done' });
    });

    it('should detect __DONE__ even when surrounded by other text', () => {
      const results = parser.feed('lots of output\n__DONE__\nmore text');
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('done');
    });
  });

  describe('Scenario 7: 4KB buffer overflow', () => {
    it('should enforce 4KB cap and still detect token at end', () => {
      const payload = b64({ key: 'val' });
      const token = `__HANDOFF__:agent-b:${payload}`;

      // Feed 5000 chars of filler, then the token
      parser.feed('x'.repeat(5000));
      const results = parser.feed(token);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { key: 'val' },
      });
    });

    it('should drop oldest bytes when buffer exceeds 8192 chars', () => {
      // Fill buffer to capacity with a marker at the start
      parser.feed('MARKER' + 'x'.repeat(8186));
      // Push more to overflow
      parser.feed('y'.repeat(100));
      // The internal buffer should be 8192 chars max (SEC-V3-07 raised for TUI frames)
      // MARKER should have been dropped
      // Access internal state for verification
      expect(parser._buf.length).toBeLessThanOrEqual(8192);
      expect(parser._buf.includes('MARKER')).toBe(false);
    });
  });

  describe('Scenario 8: Multiple tokens in one chunk', () => {
    it('should detect two handoff tokens in a single feed() call', () => {
      const payload1 = b64({ task: 'review' });
      const payload2 = b64({ task: 'implement' });
      const chunk = `__HANDOFF__:agent-a:${payload1} some text __HANDOFF__:agent-b:${payload2}`;

      const results = parser.feed(chunk);
      expect(results).toHaveLength(2);
      expect(results[0].targetId).toBe('agent-a');
      expect(results[0].contextUpdate).toEqual({ task: 'review' });
      expect(results[1].targetId).toBe('agent-b');
      expect(results[1].contextUpdate).toEqual({ task: 'implement' });
    });
  });

  describe('Scenario 9: __DONE__ after __HANDOFF__ in same chunk', () => {
    it('should return both handoff and done events from one feed() call', () => {
      const payload = b64({ key: 'val' });
      const chunk = `output __HANDOFF__:agent-b:${payload}\n__DONE__`;

      const results = parser.feed(chunk);
      expect(results).toHaveLength(2);

      const handoff = results.find(r => r.type === 'handoff');
      const done = results.find(r => r.type === 'done');

      expect(handoff).toBeDefined();
      expect(handoff.targetId).toBe('agent-b');
      expect(handoff.contextUpdate).toEqual({ key: 'val' });

      expect(done).toBeDefined();
      expect(done.type).toBe('done');
    });
  });

  describe('reset()', () => {
    it('should clear the internal buffer', () => {
      parser.feed('partial __HANDOFF__:agent-');
      parser.reset();
      expect(parser._buf).toBe('');
    });

    it('should not produce tokens from pre-reset data after reset', () => {
      const payload = b64({ key: 'val' });
      // Feed partial token
      parser.feed('__HANDOFF__:agent-b:');
      parser.reset();
      // Feed just the payload — should NOT match because prefix was cleared
      const results = parser.feed(payload);
      expect(results).toEqual([]);
    });
  });

  describe('contextUpdate validation', () => {
    it('should accept valid flat object with string, number, and boolean values', () => {
      const obj = { name: 'test', count: 42, active: true };
      const payload = b64(obj);
      const results = parser.feed(`__HANDOFF__:agent-b:${payload}`);
      expect(results).toHaveLength(1);
      expect(results[0].contextUpdate).toEqual(obj);
    });

    it('should accept an empty object', () => {
      const payload = b64({});
      const results = parser.feed(`__HANDOFF__:agent-b:${payload}`);
      expect(results).toHaveLength(1);
      expect(results[0].contextUpdate).toEqual({});
    });

    it('should accept exactly 50 keys', () => {
      const obj = {};
      for (let i = 0; i < 50; i++) {
        obj[`k${i}`] = 'v';
      }
      const payload = b64(obj);
      const results = parser.feed(`__HANDOFF__:agent-b:${payload}`);
      expect(results).toHaveLength(1);
    });

    it('should accept string value of exactly 1024 chars', () => {
      const obj = { key: 'a'.repeat(1024) };
      const payload = b64(obj);
      const results = parser.feed(`__HANDOFF__:agent-b:${payload}`);
      expect(results).toHaveLength(1);
    });
  });

  describe('Scenario 10: Plain JSON payload (LLM-friendly format)', () => {
    it('should detect a handoff with plain JSON context (no base64)', () => {
      const chunk = '__HANDOFF__:agent-b:{"summary": "Research complete", "count": 42}';
      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { summary: 'Research complete', count: 42 },
      });
    });

    it('should detect a plain JSON handoff with surrounding text', () => {
      const chunk = 'some output\n__HANDOFF__:node-2:{"task": "write article"}\nmore text';
      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('handoff');
      expect(results[0].targetId).toBe('node-2');
      expect(results[0].contextUpdate).toEqual({ task: 'write article' });
    });

    it('should detect a plain JSON handoff with empty object', () => {
      const chunk = '__HANDOFF__:agent-b:{}';
      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: {},
      });
    });

    it('should prefer plain JSON over base64 when both could match', () => {
      const chunk = '__HANDOFF__:agent-b:{"key": "value"}';
      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0].contextUpdate).toEqual({ key: 'value' });
    });

    it('should reject plain JSON handoff with nested objects', () => {
      const chunk = '__HANDOFF__:agent-b:{"nested": {"inner": "val"}}';
      const results = parser.feed(chunk);
      // Should not match as a valid handoff (nested objects are rejected by _validateContext)
      expect(results.filter(r => r.type === 'handoff')).toHaveLength(0);
    });

    it('should still detect base64 handoffs after plain JSON path fails', () => {
      const payload = b64({ key: 'val' });
      const chunk = `__HANDOFF__:agent-b:${payload}`;
      const results = parser.feed(chunk);
      expect(results).toHaveLength(1);
      expect(results[0].contextUpdate).toEqual({ key: 'val' });
    });

    it('should detect plain JSON handoff split across two chunks', () => {
      const r1 = parser.feed('output __HANDOFF__:agent-b:{"summ');
      expect(r1).toEqual([]);

      const r2 = parser.feed('ary": "done"}');
      expect(r2).toHaveLength(1);
      expect(r2[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { summary: 'done' },
      });
    });

    it('should detect a plain JSON handoff when PTY wrapping moves the payload onto the next line', () => {
      const chunk = '__HANDOFF__:agent-b:\n  {"summary": "Research complete", "count": 2}';
      const results = parser.feed(chunk);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { summary: 'Research complete', count: 2 },
      });
    });

    it('should detect a plain JSON handoff split across chunks when the payload starts on a wrapped line', () => {
      const r1 = parser.feed('output __HANDOFF__:agent-b:\n');
      expect(r1).toEqual([]);

      const r2 = parser.feed('  {"summary": "done"}');
      expect(r2).toHaveLength(1);
      expect(r2[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { summary: 'done' },
      });
    });

    it('should detect a plain JSON handoff when terminal rendering strips underscore formatting from the token', () => {
      const chunk = 'HANDOFF:agent-b:{"summary": "rendered without underscores"}';
      const results = parser.feed(chunk);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'handoff',
        targetId: 'agent-b',
        contextUpdate: { summary: 'rendered without underscores' },
      });
    });

    it('should detect a plain JSON handoff when ConPTY wrapping inserts newlines and padding inside the payload', () => {
      // ConPTY wraps long output at 80 columns, inserting literal \n and spaces
      // inside JSON string values. The parser must collapse whitespace before JSON.parse.
      const chunk = 'HANDOFF:node-b:{"projectName": "Claude Code Visual\n    Manager", "version":         "3.0.0",\n    "description": "A locally-hosted\n    web app"}';
      const results = parser.feed(chunk);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('handoff');
      expect(results[0].targetId).toBe('node-b');
      expect(results[0].contextUpdate.projectName).toBe('Claude Code Visual Manager');
      expect(results[0].contextUpdate.version).toBe('3.0.0');
    });

    it('should detect a multi-line wrapped HANDOFF alias (no underscores) with ConPTY padding', () => {
      const chunk = 'HANDOFF:node-b:{"summary": "Research\n    findings about the project",\n    "result": "key data\n    collected"}';
      const results = parser.feed(chunk);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('handoff');
      expect(results[0].targetId).toBe('node-b');
      expect(results[0].contextUpdate.summary).toBe('Research findings about the project');
      expect(results[0].contextUpdate.result).toBe('key data collected');
    });
  });
});
