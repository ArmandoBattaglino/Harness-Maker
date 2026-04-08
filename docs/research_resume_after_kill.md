# Research: Resume After Process Kill

## Question

If a Claude CLI process spawned with `-p --output-format stream-json --session-id <uuid>` is killed mid-stream (SIGTERM/SIGKILL), does the session state persist? Can you resume with `--resume <uuid>` after a kill? What state is preserved -- full conversation history, partial response, or nothing? Does the CLI write session state incrementally or only on clean exit?

## Findings (detailed)

### Session Storage Mechanism

Claude Code stores sessions as JSONL (line-delimited JSON) files at `~/.claude/projects/<hashed-cwd>/<session-id>.jsonl`. Each conversation message (user, assistant, tool_use, tool_result, system) is appended as a separate JSON line. This is an **incremental append model** -- each message is written to disk as it completes, not batched at session end.

### What Happens on Process Kill

When a Claude CLI process is killed mid-stream, the JSONL file is left in an **incomplete but syntactically valid** state. Each line that was fully written parses independently. However, the conversation state is **semantically inconsistent**: the final turn is missing its closing markers (`stop_hook_summary`, `turn_duration`), and critically, if the kill happened during tool execution, there will be a `tool_use` block without a corresponding `tool_result` block.

**Clean exit pattern:**
```
assistant -> tool_use -> tool_result -> stop_hook_summary -> turn_duration
```

**Killed mid-tool pattern:**
```
assistant -> tool_use -> [EOF, no tool_result]
```

### Resume After Kill: BROKEN

Attempting `claude --resume <session-id>` after a forced kill **crashes or hangs**:

1. **Crash case (issue #18880):** The resume loader encounters the orphaned tool_use without tool_result and throws `Error: No messages returned`. Simply deleting the trailing incomplete lines does NOT fix it -- the loader performs additional state validation.

2. **Hang case (issue #24478):** Resume hangs indefinitely on "Resuming conversation..." and never recovers, suggesting the serialized session data itself triggers the hang.

3. **API rejection:** The Anthropic API returns HTTP 400 when conversation history contains a tool_use block without a matching tool_result (150+ reports per issue #6836). This is a fundamental protocol constraint -- the API enforces strict message pairing.

### SIGTERM vs SIGKILL

Claude CLI has a **known signal handling gap during tool execution** (issue #17466). During active tool calls:
- SIGINT (Ctrl+C) is often **ignored** -- the Bash subprocess blocks signal propagation
- SIGTERM may not trigger graceful cleanup
- Only SIGKILL reliably terminates the process

This means there is no practical difference between SIGTERM and SIGKILL for session integrity -- neither produces a clean session file when the process is mid-tool-execution.

### Partial Responses

Streaming text that was in-flight at the time of kill is **lost**. The JSONL file only contains messages that were fully committed before the kill. Partial assistant text blocks (mid-generation) are not persisted.

### No Recovery Mechanism Exists (Yet)

Issue #26729 proposes a three-layer streaming resilience system (stream watchdog, recovery snapshots, auto-resume with synthetic tool_results), but this is a **feature request, not implemented**. Currently there is no built-in crash recovery, no write-ahead log, no checkpoint system, and no `--resume --force` flag.

## Key Takeaways

1. **Session JSONL is written incrementally** (per-message append), so completed turns ARE preserved after a kill.
2. **Resume after kill is BROKEN** when the kill happens mid-turn -- orphaned tool_use blocks corrupt the session for the API.
3. **Partial/streaming responses are LOST** -- only fully committed messages survive.
4. **SIGTERM offers no advantage over SIGKILL** -- signal handlers are blocked during tool execution.
5. **The only reliable resume path** is when the process was killed BETWEEN turns (after a complete message exchange), not during one.

## Implications for This Project

### For SwarmEngine stream-json migration (DEC-027):

1. **Session persistence IS viable for between-turn kills.** If we kill the stream-json process after the `result` event (DEC-029), the session JSONL will be in a clean state and `--resume` will work. This is the normal "stop" case.

2. **Mid-stream kills require session repair.** If a user hits "stop" while the agent is mid-generation, the session will be left in a broken state. We MUST either:
   - (a) Wait for the current turn to complete before killing (graceful stop = wait for `result` event, then don't spawn next turn), OR
   - (b) Accept that a mid-stream kill corrupts the session and implement our own repair logic (inject synthetic tool_result into the JSONL before resuming), OR
   - (c) Track the "last clean session state" ourselves and truncate the JSONL on resume.

3. **"Reset" (kill + save history) needs careful handling.** If we kill mid-stream for a reset, the history we save will include an incomplete final turn. We should truncate to the last complete turn before archiving.

4. **Process lifecycle design:** The safest pattern is:
   - **Stop (graceful):** Set a flag "do not spawn next turn." Let the current turn finish naturally (wait for `result` event + process exit). Session is clean. Resume works.
   - **Stop (forced):** SIGKILL the process. Mark session as "needs repair." On next resume, truncate JSONL to last complete turn before calling `--resume`.
   - **Reset:** SIGKILL, archive truncated history, start fresh session.

5. **tree-kill (DEC-006) is still required** -- SIGTERM alone may not terminate the process during tool execution.

6. **Issue #25629 caveat:** The CLI sometimes hangs AFTER sending the result event in stream-json mode (stdout stays open, process does not exit). This means even waiting for the result event is not a 100% guarantee of clean exit -- a timeout + forced kill fallback is still needed after the result event.

## Sources

- [claude --resume crashes on killed sessions (GitHub #18880)](https://github.com/anthropics/claude-code/issues/18880)
- [CLI freezes, SIGKILL required (GitHub #24478)](https://github.com/anthropics/claude-code/issues/24478)
- [Streaming Resilience feature request (GitHub #26729)](https://github.com/anthropics/claude-code/issues/26729)
- [ESC/Ctrl+C fail during tool calls (GitHub #17466)](https://github.com/anthropics/claude-code/issues/17466)
- [Session Persistence wiki (ruvnet/ruflo)](https://github.com/ruvnet/ruflo/wiki/session-persistence)
- [Claude Code Session Management (Steve Kinney)](https://stevekinney.com/courses/ai-development/claude-code-session-management)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Session storage feature request (GitHub #22387)](https://github.com/anthropics/claude-code/issues/22387)
- [Corrupted session JSONL recovery (paperclipai #2358)](https://github.com/paperclipai/paperclip/issues/2358)
- [CLI hangs after result event in stream-json (GitHub #25629)](https://github.com/anthropics/claude-code/issues/25629)

## Caveats

- The JSONL write timing is inferred from observed behavior in bug reports, not from official documentation or source code inspection. The exact flush/fsync behavior is undocumented.
- Issue #25629 reports that the CLI sometimes hangs AFTER sending the result event in stream-json mode. A timeout + forced kill fallback is still needed.
- These findings are based on Claude Code as of early 2026. The streaming resilience proposal (#26729) could change this behavior if implemented.
