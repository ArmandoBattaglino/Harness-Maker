---
name: bug-hunt-and-fix
description: Full QA bug hunt, planning, fix, verification, and documentation workflow for this repository. Use when Codex needs to run the project's complete bug discovery to remediation pipeline derived from .agent/workflows/bug-hunt-and-fix.md.
---

# Bug Hunt And Fix

This is the repo-local Codex translation of `.agent/workflows/bug-hunt-and-fix.md`.

Use it as workflow guidance and source preservation for the original local Claude-style QA pipeline.
For actual execution, prefer Codex's native agents and parallelize independent QA, fix, and verification tracks when the dependencies allow.

## Goal

Run a full cycle:
- discover bugs
- document bugs
- plan fixes
- apply fixes
- verify the result
- update the memory and documentation surface

## Preconditions

- the project should build cleanly
- the relevant test suites should pass before the bug hunt starts
- the local dev server should be running for browser-based checks when needed

## Recommended Flow

1. Run the project-specific QA pass and capture findings.
2. Convert findings into actionable tasks with dependencies and acceptance criteria.
3. Fix backend issues first when frontend depends on them.
4. Fix frontend issues next.
5. Re-run build and tests.
6. Update `TASK_PLAN.md`, `ACTIVITY_LOG.md`, `CHANGELOG.md`, `CODE_MAP.md`, `CONTEXT.md`, `PROGRESS.md`, and agent memory files as applicable.
7. Run a final regression pass.

## Best Parallel Pattern

For a Codex-native run:
- start with a bug discovery pass and capture a structured bug report
- split planning, backend fixes, frontend fixes, and verification into separate tracks when they do not block each other
- keep the main thread supervising dependencies and sequencing
- finish with QA, documentation, and code-map updates so the repo state stays truthy

## Source Workflow

Read the original workflow in:
- `.agent/workflows/bug-hunt-and-fix.md`
