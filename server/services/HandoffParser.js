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
const HANDOFF_PREFIX = '__HANDOFF__:';
const HANDOFF_WINDOW_RE = /^__HANDOFF__:[A-Za-z0-9+/=:_\-\s]+/;
const TARGET_RE = /^[a-z][a-z0-9-]*$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
const DONE_RE = /__DONE__/;

export class HandoffParser {
  constructor() {
    this._buf = ''; // rolling string accumulator, max 4096 chars
  }

  /**
   * Try to parse a handoff token where the context is plain JSON (not base64).
   * LLMs often emit plain JSON instead of base64-encoding it.
   * Format: __HANDOFF__:<targetId>:<json_object>
   */
  _parseDirectJsonHandoff(buf, startIndex) {
    const slice = buf.slice(startIndex);
    if (!slice.startsWith(HANDOFF_PREFIX)) return null;

    const afterPrefix = slice.slice(HANDOFF_PREFIX.length);
    const colonIndex = afterPrefix.indexOf(':');
    if (colonIndex <= 0) return null;

    const targetId = afterPrefix.slice(0, colonIndex);
    if (!TARGET_RE.test(targetId)) return null;

    const afterTarget = afterPrefix.slice(colonIndex + 1);
    const braceStart = afterTarget.indexOf('{');
    if (braceStart === -1 || braceStart > 2) return null; // allow up to 2 chars of whitespace before {

    // Scan for the matching closing brace (handles nested strings with braces)
    const jsonStart = braceStart;
    for (let end = afterTarget.indexOf('}', jsonStart); end !== -1; end = afterTarget.indexOf('}', end + 1)) {
      const jsonCandidate = afterTarget.slice(jsonStart, end + 1);
      try {
        const ctx = JSON.parse(jsonCandidate);
        if (this._validateContext(ctx)) {
          const totalConsumed = HANDOFF_PREFIX.length + colonIndex + 1 + end + 1;
          return { type: 'handoff', targetId, contextUpdate: ctx, consumed: totalConsumed };
        }
      } catch {
        // Try a longer substring ending at the next '}'
      }
    }
    return null;
  }

  _parseWrappedHandoff(window) {
    const compact = window.replace(/\s+/g, '');
    if (!compact.startsWith(HANDOFF_PREFIX)) {
      return null;
    }

    const remainder = compact.slice(HANDOFF_PREFIX.length);
    const separatorIndex = remainder.indexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }

    const targetId = remainder.slice(0, separatorIndex);
    if (!TARGET_RE.test(targetId)) {
      return null;
    }

    const payloadCandidate = remainder.slice(separatorIndex + 1);
    for (let end = payloadCandidate.length; end >= 4; end -= 1) {
      const payload = payloadCandidate.slice(0, end);
      if (!BASE64_RE.test(payload)) continue;

      try {
        const raw = Buffer.from(payload, 'base64').toString('utf8');
        const ctx = JSON.parse(raw);
        if (this._validateContext(ctx)) {
          return { type: 'handoff', targetId, contextUpdate: ctx };
        }
      } catch (err) {
        // continue scanning shorter payload prefixes
      }
    }

    return null;
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

    // 3. Extract __HANDOFF__ tokens, including PTY-wrapped variants where the
    // terminal inserts hard newlines/spaces inside the target or payload.
    // Also supports plain JSON payloads (LLMs often emit JSON directly instead of base64).
    let searchIndex = 0;
    while (searchIndex < this._buf.length) {
      const handoffIndex = this._buf.indexOf(HANDOFF_PREFIX, searchIndex);
      if (handoffIndex === -1) break;

      // 3a. Try plain JSON payload first (most common LLM output)
      const jsonParsed = this._parseDirectJsonHandoff(this._buf, handoffIndex);
      if (jsonParsed) {
        results.push({ type: jsonParsed.type, targetId: jsonParsed.targetId, contextUpdate: jsonParsed.contextUpdate });
        searchIndex = handoffIndex + jsonParsed.consumed;
        continue;
      }

      // 3b. Try base64-encoded payload (original format)
      const candidate = this._buf.slice(handoffIndex).match(HANDOFF_WINDOW_RE)?.[0] ?? null;
      if (!candidate) {
        searchIndex = handoffIndex + HANDOFF_PREFIX.length;
        continue;
      }

      const parsed = this._parseWrappedHandoff(candidate);
      if (parsed) {
        results.push(parsed);
      }

      searchIndex = handoffIndex + HANDOFF_PREFIX.length;
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
