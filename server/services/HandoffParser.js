// server/services/HandoffParser.js
// Stateful rolling buffer token extractor for ConPTY output.
// ConPTY on Windows splits PTY output into arbitrary byte chunks —
// tokens like __HANDOFF__:target:base64 can span multiple onData callbacks.
// This parser accumulates chunks and scans for complete tokens across boundaries.
// See DEC-012.

import { Buffer } from 'buffer';

const MAX_BUF = 4096; // SEC-V3-07: 4KB rolling buffer cap

// ANSI escape sequence patterns
const ANSI_CSI = /\x1b\[[0-9;]*[a-zA-Z]/g;           // CSI sequences (colors, cursor)
const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g; // OSC sequences
const ANSI_ESC = /\x1b[@-_][0-?]*[ -/]*[@-~]/g;       // other ESC sequences

// Token patterns
// targetId: must match agent name validation (^[a-z][a-z0-9-]*$)
// base64 payload: standard base64 alphabet with padding
const HANDOFF_RE = /__HANDOFF__:([a-z][a-z0-9-]*):((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})?)/g;
const DONE_RE = /__DONE__/;

export class HandoffParser {
  constructor() {
    this._buf = ''; // rolling string accumulator, max 4096 chars
  }

  /**
   * Feed a raw chunk from PTY onData.
   * Returns array of parsed events:
   *   []  - no tokens found yet
   *   [{ type: 'handoff', targetId: string, contextUpdate: object }]
   *   [{ type: 'done' }]
   *   or any combination of the above
   */
  feed(rawChunk) {
    // 1. Strip ANSI escape codes (ConPTY emits these frequently)
    const clean = rawChunk
      .replace(ANSI_CSI, '')
      .replace(ANSI_OSC, '')
      .replace(ANSI_ESC, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    this._buf += clean;

    // 2. Enforce 4KB cap - keep newest bytes (SEC-V3-07)
    if (this._buf.length > MAX_BUF) {
      this._buf = this._buf.slice(this._buf.length - MAX_BUF);
    }

    const results = [];

    // 3. Extract __HANDOFF__ tokens
    // Reset lastIndex since we reuse the regex conceptually (but create fresh each call
    // because the global flag means lastIndex persists)
    const handoffRe = new RegExp(HANDOFF_RE.source, 'g');
    let match;
    while ((match = handoffRe.exec(this._buf)) !== null) {
      try {
        const raw = Buffer.from(match[2], 'base64').toString('utf8');
        const ctx = JSON.parse(raw);
        if (this._validateContext(ctx)) {
          results.push({ type: 'handoff', targetId: match[1], contextUpdate: ctx });
        } else {
          console.warn(`[HandoffParser] contextUpdate rejected (schema violation) from target ${match[1]}`);
        }
      } catch (err) {
        // Malformed base64 or JSON - skip silently, log warning
        console.warn(`[HandoffParser] malformed handoff payload: ${err.message}`);
      }
    }

    // 4. Extract __DONE__ token
    if (DONE_RE.test(this._buf)) {
      results.push({ type: 'done' });
    }

    // 5. Clear matched region if tokens were found
    if (results.length > 0) {
      this._buf = '';
    }

    return results;
  }

  /**
   * Validate contextUpdate: flat dict, primitive values only.
   * SEC-V3-07: max 50 keys, max string value length 1024 chars.
   */
  _validateContext(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length > 50) return false;
    for (const k of keys) {
      if (typeof k !== 'string') return false;
      const v = obj[k];
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return false;
      if (typeof v === 'string' && v.length > 1024) return false;
    }
    return true;
  }

  /** Reset the accumulator buffer */
  reset() {
    this._buf = '';
  }
}

export default HandoffParser;
