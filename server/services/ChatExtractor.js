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
  /^╭[─╌]+.*╮$/gm,                      // box top borders (╭───...╮)
  /^╰[─╌]+.*╯$/gm,                      // box bottom borders (╰───...╯)
  /^│.*│$/gm,                            // box content lines (│...│)
  /^\s*\d+\s*│/gm,                      // line number prefixes
  /^Press Enter to continue/gm,
  /^Type a message/gm,
  /^\s*claude[\s>]+$/gmi,               // bare "claude>" prompt
  /ClaudeCodev[\d.]+/g,                 // Claude Code version string
  /Tips for getting started/g,
  /Welcome back \w+!/g,                 // Welcome banner
  /Run \/init to create/g,
  /Recent activity/g,
  /No recent activity/g,
  /Opus \d[\d.]+ with \w+ effort/g,     // "Opus 4.6 with medium effort"
  /bypass permissions on/g,
  /\(shift\+tab to cycle\)/g,
  /^\s*[✢✶✻✽·*]+\s*$/gm,               // bare decoration chars
  /^\s*[✢✶✻✽·*][A-Z]/gm,               // decoration char + letter (streaming artifacts)
  /^\s*[※✳✻✽✢✶·*☆★⊛⊕⊙◉◎⚡⚙].*$/gm,   // lines starting with decorative symbols
  /^\s*Honking\.\.\.\s*$/gm,            // "Honking..." CLI noise
  /^\s*Forming\.\.\.\s*$/gm,            // "Forming..." CLI noise
  /Found \d+ settings? issues?/gm,      // settings issue warning
  /^\s*---\s*$/gm,                       // bare horizontal separators
  /^\s*DONE\s*$/gm,                      // bare "DONE" token
  /^\s*>\s*$/gm,                         // bare ">" prompt
  /^\s*\/\w+/gm,                         // bare slash commands (/doc, /buddy)
  /HANDOFF:[a-z0-9-]+:\s*\{/gm,         // raw HANDOFF JSON markers
];

// Patterns that indicate a response boundary (agent is done speaking)
const BOUNDARY_PATTERNS = [
  /__HANDOFF__/,
  /__DONE__/,
  /\bhandoff\s*:/i,
  /\bnext_agent\s*:/i,
];

const PERIODIC_FLUSH_MS = 2000;   // Flush buffer every 2s if it has content
const MIN_MESSAGE_LENGTH = 10;    // Skip very short noise fragments

export class ChatExtractor {
  constructor({ onMessage, silenceTimeoutMs = 3000 }) {
    this._onMessage = onMessage;
    this._silenceTimeoutMs = silenceTimeoutMs;
    this._buffers = new Map();          // nodeId -> { text, timer, periodicTimer, lastChunkAt, executionId }
  }

  /**
   * Feed a clean (ANSI-stripped) chunk from an agent's PTY output.
   */
  feed(executionId, nodeId, cleanChunk) {
    if (!cleanChunk || !nodeId) return;

    let buf = this._buffers.get(nodeId);
    if (!buf) {
      buf = { text: '', timer: null, periodicTimer: null, lastChunkAt: 0, executionId };
      this._buffers.set(nodeId, buf);
      // Start periodic flush timer for this node
      buf.periodicTimer = setInterval(() => {
        this._periodicFlush(nodeId);
      }, PERIODIC_FLUSH_MS);
    }
    buf.executionId = executionId;

    // Strip noise
    let cleaned = cleanChunk;
    for (const pat of NOISE_PATTERNS) {
      cleaned = cleaned.replace(pat, '');
    }
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    if (!cleaned) return;

    buf.text += (buf.text ? '\n' : '') + cleaned;
    buf.lastChunkAt = Date.now();

    // Check for boundary — immediate flush
    const hasBoundary = BOUNDARY_PATTERNS.some(p => p.test(cleaned));
    if (hasBoundary) {
      this._flush(executionId, nodeId);
      return;
    }

    // Reset silence timer (backup — fires if no chunks for 3s)
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      this._flush(executionId, nodeId);
    }, this._silenceTimeoutMs);
  }

  /**
   * Periodic flush — called every PERIODIC_FLUSH_MS for each active node.
   * Emits accumulated text as a chat message even during continuous streaming.
   */
  _periodicFlush(nodeId) {
    const buf = this._buffers.get(nodeId);
    if (!buf || !buf.text.trim() || buf.text.trim().length < MIN_MESSAGE_LENGTH) return;

    // Only flush if there's been recent activity (within 2x the period)
    const timeSinceLastChunk = Date.now() - buf.lastChunkAt;
    if (timeSinceLastChunk > PERIODIC_FLUSH_MS * 2) return;

    this._flush(buf.executionId, nodeId);
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

    // Remove handoff/done markers and raw HANDOFF JSON from the emitted text
    let text = buf.text
      .replace(/__HANDOFF__[\s\S]*/g, '')
      .replace(/__DONE__[\s\S]*/g, '')
      .replace(/HANDOFF:[a-z0-9-]+:\s*\{[\s\S]*/gi, '')
      .replace(/\bhandoff\s*:\s*\{[\s\S]*/gi, '')
      .replace(/^\s*---\s*$/gm, '')
      .replace(/^\s*DONE\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Skip very short fragments (likely noise)
    if (text && text.length >= MIN_MESSAGE_LENGTH) {
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
      if (buf.periodicTimer) clearInterval(buf.periodicTimer);
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
      if (buf.periodicTimer) clearInterval(buf.periodicTimer);
      this._buffers.delete(nodeId);
    }
  }
}
