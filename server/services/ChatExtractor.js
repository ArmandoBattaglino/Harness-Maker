// server/services/ChatExtractor.js
// Extracts clean chat messages from agent PTY streams for the Unified Chat View.

// Noise patterns to strip — subset of SwarmEngine's snippet noise regexes
const NOISE_PATTERNS = [
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷▁▂▃▄▅▆▇█]+\s*/gm,  // spinners
  /\x1b\[[0-9;]*[a-zA-Z]/g,            // ANSI escapes (residual)
  /^\s*[─━═╌╍┄┅┈┉╴╶╸╺]+\s*$/gm,       // horizontal rules
  /^\s*[\u2500-\u257F]+\s*$/gm,         // box-drawing lines
  /^\s*Working \([\d.]+s\)/gm,          // Codex "Working (Xs)"
  /^\s*\>\s*$/gm,                       // bare prompt arrows
  /^╭─+╮$|^╰─+╯$/gm,                   // box borders
  /^│\s*│$/gm,                          // empty box lines
  /^\s*\d+\s*│/gm,                      // line number prefixes
  /^Press Enter to continue/gm,
  /^Type a message/gm,
  /^\s*claude[\s>]+$/gmi,               // bare "claude>" prompt
];

// Patterns that indicate a response boundary (agent is done speaking)
const BOUNDARY_PATTERNS = [
  /__HANDOFF__/,
  /__DONE__/,
  /\bhandoff\s*:/i,
  /\bnext_agent\s*:/i,
];

export class ChatExtractor {
  constructor({ onMessage, silenceTimeoutMs = 3000 }) {
    this._onMessage = onMessage;       // callback(msg) where msg = { executionId, nodeId, role, text, timestamp }
    this._silenceTimeoutMs = silenceTimeoutMs;
    this._buffers = new Map();          // nodeId -> { text, timer, lastChunkAt }
  }

  /**
   * Feed a clean (ANSI-stripped) chunk from an agent's PTY output.
   * Call this from SwarmEngine's tapFn after the echo gate check.
   */
  feed(executionId, nodeId, cleanChunk) {
    if (!cleanChunk || !nodeId) return;

    let buf = this._buffers.get(nodeId);
    if (!buf) {
      buf = { text: '', timer: null, lastChunkAt: 0 };
      this._buffers.set(nodeId, buf);
    }

    // Strip noise
    let cleaned = cleanChunk;
    for (const pat of NOISE_PATTERNS) {
      cleaned = cleaned.replace(pat, '');
    }
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    if (!cleaned) return;

    buf.text += (buf.text ? '\n' : '') + cleaned;
    buf.lastChunkAt = Date.now();

    // Check for boundary
    const hasBoundary = BOUNDARY_PATTERNS.some(p => p.test(cleaned));
    if (hasBoundary) {
      this._flush(executionId, nodeId);
      return;
    }

    // Reset silence timer
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      this._flush(executionId, nodeId);
    }, this._silenceTimeoutMs);
  }

  /**
   * Force-flush the buffer for a node (e.g., when agent status changes to 'done').
   */
  flush(executionId, nodeId) {
    this._flush(executionId, nodeId);
  }

  /**
   * Emit a system message (for flow-control events like delays, routing, merging).
   */
  systemMessage(executionId, nodeId, text) {
    if (this._onMessage) {
      this._onMessage({
        executionId,
        nodeId,
        role: 'system',
        text,
        timestamp: Date.now(),
      });
    }
  }

  _flush(executionId, nodeId) {
    const buf = this._buffers.get(nodeId);
    if (!buf || !buf.text.trim()) return;

    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }

    // Remove handoff/done markers from the emitted text
    let text = buf.text
      .replace(/__HANDOFF__[\s\S]*/g, '')
      .replace(/__DONE__[\s\S]*/g, '')
      .trim();

    if (text) {
      this._onMessage({
        executionId,
        nodeId,
        role: 'assistant',
        text,
        timestamp: Date.now(),
      });
    }

    buf.text = '';
  }

  /**
   * Clean up all buffers and timers for an execution.
   */
  cleanup(executionId) {
    for (const [nodeId, buf] of this._buffers.entries()) {
      if (buf.timer) clearTimeout(buf.timer);
    }
    this._buffers.clear();
  }

  /**
   * Flush and clean a specific node.
   */
  cleanupNode(executionId, nodeId) {
    const buf = this._buffers.get(nodeId);
    if (buf) {
      this._flush(executionId, nodeId);
      if (buf.timer) clearTimeout(buf.timer);
      this._buffers.delete(nodeId);
    }
  }
}
