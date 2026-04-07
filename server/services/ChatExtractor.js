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
  /\(thinking with \w+ effort\)/gi,      // "(thinking with medium effort)" CLI indicators
  /\(thought for \d+s?\)/gi,             // "(thought for 1s)" thinking summaries
  /^\s*\w{1,12}ing[.…]{2,3}\s*$/gm,     // partial ConPTY fragments like "ctioning...", "Determining…"
  /^\s*\w{1,12}ing\s*$/gm,              // bare "ing" words without dots: "etermining", "Determining"
  /^\s*\w{1,4}[.…]{2,3}\s*$/gm,        // ultra-short fragments like "tn...", "i..."
  /^\s*[a-z]{1,3}\s*$/gm,               // bare 1-3 char fragments: "i", "tn", "ii"
  /^\s*[A-Za-z]{1,4}\s*$/gm,            // bare 1-4 char fragments: "T", "Thnd", "Tun"
  /^\s*\w{1,25}[.…]{2,3}\s*$/gm,       // any word + ellipsis: "Determining...", "restidigitating..."
  /^\s*[A-Z]\w{0,24}ing[.…]*\s*$/gm,   // capitalized gerund fragments: "Determining", "Processing..."
  /^\s*[▸▶►‣⏵]+\s*/gm,                  // arrow prompt indicators (▸ ▸)
  /^\s*>\s*·/gm,                          // "> ·" prompt style
  /^\s*·\s*\/\w+/gm,                     // "· /doc" style prompts
  /^\s*[▸▶►]\s*[▸▶►]/gm,               // double arrow prompts
  /^\s*Claude Code v[\d.]+/gm,           // "Claude Code v2.1.92" version
  /^\s*Opus \d/gm,                       // "Opus 4.6..." model info
  /^\s*Welcome back \w+/gm,              // "Welcome back nicolò!"
  /^\s*·\s*esc\b.*$/gm,                  // "· esc to int..." status line
  /^\s*·\s*medium\b.*$/gm,              // "· medium · /eff..." status line
  /^\s*·[^a-zA-Z]*·/gm,                 // lines with multiple middots (status bar fragments)
  /^\s*[A-Z][a-z]?\s*$/gm,              // bare 1-2 char capital fragments: "Cn", "A"
  /^\s*\.{2,4}\s*$/gm,                   // bare dots: "...", "...."
  /^\s*…\s*$/gm,                          // bare unicode ellipsis
  /^\s*>\s*$/gm,                          // bare ">" prompt
  /[·•●◉]\s*esc\s+to\s+int[^·•●\n]*/gi, // inline "· esc to int..." fragments
  /[·•●◉]\s*medium\s*[·•●◉]/gi,         // inline "· medium ·" fragments
  /[·•●◉]\s*\/\w+[^·•●\n]*/gi,          // inline "· /eff..." fragments
  /esc to int[.…]*/gi,                    // bare "esc to int..." anywhere
  /medium\s*[·•●◉.]\s*\/eff/gi,          // "medium · /eff" status bar
  /^\s*.?\s*esc to int.*$/gm,             // full line with "esc to int"
  /^\s*.?\s*medium\s*.?\s*\/eff.*$/gm,   // full line with "medium · /eff"
  /^\s*[⎿⏐⏎│]\s*Tip:\s*Use\s*\/feedback.*$/gm, // Claude Code feedback tip
  /^\s*Tip:\s*Use\s*\/feedback.*$/gm,             // feedback tip without leader
];

// Only strip noise here when it is unquestionably chrome. Aggressive fragment
// filtering belongs in the final flush pass, otherwise legitimate short PTY
// chunks like "Ill" + "uminating..." lose their leading characters.
const CHUNK_NOISE_PATTERNS = [
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷▁▂▃▄▅▆▇█]+\s*/gm,
  /\x1b\[[0-9;]*[a-zA-Z]/g,
  /^\s*[─━═╌╍┄┅┈┉╴╶╸╺]+\s*$/gm,
  /^\s*[\u2500-\u257F]+\s*$/gm,
  /^\s*Working \([\d.]+s\)/gm,
  /^\s*\>\s*$/gm,
  /^╭[─╌]+.*╮$/gm,
  /^╰[─╌]+.*╯$/gm,
  /^│.*│$/gm,
  /^\s*\d+\s*│/gm,
  /^Press Enter to continue/gm,
  /^Type a message/gm,
  /^\s*claude[\s>]+$/gmi,
  /ClaudeCodev[\d.]+/g,
  /Tips for getting started/g,
  /Welcome back \w+!/g,
  /Run \/init to create/g,
  /Recent activity/g,
  /No recent activity/g,
  /Opus \d[\d.]+ with \w+ effort/g,
  /bypass permissions on/g,
  /\(shift\+tab to cycle\)/g,
  /^\s*[✢✶✻✽·*]+\s*$/gm,
  /^\s*[※✳✻✽✢✶·*☆★⊛⊕⊙◉◎⚡⚙].*$/gm,
  /^\s*Honking\.\.\.\s*$/gm,
  /^\s*Forming\.\.\.\s*$/gm,
  /Found \d+ settings? issues?/gm,
  /^\s*---\s*$/gm,
  /^\s*[⎿⏐⏎│]\s*Tip:\s*Use\s*\/feedback.*$/gm,
  /^\s*Tip:\s*Use\s*\/feedback.*$/gm,
];

// Patterns that indicate a response boundary (agent is done speaking)
const BOUNDARY_PATTERNS = [
  /__HANDOFF__/,
  /__DONE__/,
  /\bhandoff\s*:/i,
  /\bnext_agent\s*:/i,
];

const MIN_MESSAGE_LENGTH = 20;    // Default floor for normal chat messages
const MIN_SHORT_MESSAGE_LENGTH = 8; // Allow compact but meaningful greetings/replies

/**
 * Reflow a block of text by joining ConPTY column-wrapped lines back into
 * single-line paragraphs. Paragraph boundaries (blank lines) are preserved.
 *
 * Heuristic: within a paragraph, join consecutive non-empty lines together.
 * - If the previous line ended mid-word (last char is a letter, next line
 *   starts with a lowercase letter, AND the previous line is "long" — i.e.
 *   close to a typical ConPTY wrap width of ≥48 chars), join with NO space
 *   so "publish\ner" becomes "publisher".
 * - Otherwise join with a single space (the terminal usually wraps at a
 *   word boundary and consumes the space, so we restore it).
 *
 * This is intentionally conservative: a real markdown paragraph emitted by
 * an agent rarely contains internal newlines, so collapsing them is the
 * correct default. Multi-paragraph output is preserved via the `\n\n` split.
 */
function reflowParagraphs(text) {
  if (!text) return text;
  const paragraphs = String(text).split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) return lines.join('');
      let out = lines[0];
      for (let i = 1; i < lines.length; i++) {
        const next = lines[i];
        const prevEndChar = out.charAt(out.length - 1);
        const nextStartChar = next.charAt(0);
        const prevEndsWithLetter = /[\p{L}]/u.test(prevEndChar);
        const nextStartsLowerLetter = /[\p{Ll}]/u.test(nextStartChar);
        const prevIsLongWrap = out.length >= 48;
        if (prevEndsWithLetter && nextStartsLowerLetter && prevIsLongWrap) {
          // Likely a mid-word ConPTY break — join with no space.
          out = out + next;
        } else {
          // Word-boundary wrap (terminal consumed the space) — restore it.
          out = out + ' ' + next;
        }
      }
      return out;
    })
    .join('\n\n');
}

function shouldEmitChatMessage(text = '') {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  if (trimmed.length >= MIN_MESSAGE_LENGTH) return true;
  if (trimmed.length < MIN_SHORT_MESSAGE_LENGTH) return false;

  const letterCount = (trimmed.match(/[A-Za-z\u00C0-\u00FF]/g) || []).length;
  if (letterCount < 4) return false;

  return /[\s.!?,;:]/.test(trimmed);
}

export class ChatExtractor {
  constructor({
    onMessage,
    silenceTimeoutMs = 5000,
    sanitizeMessage = null,
    periodicFlushMs = 0,
  }) {
    this._onMessage = onMessage;
    this._silenceTimeoutMs = silenceTimeoutMs;
    this._sanitizeMessage = sanitizeMessage;
    this._periodicFlushMs = Number(periodicFlushMs) > 0 ? Number(periodicFlushMs) : 0;
    this._buffers = new Map();          // nodeId -> { text, timer, periodicTimer, lastChunkAt, executionId }
  }

  /**
   * Feed a clean (ANSI-stripped) chunk from an agent's PTY output.
   */
  feed(executionId, nodeId, cleanChunk) {
    if (!cleanChunk || !nodeId) return;

    let buf = this._buffers.get(nodeId);
    if (!buf) {
      buf = { text: '', timer: null, periodicTimer: null, lastChunkAt: 0, firstChunkAt: 0, lastEmittedText: '', executionId };
      this._buffers.set(nodeId, buf);
      if (this._periodicFlushMs > 0) {
        // Optional progressive flushes for long-running agents.
        buf.periodicTimer = setInterval(() => {
          this._periodicFlush(nodeId);
        }, this._periodicFlushMs);
      }
    }
    buf.executionId = executionId;

    // Strip noise
    let cleaned = cleanChunk;
    for (const pat of CHUNK_NOISE_PATTERNS) {
      pat.lastIndex = 0;  // Reset regex state (g flag preserves lastIndex)
      cleaned = cleaned.replace(pat, '');
    }
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    if (!cleaned.trim()) return;

    if (!buf.text) buf.firstChunkAt = Date.now();
    // Preserve the original PTY chunk boundaries exactly as received.
    // Adding synthetic spaces/newlines here corrupts split words and produces
    // visibly broken chat messages.
    buf.text += cleaned;
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

    // Buffer age guard — don't flush if buffer is too young
    const bufferAge = Date.now() - (buf.firstChunkAt || buf.lastChunkAt);
    if (bufferAge < 2000) return;

    // Only flush if there's been recent activity (within 2x the period)
    const timeSinceLastChunk = Date.now() - buf.lastChunkAt;
    if (this._periodicFlushMs > 0 && timeSinceLastChunk > this._periodicFlushMs * 2) return;

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
      .trim();

    // Re-apply ALL noise patterns on the accumulated buffer (catches noise that
    // survived chunk-level filtering because ConPTY split words across chunks)
    for (const pat of NOISE_PATTERNS) {
      pat.lastIndex = 0;  // Reset regex state (g flag preserves lastIndex)
      text = text.replace(pat, '');
    }

    // Line-level filter: remove lines that are pure noise fragments
    text = text.split('\n').filter(line => {
      const t = line.trim();
      if (!t) return false;
      // Lines that are just dots or ellipsis
      if (/^[.…·>]+$/.test(t)) return false;
      // Drop only ultra-short alpha fragments (1-3 chars). Do NOT drop longer
      // single-word lines like "Inoltre," or "Salve!" — those are the legitimate
      // start of an agent message that ConPTY column-wrapped onto its own line.
      // Aggressive fragment patterns above (NOISE_PATTERNS) already strip the
      // genuine 1-4 char chrome fragments, so this filter only needs to catch
      // residual noise that survived.
      if (/^[A-Za-z]{1,3}$/.test(t)) return false;
      // Short lines with only middots, slashes, and keywords (status bar)
      if (t.length < 60 && /^[·\s/\w.-]*$/.test(t) && (t.includes('· ') || t.includes('esc '))) return false;
      // Lines that are just a word + ellipsis (Determining..., etermining…, Processing...)
      if (/^\w{1,20}[.…]{2,3}$/.test(t)) return false;
      // Lines that are just a gerund or partial word
      if (/^\w{1,20}ing$/.test(t)) return false;
      // Lines that are just punctuation/symbols
      if (/^[^a-zA-Z0-9]*$/.test(t)) return false;
      // Lines that are CLI status fragments (· esc to int... · medium · /eff...)
      if (/[·•●◉]\s*(esc|medium|high|low|\/\w)/.test(t)) return false;
      // Lines containing status bar patterns
      if (/esc to int/.test(t) && /medium|high|low/.test(t)) return false;
      if (/\/eff/.test(t) && /medium|high|low/.test(t)) return false;
      return true;
    }).join('\n').trim();

    // Deduplicate consecutive identical lines
    text = text.split('\n').reduce((acc, line) => {
      if (acc.length === 0 || acc[acc.length - 1] !== line) acc.push(line);
      return acc;
    }, []).join('\n');

    // Fuzzy dedup: collapse consecutive lines that differ by ≤3 chars (ConPTY variations)
    text = text.split('\n').reduce((acc, line) => {
      if (acc.length > 0) {
        const prev = acc[acc.length - 1].trim();
        const curr = line.trim();
        // Skip if one is a substring of the other (e.g., "etermining" vs "Determining")
        if (prev.length > 5 && curr.length > 5) {
          if (prev.includes(curr) || curr.includes(prev)) return acc;
          if (prev.toLowerCase() === curr.toLowerCase()) return acc;
        }
      }
      acc.push(line);
      return acc;
    }, []).join('\n');

    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // Reflow ConPTY column-wraps: terminal output is hard-wrapped at the
    // column width, leaving literal `\n` chars mid-paragraph. Without this
    // step the chat panel renders broken lines like
    //   "Inoltre, il publisher si occupa\ndella formattazione finale".
    // We split on blank lines (real paragraph boundaries) and rejoin the
    // soft-wrapped lines inside each paragraph back into a single line so
    // the client's CSS can wrap them naturally.
    text = reflowParagraphs(text);

    if (typeof this._sanitizeMessage === 'function') {
      const sanitizedText = this._sanitizeMessage(text, {
        executionId,
        nodeId,
        rawText: buf.text,
      });
      if (typeof sanitizedText === 'string') {
        text = sanitizedText.trim();
      }
    }

    // Cross-flush dedup — skip if identical to last emitted text
    if (text === buf.lastEmittedText) {
      buf.text = '';
      buf.firstChunkAt = 0;
      return;
    }

    // Skip messages that are predominantly JSON (likely handoff context payload)
    const jsonPunctuation = (text.match(/[{}":\[\]]/g) || []).length;
    if (text.length > 0 && jsonPunctuation > text.length * 0.25) {
      buf.text = '';
      buf.firstChunkAt = 0;
      return;
    }

    // Keep normal messages, but also allow short human-readable replies
    // such as greetings that would otherwise disappear from the Chat view.
    if (shouldEmitChatMessage(text)) {
      this._onMessage({
        executionId,
        nodeId,
        role: 'assistant',
        text,
        timestamp: Date.now(),
      });
      buf.lastEmittedText = text;
    }

    buf.text = '';
    buf.firstChunkAt = 0;
  }

  /**
   * Clean up all buffers and timers for an execution.
   */
  cleanup(executionId) {
    // Flush any remaining buffered text before clearing — otherwise agent
    // output accumulated since the last silence-timeout flush is silently lost.
    for (const [nodeId, buf] of this._buffers.entries()) {
      if (buf.timer) clearTimeout(buf.timer);
      if (buf.periodicTimer) clearInterval(buf.periodicTimer);
      // Force a final flush so the text makes it into chatMessages
      if (buf.text && buf.text.trim()) {
        this._flush(buf.executionId || executionId, nodeId);
      }
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
