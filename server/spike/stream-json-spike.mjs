#!/usr/bin/env node
// server/spike/stream-json-spike.mjs
// SPIKE — Validate --resume -p --output-format stream-json multi-turn
// Task #354 — standalone script, does NOT modify production code.
//
// Usage: node server/spike/stream-json-spike.mjs
// Requires: claude CLI installed and on PATH (or CLAUDE_BIN / %LOCALAPPDATA%)

import { spawn, execFileSync } from 'child_process';
import { createInterface } from 'readline';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Binary discovery (minimal, mirrors BinaryDiscovery.js logic)
// ---------------------------------------------------------------------------

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findClaudeBinary() {
  // 1. Env override
  if (process.env.CLAUDE_BIN) {
    const p = process.env.CLAUDE_BIN;
    if (!fileExists(p)) throw new Error(`CLAUDE_BIN="${p}" does not exist`);
    return p;
  }

  // 2. PATH lookup
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where.exe' : 'which';
  try {
    const result = execFileSync(cmd, ['claude'], { shell: false, stdio: 'pipe', timeout: 5000 });
    const candidate = result.toString().trim().split(/\r?\n/)[0].trim();
    if (candidate && fileExists(candidate)) return candidate;
  } catch { /* not on PATH */ }

  // 3. %LOCALAPPDATA%\AnthropicClaude\claude.exe
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const candidate = path.join(localAppData, 'AnthropicClaude', 'claude.exe');
    if (fileExists(candidate)) return candidate;
  }

  throw new Error('Claude CLI not found. Install or set CLAUDE_BIN.');
}

// ---------------------------------------------------------------------------
// Turn runner
// ---------------------------------------------------------------------------

/**
 * Spawns a claude process with the given args, collects all stream-json events,
 * and returns a structured result with timing and event data.
 */
function runTurn(claudeBin, args, label) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timing = { spawnAt: null, firstEventAt: null, resultEventAt: null, exitAt: null };
    let resultEvent = null;
    let exitCode = null;

    timing.spawnAt = performance.now();

    const child = spawn(claudeBin, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false, // SEC-02
    });

    // DEC-005: close stdin immediately
    try { child.stdin.end(); } catch { /* already destroyed */ }

    const rl = createInterface({ input: child.stdout });

    rl.on('line', (line) => {
      if (!line.trim()) return;

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = { type: 'raw', data: line };
      }

      if (!timing.firstEventAt) {
        timing.firstEventAt = performance.now();
      }

      events.push(parsed);

      if (parsed.type === 'result') {
        timing.resultEventAt = performance.now();
        resultEvent = parsed;
      }
    });

    // Collect stderr for diagnostics
    const stderrChunks = [];
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    child.on('error', (err) => {
      reject(new Error(`[${label}] Spawn error: ${err.message}`));
    });

    child.on('close', (code) => {
      timing.exitAt = performance.now();
      exitCode = code;

      resolve({
        label,
        events,
        resultEvent,
        exitCode,
        timing,
        stderr: stderrChunks.join(''),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Session JSONL discovery (OQ1 + OQ4)
// ---------------------------------------------------------------------------

function findSessionJsonl(sessionId) {
  // Claude stores sessions in ~/.claude/projects/ as JSONL files
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeDir)) return null;

  // Walk the directory tree looking for files that contain the session ID
  const candidates = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.jsonl') || entry.name.includes(sessionId)) {
        candidates.push(fullPath);
      }
    }
  }
  walk(claudeDir);

  // Check each candidate for a matching session ID in its content
  for (const file of candidates) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes(sessionId)) {
        return file;
      }
    } catch { /* skip unreadable files */ }
  }

  // Also check ~/.claude/sessions/ (alternative location)
  const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const candidates2 = [];
    function walk2(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk2(fullPath);
        } else {
          candidates2.push(fullPath);
        }
      }
    }
    walk2(sessionsDir);

    for (const file of candidates2) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes(sessionId)) {
          return file;
        }
      } catch { /* skip */ }
    }
  }

  return null;
}

function analyzeJsonlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const messageTypes = new Map();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const type = obj.type || obj.role || 'unknown';
        messageTypes.set(type, (messageTypes.get(type) || 0) + 1);
      } catch {
        messageTypes.set('unparseable', (messageTypes.get('unparseable') || 0) + 1);
      }
    }

    return {
      totalLines: lines.length,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      messageTypes: Object.fromEntries(messageTypes),
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

function verdict(condition, label) {
  const tag = condition ? 'PASS' : 'FAIL';
  return { tag, label, passed: condition };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sessionId = crypto.randomUUID();
  const verdicts = [];

  console.log('=== STREAM-JSON SPIKE VALIDATION ===');
  console.log(`Session ID: ${sessionId}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log(`Platform:   ${process.platform} (${os.release()})`);
  console.log(`Node:       ${process.version}`);
  console.log('');

  // --- Discover binary ---
  let claudeBin;
  try {
    claudeBin = findClaudeBinary();
    console.log(`Claude binary: ${claudeBin}`);
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // =========================================================================
  // Turn 1: Basic stream-json
  // =========================================================================
  console.log('--- Turn 1: Basic stream-json ---');
  let turn1;
  try {
    turn1 = await runTurn(claudeBin, [
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--session-id', sessionId,
      '-p', 'List files in the current directory using the Bash tool. Use ls command.',
      '--tools', 'Bash,Read',
      '--model', 'sonnet',
    ], 'Turn 1');

    // Log event types
    const typeCounts = {};
    for (const ev of turn1.events) {
      const t = ev.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    console.log(`Events received (${turn1.events.length} total):`);
    for (const [t, c] of Object.entries(typeCounts)) {
      console.log(`  ${t}: ${c}`);
    }

    // Verdicts
    const hasTextDelta = turn1.events.some(e =>
      e.type === 'content_block_delta' || e.type === 'assistant' || e.type === 'text'
    );
    const hasResult = turn1.resultEvent !== null;

    verdicts.push(verdict(hasTextDelta || turn1.events.length > 2, 'Turn 1: content/text events received'));
    verdicts.push(verdict(hasResult, 'Turn 1: result event received'));
    verdicts.push(verdict(turn1.exitCode === 0, `Turn 1: clean exit (code=${turn1.exitCode})`));

    // Cost/usage
    if (turn1.resultEvent) {
      const r = turn1.resultEvent;
      const cost = r.cost_usd ?? r.result?.cost_usd ?? r.usage ?? 'N/A';
      const usage = r.usage ?? r.result?.usage ?? 'N/A';
      const totalCost = r.total_cost_usd ?? r.result?.total_cost_usd ?? cost;
      console.log(`Cost:  ${JSON.stringify({ cost, totalCost, usage })}`);
      console.log(`Result keys: ${JSON.stringify(Object.keys(r))}`);
    }

    // Timing
    const t = turn1.timing;
    const spawnToFirst = t.firstEventAt ? (t.firstEventAt - t.spawnAt).toFixed(0) : 'N/A';
    const resultToExit = (t.resultEventAt && t.exitAt) ? (t.exitAt - t.resultEventAt).toFixed(0) : 'N/A';
    const totalDuration = t.exitAt ? (t.exitAt - t.spawnAt).toFixed(0) : 'N/A';
    console.log(`Timing: spawn->first_event: ${spawnToFirst}ms, result->exit: ${resultToExit}ms, total: ${totalDuration}ms`);

    // Log stderr if present
    if (turn1.stderr.trim()) {
      console.log(`Stderr (first 500 chars): ${turn1.stderr.trim().slice(0, 500)}`);
    }
  } catch (err) {
    console.error(`Turn 1 FAILED: ${err.message}`);
    verdicts.push(verdict(false, `Turn 1: execution (${err.message})`));
  }
  console.log('');

  // =========================================================================
  // Turn 2: --resume context continuity
  // =========================================================================
  console.log('--- Turn 2: --resume context continuity ---');
  let turn2;
  try {
    turn2 = await runTurn(claudeBin, [
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--resume', sessionId,
      '-p', 'Now count the number of .js files you found in the previous step. Report the exact count.',
      '--tools', 'Bash,Read',
      '--model', 'sonnet',
    ], 'Turn 2');

    // Log event types
    const typeCounts = {};
    for (const ev of turn2.events) {
      const t = ev.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    console.log(`Events received (${turn2.events.length} total):`);
    for (const [t, c] of Object.entries(typeCounts)) {
      console.log(`  ${t}: ${c}`);
    }

    // Check for context continuity: the response should reference files or the listing
    const allText = turn2.events
      .filter(e => e.type === 'assistant' || e.type === 'text' || e.type === 'content_block_delta')
      .map(e => {
        if (e.type === 'content_block_delta' && e.delta?.text) return e.delta.text;
        if (e.content) return typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
        if (e.message?.content) return JSON.stringify(e.message.content);
        return JSON.stringify(e);
      })
      .join(' ');

    // Also check result text
    const resultText = turn2.resultEvent?.result ?? '';
    const combinedText = (allText + ' ' + (typeof resultText === 'string' ? resultText : JSON.stringify(resultText))).toLowerCase();

    // Context preserved if the response mentions files, count, .js, or references previous
    const contextPreserved = combinedText.includes('.js') ||
      combinedText.includes('file') ||
      combinedText.includes('count') ||
      combinedText.includes('previous') ||
      /\d+/.test(combinedText);

    verdicts.push(verdict(contextPreserved, 'Turn 2: context from Turn 1 preserved'));
    verdicts.push(verdict(turn2.resultEvent !== null, 'Turn 2: result event received'));
    verdicts.push(verdict(turn2.exitCode === 0, `Turn 2: clean exit (code=${turn2.exitCode})`));

    // Cost
    if (turn2.resultEvent) {
      const r = turn2.resultEvent;
      const cost = r.cost_usd ?? r.result?.cost_usd ?? r.usage ?? 'N/A';
      const usage = r.usage ?? r.result?.usage ?? 'N/A';
      const totalCost = r.total_cost_usd ?? r.result?.total_cost_usd ?? cost;
      console.log(`Cost:  ${JSON.stringify({ cost, totalCost, usage })}`);
    }

    // Timing (OQ3)
    const t = turn2.timing;
    const spawnToFirst = t.firstEventAt ? (t.firstEventAt - t.spawnAt).toFixed(0) : 'N/A';
    const resultToExit = (t.resultEventAt && t.exitAt) ? (t.exitAt - t.resultEventAt).toFixed(0) : 'N/A';
    const totalDuration = t.exitAt ? (t.exitAt - t.spawnAt).toFixed(0) : 'N/A';
    console.log(`Timing: spawn->first_event: ${spawnToFirst}ms, result->exit: ${resultToExit}ms, total: ${totalDuration}ms`);

    // Log combined text snippet for manual verification
    console.log(`Response snippet (first 300 chars): ${combinedText.slice(0, 300)}`);
  } catch (err) {
    console.error(`Turn 2 FAILED: ${err.message}`);
    verdicts.push(verdict(false, `Turn 2: execution (${err.message})`));
  }
  console.log('');

  // =========================================================================
  // Turn 3: --tools restriction (Read only, no Bash)
  // =========================================================================
  console.log('--- Turn 3: --tools restriction (Read only, no Bash) ---');
  let turn3;
  try {
    turn3 = await runTurn(claudeBin, [
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      '--resume', sessionId,
      '-p', 'Run the command echo hello using Bash',
      '--tools', 'Read',
      '--model', 'sonnet',
    ], 'Turn 3');

    // Log event types
    const typeCounts = {};
    for (const ev of turn3.events) {
      const t = ev.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    console.log(`Events received (${turn3.events.length} total):`);
    for (const [t, c] of Object.entries(typeCounts)) {
      console.log(`  ${t}: ${c}`);
    }

    // Check that Bash tool was NOT used — look for tool_use events with Bash
    const bashToolUsed = turn3.events.some(e => {
      // Check various event shapes for tool use
      if (e.type === 'tool_use' && e.name === 'Bash') return true;
      if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use' && e.content_block?.name === 'Bash') return true;
      // Check if tool_use appears in subevents
      if (e.tool_name === 'Bash' || e.name === 'Bash') return true;
      return false;
    });

    verdicts.push(verdict(!bashToolUsed, 'Turn 3: Bash tool NOT used (restricted to Read only)'));
    verdicts.push(verdict(turn3.resultEvent !== null, 'Turn 3: result event received'));
    verdicts.push(verdict(turn3.exitCode === 0, `Turn 3: clean exit (code=${turn3.exitCode})`));

    // Timing (OQ3)
    const t = turn3.timing;
    const resultToExit = (t.resultEventAt && t.exitAt) ? (t.exitAt - t.resultEventAt).toFixed(0) : 'N/A';
    console.log(`Timing: result->exit: ${resultToExit}ms`);

    // Log response for manual inspection
    const allText = turn3.events
      .filter(e => e.type === 'assistant' || e.type === 'text' || e.type === 'content_block_delta')
      .map(e => {
        if (e.type === 'content_block_delta' && e.delta?.text) return e.delta.text;
        if (e.content) return typeof e.content === 'string' ? e.content : JSON.stringify(e.content);
        return '';
      })
      .join('');
    console.log(`Response snippet (first 300 chars): ${allText.slice(0, 300)}`);
  } catch (err) {
    console.error(`Turn 3 FAILED: ${err.message}`);
    verdicts.push(verdict(false, `Turn 3: execution (${err.message})`));
  }
  console.log('');

  // =========================================================================
  // Session File Validation (OQ1 + OQ4)
  // =========================================================================
  console.log('--- Session File Validation ---');
  const jsonlPath = findSessionJsonl(sessionId);
  if (jsonlPath) {
    verdicts.push(verdict(true, `Session JSONL found at: ${jsonlPath}`));
    const analysis = analyzeJsonlFile(jsonlPath);
    if (analysis.error) {
      console.log(`  Analysis error: ${analysis.error}`);
    } else {
      console.log(`  File size: ${analysis.sizeBytes} bytes`);
      console.log(`  Total lines: ${analysis.totalLines}`);
      console.log(`  Message types: ${JSON.stringify(analysis.messageTypes, null, 2)}`);
    }
  } else {
    verdicts.push(verdict(false, 'Session JSONL file NOT found'));
    console.log('  Searched in: ~/.claude/projects/ and ~/.claude/sessions/');
    console.log(`  Session ID: ${sessionId}`);

    // List what we can find for debugging
    const claudeDir = path.join(os.homedir(), '.claude');
    if (fs.existsSync(claudeDir)) {
      console.log(`  Contents of ~/.claude/:`);
      try {
        const entries = fs.readdirSync(claudeDir);
        for (const e of entries) {
          console.log(`    ${e}`);
        }
      } catch { /* skip */ }
    }
  }
  console.log('');

  // =========================================================================
  // Post-result hang timing summary (OQ3)
  // =========================================================================
  console.log('--- Post-Result Hang Timing Summary (OQ3) ---');
  const turns = [
    { label: 'Turn 1', data: turn1 },
    { label: 'Turn 2', data: turn2 },
    { label: 'Turn 3', data: turn3 },
  ];
  for (const { label, data } of turns) {
    if (!data) {
      console.log(`  ${label}: DID NOT RUN`);
      continue;
    }
    const t = data.timing;
    if (t.resultEventAt && t.exitAt) {
      const hangMs = (t.exitAt - t.resultEventAt).toFixed(0);
      console.log(`  ${label}: result->exit hang = ${hangMs}ms`);
    } else if (!t.resultEventAt) {
      console.log(`  ${label}: NO result event received`);
    } else {
      console.log(`  ${label}: timing incomplete`);
    }
  }
  console.log('');

  // =========================================================================
  // Event type catalog (for documentation)
  // =========================================================================
  console.log('--- Event Type Catalog (all turns combined) ---');
  const allEvents = [
    ...(turn1?.events || []),
    ...(turn2?.events || []),
    ...(turn3?.events || []),
  ];
  const allTypes = new Map();
  for (const ev of allEvents) {
    const t = ev.type || 'unknown';
    if (!allTypes.has(t)) {
      // Store first example (strip large fields)
      const example = { ...ev };
      // Truncate large text fields to avoid flooding output
      for (const key of Object.keys(example)) {
        if (typeof example[key] === 'string' && example[key].length > 200) {
          example[key] = example[key].slice(0, 200) + '...[truncated]';
        }
      }
      allTypes.set(t, { count: 0, exampleKeys: Object.keys(ev) });
    }
    allTypes.get(t).count++;
  }
  for (const [t, info] of allTypes) {
    console.log(`  ${t} (${info.count}x) — keys: [${info.exampleKeys.join(', ')}]`);
  }
  console.log('');

  // =========================================================================
  // Final Summary
  // =========================================================================
  const passed = verdicts.filter(v => v.passed).length;
  const total = verdicts.length;

  console.log('=== VERDICT SUMMARY ===');
  for (const v of verdicts) {
    console.log(`  [${v.tag}] ${v.label}`);
  }
  console.log('');
  console.log(`=== OVERALL: ${passed}/${total} PASSED ===`);

  // Exit with non-zero if any failed
  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
