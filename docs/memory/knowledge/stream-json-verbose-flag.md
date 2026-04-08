---
topic: Claude CLI stream-json requires --verbose with -p
source: qa-tester
date: 2026-04-08
relevant_to: backend-dev, architect, debugger
---

# Claude CLI stream-json requires --verbose with -p (print mode)

## Context
Discovered during Task #355 (TEST GATE — Spike Validation). The spike script at server/spike/stream-json-spike.mjs was spawning claude with `--output-format stream-json -p <prompt>` but receiving zero events and exit code 1.

## Finding / Fix
Claude CLI enforces that when using `--print` (or `-p`), the `--output-format=stream-json` flag REQUIRES `--verbose` to be also present. Without it, the CLI immediately exits with:

```
Error: When using --print, --output-format=stream-json requires --verbose
```

The fix is to always include `--verbose` in the spawn args when using stream-json mode:

```js
['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', ...]
```

## Key Takeaways
- ALWAYS include `--verbose` when spawning with `--output-format stream-json` and `-p`
- This applies to ALL turns (initial --session-id and subsequent --resume turns)
- Post-result hang is ~640-700ms consistently on Windows — plan for this in timeout logic
- Event types emitted: system, assistant, user, rate_limit_event, result
- Result event contains: total_cost_usd, usage (input/output tokens, cache stats), session_id, duration_ms, stop_reason
- Session JSONL stored at: ~/.claude/projects/<encoded-path>/<session-id>.jsonl

## Sources / References
- server/spike/stream-json-spike.mjs (spike script)
- Claude CLI error message: "When using --print, --output-format=stream-json requires --verbose"
