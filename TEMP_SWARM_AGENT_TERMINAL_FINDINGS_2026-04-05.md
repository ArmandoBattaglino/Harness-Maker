# Swarm Agent Terminal Findings

Date: 2026-04-05
Workflow: `Prompt Reliability Control Workflow`
Execution: `03037bdc-fa17-4184-890f-cc46106cb5b6`
Provider: `codex`

## Scope

This note captures issues observed in the current open Swarm session while inspecting the three agent terminals one by one from the UI and comparing them with the backend execution status and `/agent/:nodeId/output` responses.

## High-level result

The workflow completed functionally with one real handoff per edge:

- `finder.handoffCount = 1`
- `route-checker.handoffCount = 1`
- `formatter.handoffCount = 0`
- `edgeCounters.c1 = 1`
- `edgeCounters.c2 = 1`

However, the agent terminal experience is still unreliable and mixes correct task output with stale, garbled, or misleading PTY content.

## Problems found

### 1. Node card previews are not trustworthy

Observed in the current canvas:

- `Finder` card preview shows fragments like `rk`, `ki`, `in`
- `Route Checker` card preview shows fragments like `ki`, `in`, `ng`, `•g`
- `Formatter` card preview shows `Explain this codebase` instead of the final report

Impact:

- The mini terminal previews on the cards cannot be used to understand what the agent actually produced.
- The final node visually appears wrong even when the backend says the execution completed.

### 2. Inspector `Last Output` is also unreliable

Observed in the side inspector:

- `Finder` `Last Output` is mostly garbled fragments and not a meaningful summary.
- `Route Checker` `Last Output` is almost entirely broken fragments.
- `Formatter` `Last Output` is dominated by protocol text and queued-message notices instead of a clean final output preview.

Impact:

- The inspector repeats the same preview-quality problem instead of acting as a dependable per-agent diagnostic view.

### 3. Full `Finder` terminal contains unrelated/stale content

Observed in PTY Explosion for session `2b24aa3f`:

- content about `print_handoff.py`
- content about `server.pid` / PID `38612`
- staging-related guidance
- a final handoff summary referring to repo state and V4.0.3 notes

This content is not coherent with the narrow Finder task for this workflow, which should only verify version and host binding before handing off flat JSON facts.

Impact:

- The visible terminal transcript suggests session contamination or leaked prior context.
- A user reading this terminal would conclude the agent performed work outside its assigned scope.

### 4. Full `Route Checker` terminal is partially correct but still contaminated

Observed in PTY Explosion for session `a6105d0b`:

- route and engine facts are correct and relevant
- but the transcript also includes the Codex footer/prompt text like `Use /skills to list available skills`
- the tail contains corruption like repeated `A` / `E` characters

Impact:

- The terminal is closer to useful than the Finder terminal, but still not clean enough for reliable audit or replay.

### 5. Full `Formatter` terminal includes the correct report but still shows stale foreign prompt text

Observed in PTY Explosion for session `72a5968f`:

- final report lines are present
- but the terminal also shows `Explain this codebase`
- protocol/reminder text remains visible near the final output
- the tail contains corruption like repeated commas and `E`

Impact:

- The final agent terminal is contaminated by non-workflow prompt text.
- Even when the report is present, a user cannot tell at a glance whether the terminal belongs cleanly to this workflow.

### 6. Token rendering is inconsistent and misleading

Observed in UI snippets and backend `lastOutputSnippet`:

- `DONE_TOKEN=DONE`
- `DONE`
- `HANDOFF:route-checker:{...}`
- `HANDOFF:formatter:{...}`

But the workflow protocol and backend logic use literal tokens with underscores:

- `__DONE__`
- `__HANDOFF__:<targetId>:...`

Impact:

- The display layer makes it look like agents emitted different tokens than the protocol requires.
- This is dangerous during debugging because it can hide whether the runtime really received valid control tokens or only a display-normalized variant.

### 7. Backend snippets are already contaminated before the browser renders them

Observed in `/api/v1/swarm/:executionId/status`:

- `finder.lastOutputSnippet` contains the same unrelated `print_handoff.py` / `server.pid` material seen in UI
- `route-checker.lastOutputSnippet` contains route facts plus footer noise
- `formatter.lastOutputSnippet` contains final report lines plus `Explain this codebase`

Impact:

- This is not only a frontend rendering issue.
- The snippet source generated server-side is itself noisy and stale.

### 8. Per-agent full replay appears to preserve too much terminal furniture

Across the three agent terminals, the replay retains a lot of terminal chrome and side chatter:

- `Run /review on my current changes`
- `Use /skills to list available skills`
- `gpt-5.1-codex high · ...`
- queued-message notices
- protocol reminders
- broken trailing characters

Impact:

- The replay is not task-focused.
- Important agent output is buried inside terminal scaffolding and unrelated Codex shell/UI text.

### 9. Formatter shows evidence of recovery prompting that is not surfaced clearly as recovery

Observed in the `Formatter` inspector and terminal:

- `Messages to be submitted after next tool call`
- repeated instructions to print the expected report and then `__DONE__`
- backend/raw output suggests the agent previously emitted `__DONE__` multiple times without proper completion flow

Impact:

- Recovery behavior exists, but the user-facing UI does not distinguish "normal task output" from "runtime correction prompt".
- This makes the terminal look broken even when the engine is trying to recover deterministically.

### 10. Current session proves the duplicate-handoff bug is improved, but terminal correctness is still not fixed

What worked:

- one real handoff per edge
- completed execution
- correct route facts present
- final report present in formatter replay

What is still broken:

- stale/unrelated content in agent terminals
- meaningless previews
- token display mismatch
- terminal replay corruption/noise

## Suggested next fix directions

1. Separate raw PTY capture from user-facing replay/snippet generation.
2. Generate `lastOutputSnippet` from sanitized semantic output, not from the raw terminal tail.
3. Preserve control tokens exactly in UI-facing views; do not collapse `__DONE__` to `DONE`.
4. Strip provider shell furniture and Codex helper hints from agent replay where possible.
5. Mark recovery prompts explicitly in the UI instead of mixing them with the agent's own work output.
6. Investigate why stale prompt text like `Explain this codebase` appears in the formatter session replay.

