// server/services/ChatExtractor.js
// Extracts clean chat messages from agent PTY streams for the Unified Chat View.
// [STREAM-JSON-MIGRATION] This module is bypassed for Claude stream-json agents
// and remains in use only for PTY agents such as Codex/Gemini.

import { normalizeChatDisplayText } from './chatTextNormalization.js';

// Noise patterns to strip — subset of SwarmEngine's snippet noise regexes
const NOISE_PATTERNS = [
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷▁▂▃▄▅▆▇█]+\s*/gm,  // spinners
  /\x1b\[[0-9;]*[a-zA-Z]/g,            // ANSI escapes (residual)
  /\x1b+/g,                             // orphan/double ESC characters (ConPTY artifacts)
  /\[[\?]?\d+[a-zA-Z]/g,               // bare CSI sequences without ESC (ConPTY strips ESC): [?2026h, [?2026l, [1C, etc.
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
  /⎿\s+.{0,200}$/gm,                              // Claude Code tool-output leader (⎿  Stop says: ...) — anywhere in line
  /[⎿⏐⏎│]\s*Stop says:.*$/gm,                    // hook "Stop says:" output — anywhere in line
  /⚠️?\s*MEMORIA NON SCRITTA[^]*/gm,             // memory-keeper hook warning
  /Now using extra usage/g,                        // Claude CLI "Now using extra usage" status
  /\(?\s*running\s*stop\s*hook\s*\)?\s*/gi,       // "(running stop hook)" CLI indicator
  /\(?\s*stop\s*hook\s*\)?\s*/gi,                 // "(stop hook)" CLI indicator
  /^\s*thought for \d+s?\b.*$/gm,                 // "thought for 1s" bare line
  /\b\w{3,20}ing[.…]{2,3}[^a-zA-Z\s]*(?:\s*[⎿⏐])/gm, // thinking indicator + hook leader: "Topsy-turvying...⎿"
  /^\s*[▝▜▛▘▟▙▚▞▐]+[^a-zA-Z]*$/gm,              // half-block/quadrant character noise lines
  // --- Rate-limit / quota messages (BUG-CE-1) ---
  /you've used \d+%\s*of your session limit/gi,   // "You've used 92% of your session limit"
  /you've hit your limit/gi,                       // "You've hit your limit"
  /you have hit your limit/gi,                     // variant
  /^\s*.*session limit.*resets?\b.*$/gm,           // full line with "session limit ... resets"
  /^\s*.*usage limit.*resets?\b.*$/gm,             // "usage limit ... resets"
  /\/rate-limit-options/g,                          // "/rate-limit-options" menu reference
  // --- ConPTY spaceless variants (BUG-CE-2) ---
  /bypass\s*permissions?\s*on/gi,                   // "bypasspermissionson" or "bypass permissions on"
  /\(?\s*shift\s*\+?\s*tab\s*(?:to\s*)?cycle\s*\)?/gi, // "(shift+tabtocycle)" or "(shift+tab to cycle)"
  // --- Codex CLI noise (BUG-CE-3) ---
  /Welcome\s*to\s*Codex/gi,                        // "WelcometoCodex" or "Welcome to Codex"
  /OpenAI'?s?\s*command[\s-]*line\s*coding\s*agent/gi, // "OpenAI's command-line coding agent"
  /Sign\s*in\s*with\s*ChatGPT/gi,                  // "SigninwithChatGPT"
  /Sign\s*in\s*with\s*Device\s*Code/gi,            // "SigninwithDeviceCode"
  /Provide\s*your\s*own\s*API\s*key/gi,            // "ProvideyourownAPIkey"
  /^\s*Boogieing.*$/gm,                             // "Boogieing..." Codex animation
  /^\s*(?:\w{2,20}ing(?:[.…]{2,3}|…)\s*){2,}$/gmi,  // "Recombobulating... Fluttering..." spinner lines
  /Recombobulat\w*/gi,                               // Claude CLI "Recombobulating" spinner
  /Defenestrat\w*/gi,                                // Claude CLI "Defenestrating" spinner
  /Topsy-?\s*turvy\w*/gi,                            // Claude CLI "Topsy-turvying" spinner
  /Splendiferous\w*/gi,                              // Claude CLI whimsical spinner word
  /^\s*do you want to do\?\s*$/gm,                 // Codex interactive prompt
  /Upgrade your\s*plan/gi,                          // "Upgrade your plan"
  /Stop\s*and\s*wait\s*for\s*limit\s*to\s*reset/gi, // "Stopandwaitforlimittoreset"
  /based\s*billing/gi,                              // "basedbilling"
  /Pay for what you use/gi,                         // Codex billing prompt
  /Tip:\s*New\s*Use\s*\/fast[^\n]*/gi,             // Codex inline usage tip
  /[>\u203A]?\s*Run\s*\/review\s*on\s*my\s*current\s*changes[^\n]*/gi, // leaked Codex review prompt
  /Tip:\s*New\s*Try\s*the\s*Codex\s*App[^\n]*/gi,  // Codex app upsell banner
  /Run\s*'codex\s*app'\s*or\s*visit[^\n]*/gi,      // Codex app upsell CTA
  /https?:\/\/chatgpt\.com\/codex\?app-landing-page=true/gi, // Codex app landing CTA URL
  /(?:^|\s)(?:high|medium|low)\s*[·.]\s*(?:until\s+)?(?:il\s+)?April\s+\d+(?:st|nd|rd|th)\b/gi, // promo date tail
  /[>\u203A]\s*No\s*extra\s*text\s*after\s*that\s*last\s*handoff\s*line[^\n]*/gi, // swarm prompt echo
  /[>\u203A]\s*You\s*are\s*the\s*[^\n]*/gi,        // inline prompt echo in Codex fallback chat
  /[>\u203A]\s*When\s*your\s*work\s*is\s*complete[^\n]*/gi, // prompt echo follow-up
  /^(?!.*[.!?]).*[\u2022\u25E6\u00B7]?\s*Working\s*\(\d+s[^\n]*(?:% left|gpt-[\w.-]+)[^\n]*$/gmi, // inline Codex status meter
  /[\u2022\u25E6\u00B7]?\s*Spawned\s+[^\n]*\[[^\]]+\][^\n]*/gi, // Codex subagent lifecycle
  /[\u2022\u25E6\u00B7]?\s*Closed\s+[^\n]*\[[^\]]+\][^\n]*/gi,
  /[\u2022\u25E6\u00B7]?\s*Waiting\s*for\s*\d+\s*agents?[^\n]*/gi,
  /[\u2022\u25E6\u00B7]?\s*Finished\s*waiting[^\n]*/gi,
  /[\u2514\u251C\u2502]?\s*\w+\s*\[[^\]]+\]:\s*Completed\s*-\s*[^\n]*/gi, // Codex worker summaries
  /[\u2514\u251C\u2502]?\s*You\s*are\s*Agent-[^\n]*/gi, // echoed worker prompt line
  /^\s*Nessun progetto con docs\/memory\/.*$/gm,   // hook/memory warning (Italian)
  /^\s*Stop says:.*$/gm,                            // "Stop says: ..." hook output
  /^\s*Structured handoff sent\.?\s*$/gm,          // "Structured handoff sent." — protocol echo, not semantic
  /Structured\s*handoff\s*sent\.?/gi,               // inline variant (survives ConPTY line joining)
  // --- Claude Code banner / header (BUG-CE-4) ---
  /[▐▛▜▌▝▘█]+\s*Claude\s*Code\s*v[\d.]+/gi,       // "▐▛███▜▌   Claude Code v2.1.94"
  /[▐▛▜▌▝▘█]+[^a-zA-Z\n]*Claude\s*Max/gi,         // "▝▜█████▛▘   · Claude Max"
  /[▐▛▜▌▝▘█]{2,}[^a-zA-Z\n]*/gm,                  // runs of half-block chars (banner fragments)
  /Claude\s*runtime\s*is\s*active\s*for\s*this\s*Swarm/gi, // system prompt echo
  /Continue\s*the\s*workflow\s*using\s*the\s*shared\s*task\s*context/gi, // system prompt echo
  /is\s*not\s*the\s*end\s*of\s*the\s*workflow\s*yet/gi, // done-reinject prompt echo
  /Do\s*not\s*stop\s*at\s*the\s*done\s*marker/gi,  // done-reinject prompt echo
  /downstream\s*agents?\s*still\s*need\s*your\s*output/gi, // done-reinject echo
  /Finish\s*your\s*work,?\s*then\s*hand\s*off\s*to/gi, // handoff instruction echo
  /Your\s*very\s*last\s*line/gi,                    // handoff instruction echo
  /Execute\s*the\s*workflow\s*goal\s*described\s*here/gi, // reinject prompt echo
  /❯\s*Claude\s*runtime/gi,                         // prompt-style system prompt echo
  /❯\s*\w+\s*is\s*not\s*the\s*end/gi,             // prompt-style reinject echo
  // --- Swarm protocol / system prompt echos ---
  /SWARM\s*PROTOCOL/gi,                            // "SWARM PROTOCOL (mandatory - never skip)"
  /You\s*are\s*(?:a|the)\s+\w+\s*(?:agent|node)?\s*\.?\s*You\s*(?:receive|will|must|should|are)/gi,
  /must\s*be\s*a\s*valid\s*handoff\s*token/gi,
  /Use\s*node-\d+\s*in\s*place\s*of/gi,
  /in\s*place\s*of\s*<?\s*target\s*I?d?\s*>?/gi,
  /Current\s*workflow\s*context\s*:/gi,
  /workflow\s*Name\s*:/gi,
  /workflow\s*Description\s*:/gi,
  /current\s*Task\s*:/gi,
  /You\s*are\s*the\s*FINAL\s*agent/gi,
  /no\s*downstream\s*handoffs?\s*exist/gi,
  /MUST\s*output\s*the\s*done\s*marker/gi,
  /Do\s*real\s*work\s*before\s*deciding/gi,
  /You\s*have\s*an\s*active\s*task\s*right\s*now/gi,
  /Con\s*t\s*in\s*u\s*e\s*this\s*task/gi,          // ConPTY-fragmented "Continue this task"
  /in\s*this\s*EXACT\s*format\s*:\s*<?target/gi,   // handoff instruction echo
  /\(?\s*mandatory\s*-?\s*never\s*skip\s*\)?/gi,   // SWARM PROTOCOL header echo
  /forcedHandoff\s*:\s*(?:true|false)/gi,           // forced handoff metadata
  /reason\s*:\s*Agent\s*emitted/gi,                 // forced handoff reason
  /is\s*not\s*terminal\s*in\s*the\s*workflow/gi,    // handoff instruction echo
  /you\s*MUST\s*emit\s*a\s*handoff\s*token/gi,     // handoff instruction echo
  /required\s*downstream\s*target\s*is/gi,          // handoff instruction echo
  /valid\s*target\s*IDs?\s*:/gi,                     // handoff instruction echo
  /context\s*update\s*:\s*a\s*flat\s*JSON/gi,       // handoff instruction echo
  /CONCRETE\s*EXAMPLE\s*\(replace/gi,               // example section echo
  /^\s*Notepad\s*$/gm,                                // Windows Notepad ghost process echo
  /Do\s*no\s*t?\s*stop\s*at\s*the\s*done\s*marker/gi, // ConPTY-garbled reinject prompt
  /that\s*final\s*handoff\s*token\s*as\s*plain\s*text/gi, // reinject instruction echo
  /Replace\s*the\s*summary\s*value\s*with/gi,          // reinject instruction echo
  /Your\s*very\s*last\s*(?:line|lin)\s*must\s*be/gi,   // reinject instruction echo (+ garbled "lin")
  /-+\s*END\s*SWARM\s*INPUT\s*-+/gi,                    // echo marker leaking through gate
  /END\s*SWARM\s*INPUT/gi,                               // echo marker fragment
  /flat\s*JSON\s*with\s*primitive\s*values/gi,           // reinject instruction echo
  /Keep\s*the\s*handoff\s*line\s*compact/gi,             // reinject instruction echo
  /emit\s*(?:one\s*)?(?:valid\s*)?handoff\s*token/gi,   // reinject instruction echo
];

// Only strip noise here when it is unquestionably chrome. Aggressive fragment
// filtering belongs in the final flush pass, otherwise legitimate short PTY
// chunks like "Ill" + "uminating..." lose their leading characters.
const CHUNK_NOISE_PATTERNS = [
  /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷▁▂▃▄▅▆▇█]+\s*/gm,
  /\x1b\[[0-9;]*[a-zA-Z]/g,
  /\x1b+/g,                             // orphan/double ESC characters
  /\[[\?]?\d+[a-zA-Z]/g,               // bare CSI without ESC: [?2026h, [?2026l, [1C
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
  /bypass\s*permissions?\s*on/gi,
  /\(?\s*shift\s*\+?\s*tab\s*(?:to\s*)?cycle\s*\)?/gi,
  /^\s*[✢✶✻✽·*]+\s*$/gm,
  /^\s*[※✳✻✽✢✶·*☆★⊛⊕⊙◉◎⚡⚙].*$/gm,
  /^\s*Honking\.\.\.\s*$/gm,
  /^\s*Forming\.\.\.\s*$/gm,
  /^\s*Boogieing.*$/gm,
  /Found \d+ settings? issues?/gm,
  /^\s*---\s*$/gm,
  /^\s*[⎿⏐⏎│]\s*Tip:\s*Use\s*\/feedback.*$/gm,
  /^\s*Tip:\s*Use\s*\/feedback.*$/gm,
  /you've used \d+%\s*of your session limit/gi,
  /you've hit your limit/gi,
  /Welcome\s*to\s*Codex/gi,
  /^\s*Stop says:.*$/gm,
  /^\s*Structured handoff sent\.?\s*$/gm,
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
        const prev = lines[i - 1];
        const next = lines[i];
        const prevEndChar = prev.charAt(prev.length - 1);
        const nextStartChar = next.charAt(0);
        const prevEndsWithLetter = /[\p{L}]/u.test(prevEndChar);
        const nextStartsLowerLetter = /[\p{Ll}]/u.test(nextStartChar);
        // Use the ORIGINAL previous line length, not the accumulated output,
        // so that short lines don't trigger mid-word join.
        const prevIsLongWrap = prev.length >= 48;
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
    this._nodePrompts = new Map();   // nodeId -> normalized prompt text for echo detection
    this._sanitizeMessage = sanitizeMessage;
    this._periodicFlushMs = Number(periodicFlushMs) > 0 ? Number(periodicFlushMs) : 0;
    this._buffers = new Map();          // `${executionId}:${nodeId}` -> { text, timer, periodicTimer, lastChunkAt, executionId }
  }

  /**
   * Register the system prompt / workflow context text for a node so the
   * flush logic can detect and discard messages that are just echo/summary
   * of that prompt rather than actual agent work product.
   */
  registerNodePrompt(nodeId, promptText) {
    if (!nodeId || !promptText) return;
    // Normalize: lowercase, collapse whitespace, strip punctuation
    const normalized = String(promptText).toLowerCase().replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim();
    // Extract significant words (4+ chars) for matching
    const words = normalized.split(' ').filter(w => w.length >= 4);
    if (words.length > 0) {
      // Merge with existing words (reinject prompts add more words over time)
      const existing = this._nodePrompts.get(nodeId);
      if (existing) {
        for (const w of words) existing.add(w);
      } else {
        this._nodePrompts.set(nodeId, new Set(words));
      }
    }
  }

  /**
   * Check if a message text is predominantly a repeat of the registered
   * system prompt for the given node (high word overlap → prompt echo).
   */
  _isPromptEcho(nodeId, text) {
    const promptWords = this._nodePrompts.get(nodeId);
    if (!promptWords || promptWords.size === 0) return false;
    const msgNormalized = String(text).toLowerCase().replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim();
    const msgWords = msgNormalized.split(' ').filter(w => w.length >= 4);
    if (msgWords.length === 0) return false;
    // Exact word match
    let overlap = msgWords.filter(w => promptWords.has(w)).length;
    // Fuzzy match for ConPTY-garbled words: check if the word is a close
    // substring of a prompt word (e.g., "ands" from "hands", "esearcher" from "researcher").
    // Require the shorter word to be ≥70% of the longer word's length to avoid
    // false positives like "brightly" matching "right".
    const unmatched = msgWords.filter(w => !promptWords.has(w));
    const promptArr = [...promptWords];
    for (const word of unmatched) {
      if (word.length >= 4) {
        for (const pw of promptArr) {
          const shorter = Math.min(word.length, pw.length);
          const longer = Math.max(word.length, pw.length);
          if (shorter / longer >= 0.7 && (pw.includes(word) || word.includes(pw))) {
            overlap++;
            break;
          }
        }
      }
    }
    // If >55% of the message's words come from the prompt, it's an echo
    return overlap / msgWords.length > 0.55;
  }

  /**
   * Feed a clean (ANSI-stripped) chunk from an agent's PTY output.
   */
  feed(executionId, nodeId, cleanChunk) {
    if (!cleanChunk || !nodeId) return;

    const bufKey = `${executionId}:${nodeId}`;
    let buf = this._buffers.get(bufKey);
    if (!buf) {
      buf = { text: '', timer: null, periodicTimer: null, lastChunkAt: 0, firstChunkAt: 0, lastEmittedText: '', executionId };
      this._buffers.set(bufKey, buf);
      if (this._periodicFlushMs > 0) {
        // Optional progressive flushes for long-running agents.
        buf.periodicTimer = setInterval(() => {
          this._periodicFlush(bufKey, nodeId);
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
  _periodicFlush(bufKey, nodeId) {
    const buf = this._buffers.get(bufKey);
    if (!buf || !buf.text.trim() || buf.text.trim().length < MIN_MESSAGE_LENGTH) return;

    // Buffer age guard — don't flush if buffer is too young
    const bufferAge = Date.now() - (buf.firstChunkAt || buf.lastChunkAt);
    if (bufferAge < 6000) return;

    // Only flush if there's been recent activity (within 2x the period)
    const timeSinceLastChunk = Date.now() - buf.lastChunkAt;
    if (this._periodicFlushMs > 0 && timeSinceLastChunk > this._periodicFlushMs * 2) return;

    this._flush(buf.executionId, nodeId);
  }

  /**
   * Force-flush the buffer for a node (e.g., when agent status changes to 'done').
   */
  flush(executionId, nodeId) {
    this._flush(executionId, nodeId, `${executionId}:${nodeId}`);
  }

  /**
   * Discard any accumulated buffer for a node without emitting.
   * Called when the echo gate clears — pre-gate noise (CLI banner, system prompt
   * echo fragments) has leaked into the buffer and must be discarded so that
   * only post-gate agent content accumulates for the next flush.
   */
  resetBuffer(executionId, nodeId) {
    const bufKey = `${executionId}:${nodeId}`;
    const buf = this._buffers.get(bufKey);
    if (buf) {
      buf.text = '';
      buf.firstChunkAt = 0;
      buf.lastEmittedText = '';
    }
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

  _flush(executionId, nodeId, bufKey) {
    if (!bufKey) bufKey = `${executionId}:${nodeId}`;
    const buf = this._buffers.get(bufKey);
    if (!buf || !buf.text.trim()) return;

    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }

    // Early system prompt detection — check the RAW buffer text BEFORE noise
    // stripping, so key markers (node-\d+, SWARM PROTOCOL, etc.) are still
    // present and detectable.
    const RAW_PROMPT_INDICATORS = [
      /SWARM\s*PROTOCOL/i,
      /Con\s*t\s*in\s*u\s*e\s*this\s*task\s*:/i,
      /Execute\s*the\s*workflow\s*goal/i,
      /mandatory\s*-?\s*never\s*skip/i,
      /Structured\s*handoff\s*sent/i,
      /node-\d+[\s\S]*?\bfor\s+this\s+workflow/i,
      /for\s+this\s+workflow[\s\S]*?\bnode-\d+/i,
      /__HANDOFF__\s*:\s*<?\s*targetId/i,
      /in\s*this\s*EXACT\s*format/i,
      /Use\s+node-\d+\s+in\s+place\s+of/i,
      /Your\s+(?:required\s+)?downstream\s+target\s+is/i,
      /is\s+not\s+terminal\s+in\s+the\s+workflow/i,
      /you\s+MUST\s+emit\s+a\s+handoff\s+token/i,
      /Do\s+not\s+emit\s+__DONE__/i,
      /CONCRETE\s+EXAMPLE\s+\(replace/i,
      /Your\s+very\s+last\s+line\s+must\s+be/i,
      /hands?\s*off\s*to\s*(?:a|the|an)\s+\w+[\s\S]*?node-\d+/i,
      /then\s+hands?\s*off\s*to\s*(?:a|the|an)\s+\w+[\s\S]*?(?:who|that|which)\s+\w+/i,
      /is\s+not\s+the\s+end\s+of\s+the\s+workflow/i,
      /Do\s+not\s+stop\s+at\s+the\s+done\s+marker/i,
    ];
    const rawText = buf.text;
    if (RAW_PROMPT_INDICATORS.some(p => p.test(rawText))) {
      buf.text = '';
      buf.firstChunkAt = 0;
      return;
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
      const prev = text;
      text = text.replace(pat, '');
    }

    // Targeted cleanup for Codex fallback chrome that can be injected inline
    // around otherwise-useful assistant text during periodic flushes.
    text = text
      .replace(/^(?:â€¢|â€|Â·|•|·)+\s*/gi, '')
      .replace(/Working\s*\(\d+s\s*[>\u203A]?\s*(?:Write tests for|Improve documentation in)\s+@[\w.-]+/gi, '')
      .replace(/[>\u203A]?\s*(?:Write tests for|Improve documentation in)\s+@[\w.-]+/gi, '')
      .replace(/Working\s*\(\d+s\s*[>\u203A]?\s*Find and fix a bug in @[\w.-]+/gi, '')
      .replace(/[>\u203A]?\s*Find and fix a bug in @[\w.-]+/gi, '')
      .replace(/[>\u203A]?\s*Run\s*\/review\s*on\s*my\s*current\s*changes[^\n]*/gi, '')
      .replace(/Tip:\s*New\s*Try\s*the\s*Codex\s*App[^\n]*/gi, '')
      .replace(/Run\s*'codex\s*app'\s*or\s*visit[^\n]*/gi, '')
      .replace(/https?:\/\/chatgpt\.com\/codex\?app-landing-page=true/gi, '')
      .replace(/(?:^|\s)(?:high|medium|low)\s*[Â··.]\s*(?:until\s+)?(?:il\s+)?April\s+\d+(?:st|nd|rd|th)\b/gi, ' ')
      .replace(/\b(?:Write tests for|Improve documentation in|Find and fix a bug in)\s+@[\w.-]+\b/gi, '')
      .replace(/^\s*[^\w\s]?\s*Working\s*\(\d+s[^A-Za-z\n]*/i, '')
      .replace(/[•◦●]?\s*Working\s*\(\d+s\b[^\n]*/gi, (segment) => {
        const semanticMatch = [...segment.matchAll(/[A-Z\u00C0-\u00D6][a-z\u00DF-\u00F6\u00F8-\u00FF]{3,}/gu)]
          .find((match) => !/^(?:Working|Write|Improve|Find)$/u.test(match[0]));
        if (!semanticMatch || semanticMatch.index == null) return '';
        return segment.slice(semanticMatch.index);
      })
      .replace(/[•◦●]?\s*Working\s*\([^)\n]*\)/gi, '')
      .replace(/\bWhen your work is complete, emit one valid handoff token using any connected\s*target ID:[^.\n]*(?:\.|$)/gi, '')
      .replace(/\bThe runtime will fan out that handoff to every connected downstream node for\s*you\.?/gi, '')
      .replace(/\bYou are the triage node\.?/gi, '')
      .replace(/\bRoute the incoming request to both Agent-A and Agent-B in parallel for greeting generation\.?/gi, '')
      .replace(/\bLast line only:?/gi, '')
      .replace(/\bNo extra text after that last handoff line\.?/gi, '')
      .replace(/\b\d+%\s*left\b[^\n]*/gi, '')
      .replace(/\b\d+%\s*left\s*[·•◦]?\s*~[^\s\n]+/gi, '')
      .replace(/\bReturn only the greeting text\.?/gi, '')
      .replace(/\b(?:Waiting for\s+)?\w+\s*\[default\]\b/gi, '')
      .replace(/\s{2,}/g, ' ');

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
      // Codex garbled lines — ConPTY strips spaces, producing CamelCase word soup
      // e.g. "WelcometoCodex,OpenAI'scommand-linecodingagentSigninwithChatGPT..."
      if (/(?:WelcometoCodex|SigninwithChatGPT|SigninwithDeviceCode|ProvideyourownAPIkey|Stopandwaitforlimit)/i.test(t)) return false;
      // Lines that are pure rate-limit / quota chrome
      if (/session\s*limit.*reset|usage\s*limit.*reset|hit your limit|rate.limit.options/i.test(t)) return false;
      if (/you(?:'ve| have)\s*hit\s*your\s*usage\s*limit|purchase more credits|codex\/settings\/usage/i.test(t)) return false;
      if (/Tip:\s*New\s*Use\s*\/fast/i.test(t)) return false;
      if (/Tip:\s*New\s*Try\s*the\s*Codex\s*App/i.test(t)) return false;
      if (/chatgpt\.com\/codex\?app-landing-page=true/i.test(t)) return false;
      if (/run\s*\/review\s*on\s*my\s*current\s*changes/i.test(t)) return false;
      if (/\bAgent-B in parallel for greeting generation\b/i.test(t) && !/\b(?:Routing|Both)\b/.test(t)) return false;
      if (/Working\s*\(\d+s/i.test(t) && !/[.!?].{10,}/.test(t)) return false;
      if (/@filename/i.test(t) && !/\b(?:Routing|Both|Agent-[A-Z]|Hello|Ciao|Report|Results?|Saluto|Welcome)\b/.test(t)) return false;
      if (/\[default\]/i.test(t)) return false;
      if (/^You are the triage node\b/i.test(t)) return false;
      if (/^Route the incoming request to both Agent-A and Agent-B\b/i.test(t)) return false;
      if (/[>\u203A]\s*(?:You are the|When your work is complete|No extra text after that last handoff line)/i.test(t)) return false;
      // Echo marker / swarm protocol
      if (/END\s*SWARM\s*INPUT/i.test(t)) return false;
      if (/SWARM\s*PROTOCOL/i.test(t)) return false;
      if (/You\s*are\s*(?:a|the)\s+\w+\s*(?:agent|node)?\.?\s*You\s*(?:receive|will|must)/i.test(t)) return false;
      if (/must\s*be\s*a\s*valid\s*handoff\s*token/i.test(t)) return false;
      if (/in\s*place\s*of\s*<?\s*target/i.test(t)) return false;
      if (/You\s*are\s*the\s*FINAL\s*agent/i.test(t)) return false;
      if (/MUST\s*output\s*the\s*done\s*marker/i.test(t)) return false;
      if (/Do\s*real\s*work\s*before\s*deciding/i.test(t)) return false;
      if (/You\s*have\s*an\s*active\s*task\s*right\s*now/i.test(t)) return false;
      if (/no\s*downstream\s*handoffs?\s*exist/i.test(t)) return false;
      if (/in\s*this\s*EXACT\s*format/i.test(t)) return false;
      if (/mandatory\s*-?\s*never\s*skip/i.test(t)) return false;
      if (/forcedHandoff\s*:\s*(?:true|false)/i.test(t)) return false;
      if (/is\s*not\s*terminal\s*in\s*the\s*workflow/i.test(t)) return false;
      if (/MUST\s*emit\s*a\s*handoff\s*token/i.test(t)) return false;
      if (/required\s*downstream\s*target/i.test(t)) return false;
      if (/Do\s*not\s*emit\s*__DONE__\s*immediately/i.test(t)) return false;
      if (/CONCRETE\s*EXAMPLE\s*\(replace/i.test(t)) return false;
      if (/valid\s*target\s*IDs?\s*:/i.test(t)) return false;
      if (/context\s*update\s*:\s*a\s*flat\s*JSON/i.test(t)) return false;
      if (/workflow\s*(?:Name|Description|goal)\s*:/i.test(t)) return false;
      if (/current\s*(?:Task|workflow\s*context)\s*:/i.test(t)) return false;
      if (/\bgpt-[\w.-]+\b/i.test(t) && (/%\s*left/i.test(t) || /~[\\/]/.test(t))) return false;
      if (/^gpt-[\w.-]+\s+(?:high|medium|low)\b/i.test(t)) return false;
      if (/\[[^\]]+\]/.test(t) && /\b(?:Spawned|Closed|Completed\s*-|Waiting for \d+ agents|Finished waiting)\b/i.test(t)) return false;
      const shortAlphaFragments = t.match(/\b[A-Za-z]{1,2}\b/g) || [];
      const longAlphaWords = t.match(/\b[A-Za-z]{4,}\b/g) || [];
      const lettersOnly = t.replace(/[^A-Za-z]/g, '');
      if (lettersOnly.length >= 8 && longAlphaWords.length === 0 && shortAlphaFragments.length >= 6) return false;
      if (shortAlphaFragments.length >= 10 && longAlphaWords.length <= 1) return false;
      if (shortAlphaFragments.length >= 8 && longAlphaWords.length <= 2) return false;
      // ConPTY garbled fragments: dots/ellipsis scattered among short char runs
      // e.g. "in......ro Prpapatig...gtinatparar", "Thne.....erPro...cessing"
      const dotRuns = t.match(/[.…]{2,}/g) || [];
      const dotCharCount = dotRuns.reduce((s, r) => s + r.length, 0);
      if (dotCharCount > 0 && dotCharCount / t.length > 0.12) {
        const validWords = (t.match(/[A-Za-z\u00C0-\u00FF]{4,}/g) || [])
          .filter(w => !/^(.)\1{2,}$/i.test(w));  // exclude repeated chars like "aaaa"
        if (validWords.length < 2) return false;
      }
      // ConPTY scrambled text: mostly non-word characters mixed with letter fragments
      // that don't form recognizable words (ratio of valid 4+ letter words is very low)
      if (t.length > 15) {
        const validWords4 = (t.match(/[A-Za-z\u00C0-\u00FF]{4,}/g) || [])
          .filter(w => !/^(.)\1+$/i.test(w));
        const letterRatio = lettersOnly.length / t.length;
        // Mostly letters but almost no recognizable words → garbled
        if (letterRatio > 0.6 && validWords4.length === 0) return false;
      }
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

    // Strip leading garbled ConPTY fragments before first real sentence.
    // e.g. "gnanpa Ecco il paragrafo..." → "Ecco il paragrafo..."
    // e.g. "gi...ng Ecco il paragrafo..." → "Ecco il paragrafo..."
    // Pattern: one or more short garbled tokens (letters/dots) + space, before uppercase start
    text = text.replace(/^(?:[a-z\u00E0-\u00FF.…]{1,15}\s+)+(?=[A-Z\u00C0-\u00D6])/u, '');

    // Reflow ConPTY column-wraps: terminal output is hard-wrapped at the
    // column width, leaving literal `\n` chars mid-paragraph. Without this
    // step the chat panel renders broken lines like
    //   "Inoltre, il publisher si occupa\ndella formattazione finale".
    // We split on blank lines (real paragraph boundaries) and rejoin the
    // soft-wrapped lines inside each paragraph back into a single line so
    // the client's CSS can wrap them naturally.
    text = normalizeChatDisplayText(reflowParagraphs(text));
    text = text.replace(/^\.\s+/, '');

    // Repair ConPTY digit-letter fusion: "156metrieaIto48" → "156 metrieaIto 48"
    // Require 3+ letters to avoid breaking "v5", "m2", etc.
    text = text.replace(/(\d)([a-zA-Z\u00C0-\u00FF]{3,})/g, '$1 $2');
    text = text.replace(/([a-zA-Z\u00C0-\u00FF]{3,})(\d)/g, '$1 $2');

    // Some inline fallback payloads collapse to a single orchestration sentence
    // about future routing/handoff intent rather than user-meaningful output.
    if (
      /^Routing\b/i.test(text)
      && /\bhandoff token\b/i.test(text)
      && /\bthen I(?:['â€™]ll| will)\b/i.test(text)
    ) {
      text = '';
    }

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

    // Skip messages that are system prompt / orchestration echos
    // ConPTY often compresses these into a single long line, so line-level
    // filters miss them. Check the full message text instead.
    // Strong indicators — a SINGLE match means the whole message is protocol echo
    const STRONG_PROMPT_INDICATORS = [
      /SWARM\s*PROTOCOL/i,
      /Con\s*t\s*in\s*u\s*e\s*this\s*task/i,
      /Execute\s*the\s*workflow\s*goal/i,
      /mandatory\s*-?\s*never\s*skip/i,
      /Structured\s*handoff\s*sent/i,
      /node-\d+\.\s*(?:Id>|<?\s*target)/i,              // "node-2. Id>" or "node-2. <targetId>"
      /\bfor\s+this\s+workflow\b.*\bnode-\d+\b/i,        // "for this workflow...node-2"
      /\bnode-\d+\b.*\bfor\s+this\s+workflow\b/i,        // "node-2...for this workflow"
      /__HANDOFF__\s*:\s*<?\s*targetId\s*>?\s*:/i,       // handoff token template
      /hands?\s*off\s*to\s*(?:a|the|an)\s+\w+[\s\S]*?(?:who|that|which)\s+\w+/i, // "hands off to a Writer who creates..."
      /then\s+hands?\s*off\s*to\s*(?:a|the|an)\s+\w+/i,  // "then hands off to a Writer"
      /You\s*are\s*(?:a|an|the)\s+(?:\w+\s+){0,8}\w+\.\s*(?:Take|List|Find|Write|Create|Compose|Analyze|Research|Summarize|Identify|Generate|Produce|Craft|Prepare)/i, // full system prompt role + directive
      /is\s+not\s+the\s+end\s+of\s+the\s+workflow/i, // reinject: "is not the end of the workflow yet"
      /Do\s+not\s+stop\s+at\s+the\s+done\s+marker/i, // reinject
      /that\s+final\s+handoff\s+token\s+as\s+plain\s+text/i, // reinject
      /Replace\s+the\s+summary\s+value\s+with/i, // reinject
      /Keep\s+the\s+handoff\s+line\s+compact/i, // reinject
    ];
    if (STRONG_PROMPT_INDICATORS.some(p => p.test(text))) {
      buf.text = '';
      buf.firstChunkAt = 0;
      return;
    }

    // Weak indicators — need ≥2 matches to filter the message
    const SYSTEM_PROMPT_INDICATORS = [
      /You\s*are\s*(?:a|the|an)\s+(?:\w+\s+){0,8}\w+\.\s*You\s*(?:receive|will|must|should|are)/i,
      /You\s*are\s*(?:a|an|the)\s+(?:\w+\s+){0,8}\w+\.\s*(?:Take|List|Find|Write|Create|Compose|Analyze|Research|Summarize|Identify|Generate|Produce|Craft|Prepare|Your)/i,
      /must\s*be\s*a\s*valid\s*handoff\s*token/i,
      /in\s*place\s*of\s*<?\s*target\s*I?d?\s*>?/i,
      /in\s*this\s*EXACT\s*format/i,
      /You\s*are\s*the\s*FINAL\s*agent/i,
      /MUST\s*output\s*the\s*done\s*marker/i,
      /no\s*downstream\s*handoffs?\s*exist/i,
      /workflow\s*(?:Name|Description)\s*:/i,
      /current\s*(?:Task|workflow\s*context)\s*:/i,
      /is\s*not\s*terminal\s*in\s*the\s*workflow/i,
      /MUST\s*emit\s*a\s*handoff\s*token/i,
      /forcedHandoff\s*:\s*(?:true|false)/i,
      /required\s*downstream\s*target/i,
      /hands?\s*off\s*to\s*(?:a|the|an)\s+\w+\s*(?:agent)?/i,
      /Do\s*not\s*emit\s*__DONE__\s*immediately/i,
      /(?:two|three|multi)-?\s*agent\s+workflow/i,
      /workflow\s+where\s+(?:a|the|an)\s+\w+/i,
      /Keep\s*it\s*concise\s*and\s*reader-?\s*friendly/i,
    ];
    const promptScore = SYSTEM_PROMPT_INDICATORS.filter(p => p.test(text)).length;
    if (promptScore >= 2) {
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

    // Semantic prompt echo check: if the message's words are predominantly
    // from the registered system prompt, it's not real agent output.
    if (this._isPromptEcho(nodeId, text)) {
      buf.text = '';
      buf.firstChunkAt = 0;
      return;
    }

    // Keep normal messages, but also allow short human-readable replies
    // such as greetings that would otherwise disappear from the Chat view.
    const shouldEmit = shouldEmitChatMessage(text);
    if (shouldEmit) {
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
    // Flush any remaining buffered text before clearing — only buffers
    // belonging to this execution, so concurrent executions are not affected.
    const prefix = `${executionId}:`;
    for (const [bufKey, buf] of this._buffers.entries()) {
      if (!bufKey.startsWith(prefix)) continue;
      if (buf.timer) clearTimeout(buf.timer);
      if (buf.periodicTimer) clearInterval(buf.periodicTimer);
      // Extract nodeId from compound key for the flush callback
      const nodeId = bufKey.slice(prefix.length);
      // Force a final flush so the text makes it into chatMessages
      if (buf.text && buf.text.trim()) {
        this._flush(buf.executionId || executionId, nodeId, bufKey);
      }
      this._buffers.delete(bufKey);
    }
  }

  /**
   * Flush and clean a specific node.
   */
  cleanupNode(executionId, nodeId) {
    const bufKey = `${executionId}:${nodeId}`;
    const buf = this._buffers.get(bufKey);
    if (buf) {
      this._flush(executionId, nodeId, bufKey);
      if (buf.timer) clearTimeout(buf.timer);
      if (buf.periodicTimer) clearInterval(buf.periodicTimer);
      this._buffers.delete(bufKey);
    }
  }
}
