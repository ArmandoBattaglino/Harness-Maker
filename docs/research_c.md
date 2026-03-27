# Research C: Claude CLI PTY Live Injection

## Question

When Claude Code CLI is actively processing a task (generating output), what happens if new text is written to its PTY stdin? Does it (a) interrupt the current task and process the new input immediately, (b) queue the input for after the current response completes, or (c) cause undefined/dropped behavior? Are there documented patterns for "supervisor injection" into a running Claude Code session? Is there a reliable way to interrupt and redirect a Claude Code session programmatically?

---

## Findings

### 1. Mid-Execution Input Behavior: Queuing, Not Interruption

According to official Claude Code documentation and confirmed by GitHub issue #36326 (Claude Code v2.1.79, March 2026), the actual behavior when text is typed or injected while Claude Code is actively executing tools is:

- The new input is **queued** — it appears in the UI as a "queued message"
- Claude Code **continues its current task uninterrupted**
- The queued message is only processed **after** Ctrl+C is sent to stop the current task
- This contradicts the official docs which state "just type your correction and press Enter" to interrupt — that documentation is incorrect as of 2026

**Summary of input states:**
| Input method | During active execution | Result |
|---|---|---|
| Type text + Enter | Claude is mid-task | Input queued, task continues |
| Ctrl+C | Claude is mid-task | Interrupts task (unreliably — see below) |
| Ctrl+C then Enter | Sequential | Task stops, queued message processed |
| Programmatic `\r` or `\n` via PTY | Claude is mid-task | Newline inserted, NOT submitted |

### 2. Ctrl+C Interrupt: Unreliable in Practice

From GitHub issue #3455 and #17466:
- Ctrl+C sends a visual "interrupted" feedback to the terminal
- However, the agent **often ignores the signal** and continues executing, especially during active tool calls
- The interrupt detection works (keypress is registered), but propagation to the running agent process is broken
- Users must sometimes double Ctrl+C to forcefully kill, losing context
- Issue #3455 was closed as "COMPLETED" suggesting a fix was attempted, but #17466 (ESC and Ctrl+C fail during active tool calls) remains open

**The Ctrl+C injection pattern:**
- Write `\x03` (ASCII ETX = Ctrl+C) to the PTY → Claude may or may not stop
- Behavior is not guaranteed — depends on what Claude Code is doing at the moment
- Tool call phase: less reliable interruption
- Between tool calls (pure generation phase): more reliable

### 3. The Core Problem: Ink Library Input Handling

Root cause documented in GitHub issue #15553:

Claude Code uses the **Ink** library (React for terminals) with `ink-text-input` for its prompt. This component distinguishes between:
- Physical keyboard Enter keypress → `onSubmit` callback → prompt processed
- Programmatic `\r` or `\n` via stdin → treated as literal newline character → **NOT submitted**

This means **standard PTY injection (`pty.write("my message\r")`) does NOT trigger prompt submission**. The Enter character is handled differently by Ink's input component when it arrives via programmatic stdin vs. physical keyboard.

**Confirmed failing approaches (all produce newline, not submit):**
- `terminal.sendText(text, true)` (VS Code)
- `tmux send-keys ... Enter`
- Writing `\r`, `\n`, `\x0d`, `\x0a`, `\u000D`, `\u000A` programmatically

### 4. The One Workaround That Works: Escape + Delay + Enter (tmux pattern)

From issue #15553 community findings, the only reliable programmatic injection pattern for interactive Claude Code is:

```bash
# Step 1: Write the text to PTY
pty.write("supervisor message text")
# Step 2: Wait 300ms (let Ink process the text)
await sleep(300)
# Step 3: Send Escape (dismisses autocomplete overlay)
pty.write("\x1b")
# Step 4: Wait 100ms
await sleep(100)
# Step 5: Send Enter
pty.write("\r")
```

**Why it works:** Escape dismisses Ink's autocomplete suggestion overlay, putting the cursor in a "clean" input state where the subsequent Enter is treated as submission rather than newline insertion. Total added latency: ~400ms per injection.

### 5. Headless Mode (`--print` / `-p`) as an Alternative

For programmatic supervisor injection, the `--print` flag launches Claude Code in a completely different mode:
- Non-interactive: accepts a single prompt via stdin or argument, runs it, exits
- No REPL, no Ink UI, no input queuing issues
- Fully scriptable: `claude --print "your message"` or `echo "message" | claude -p`
- Supports `--output-format json` for structured output
- Supports `--resume <session-id>` to continue a prior conversation

**Limitation:** `--print` exits after each response. It does not maintain a live interactive session. For the Swarm Orchestrator where agents run continuously, this mode is suitable for "fire and forget" sub-tasks but not for an agent that must run indefinitely and receive mid-task steering.

### 6. Agent Teams Multi-Agent Pattern (Official Anthropic Approach)

From issue #29293, Anthropic's own Agent Teams feature (experimental) uses `--agent-*` flags internally, which themselves trigger `--print` mode. The recommended pattern for agent-to-agent communication is a **mailbox/file system** handoff, not direct PTY stdin injection. The spawning mechanism must:
- Pipe the initial prompt to stdin of the subprocess at spawn time, OR
- Use a mailbox file that the subprocess polls

This is the closest thing to an officially sanctioned "supervisor injection" pattern.

---

## Key Takeaways

- **What Ctrl+C does to a running Claude Code session:** Sends SIGINT which shows visual feedback but does NOT reliably interrupt during tool execution phases. Between tool calls (generation phase only) it is more reliable. Always unreliable when injected programmatically — timing-dependent.

- **Whether mid-response input is handled, queued, or dropped:** Input is **queued**, not dropped. Text typed during execution appears as a pending message but is only processed after the current task is interrupted with Ctrl+C. Programmatic `\r`/`\n` via PTY do NOT trigger submission — they insert newlines.

- **Best pattern for "supervisor redirects an agent mid-task":** The only reliable pattern is: (1) write `\x03` (Ctrl+C) to interrupt, (2) wait 200-400ms for the interrupt to register and task to stop, (3) write the new message text, (4) send Escape, wait 100ms, send Enter. Total latency: ~500-700ms. Interruption is not guaranteed during active tool calls.

- **Implications for department broadcast feature:** A broadcast to all agents in a department must account for (a) each agent being in a different execution phase, (b) the need to send Ctrl+C first to interrupt, (c) the 400ms+ delay before input can be submitted, and (d) the fact that interruption during tool calls is unreliable. A "best effort" interrupt-then-write pattern is the only option short of process termination.

---

## Implications for This Project

### BroadcastService Implementation

The safest architecture for broadcasting to all agents simultaneously:

1. **Do NOT rely on mid-task text injection being acknowledged immediately.** Assume the agent will finish its current tool call first.

2. **Interrupt sequence per agent PTY:**
   ```
   sessionManager.writeInput(sessionId, "\x03")   // Ctrl+C
   await sleep(300)                                 // wait for task to yield
   sessionManager.writeInput(sessionId, broadcastText)
   await sleep(300)
   sessionManager.writeInput(sessionId, "\x1b")    // Escape (dismiss autocomplete)
   await sleep(100)
   sessionManager.writeInput(sessionId, "\r")      // Enter
   ```

3. **Broadcast must be fire-and-forget with a timeout.** If an agent does not respond within 2-3 seconds of injection, it is likely in a deep tool call and the interrupt failed. Log this and move on — do not block the broadcast loop.

4. **Consider a "soft broadcast" vs. "hard broadcast" distinction:**
   - Soft: write text + Enter without Ctrl+C, relying on queuing. Agent processes it after its current task finishes naturally.
   - Hard: Ctrl+C first, then inject. More disruptive, more likely to be processed immediately.

### Chat-with-Agent Feature (Single Agent Mid-Execution)

For the user typing in a PTY terminal (the "PTY explosion" mode where a full xterm.js is open to the agent), the behavior is the same as a human using the terminal — the user's keystrokes go directly into the PTY. This works naturally because physical keyboard input IS handled by Ink correctly (physical Enter = submit). No special injection logic is needed for this mode.

For the "send a message to a specific agent" panel (non-PTY injection from a chat UI):
- Use the Escape + delay + Enter pattern described above
- Expose a "interrupt and redirect" button in the UI that sends Ctrl+C first, then the message
- Make the latency visible to the user ("Interrupting agent...") so the 500-700ms pause is not perceived as a bug

### Preferred Architecture: Hybrid --print + Interactive

For agents that need to be "steerable" by a supervisor, consider spawning them in `--print` mode for each task unit and chaining via `--resume <session-id>`. This avoids all PTY injection complexity entirely:
- Supervisor sends next task as a new `--print` invocation
- Session continuity is maintained via `--resume`
- No Ink input quirks, no Ctrl+C races
- Downside: agent loses live streaming output during tool execution (output only after task completes)

For agents that must show live streaming output (the PTY terminal view), the interrupt-then-inject pattern above is the only option.

---

## Sources

- [Claude Code Interactive Mode Docs (official)](https://code.claude.com/docs/en/interactive-mode)
- [BUG: Docs say Enter interrupts mid-task, but it only queues the message — Issue #36326](https://github.com/anthropics/claude-code/issues/36326)
- [FEATURE: Programmatic Input Submission in Interactive Mode — Issue #15553](https://github.com/anthropics/claude-code/issues/15553)
- [Interrupt signals (Escape and Ctrl+C) show feedback but don't stop agent execution — Issue #3455](https://github.com/anthropics/claude-code/issues/3455)
- [ESC and Ctrl+C fail to interrupt during active tool calls — Issue #17466](https://github.com/anthropics/claude-code/issues/17466)
- [Agent Teams: Teammates fail to spawn — Issue #29293](https://github.com/anthropics/claude-code/issues/29293)
- [CLI reference (--print flag)](https://code.claude.com/docs/en/cli-reference)
- [DeepWiki: Claude Code CLI Commands and Interaction Modes](https://deepwiki.com/anthropics/claude-code/2.3-cli-commands-and-interaction-modes)
- [FEATURE: Allow piping input to pre-populate interactive session — Issue #6009](https://github.com/anthropics/claude-code/issues/6009)
