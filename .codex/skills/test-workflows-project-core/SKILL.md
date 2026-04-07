---
name: test-workflows-project-core
description: Project-local operating model for the Test Workflows repository. Use as the local compatibility/reference layer while Codex native agents and parallel execution remain the preferred path for Claude-like work in this repo.
---

# Test Workflows Project Core

Use this skill for work in this repository.

Use this skill mainly as:
- the repo-local compatibility/reference layer
- the place to recover project-specific Claude wording and constraints
- support for the main thread or delegated runs when exact repo guidance is useful

Do not treat this skill as the primary runtime for specialist execution in this repo.
Prefer Codex's native agents and native parallel execution when the work benefits from decomposition.

## Project Identity

This repository is a local web application that manages Claude Code visually and operationally:
- terminal sessions via PTY
- job-mode execution
- CRUD management for agents, skills, and Claude-style instruction files
- persistent multi-project state

Runtime expectations preserved from the repo's local Claude files:
- server default `http://127.0.0.1:3000`
- bind only to `127.0.0.1`
- Claude binary auto-discovery unless overridden
- PTY and job/SSE flows are both critical features

## Read First

Before substantial work, read:
- `docs/memory/PROJECT.md`
- `docs/memory/DECISIONS.md`
- `docs/memory/PROGRESS.md`
- `docs/memory/CONTEXT.md`
- `docs/memory/CODE_MAP.md`
- `docs/memory/ACTIVITY_LOG.md`

## Local Operating Rules

- never use `shell: true` for process spawning
- never write config-like files unsafely when atomic writing is expected
- always validate resolved paths before writing
- keep the PTY `onData` handler intact
- call `child.stdin.end()` immediately after each job spawn
- keep one xterm terminal instance per session
- never log secrets, tokens, full prompt payloads, or full file contents
- keep `/api/v1/` and `X-Requested-With: ClaudeCodeManager` constraints intact on mutating flows

## Claude-like Routing

Use Codex-native agent parallelization inside this repo:
- keep the main thread supervising the task
- decompose multi-step work into dependency waves
- parallelize independent specialist tracks with Codex's native agents when useful

This is the preferred runtime path.
Use this skill as backing guidance, not as the default substitute for native agent execution.

Common roles:
- `project-manager` for planning
- `debugger` for bugs
- `architect` for design
- `backend-dev` and `frontend-dev` for implementation
- `qa-tester` for verification
- `documenter` and `code-mapper` for bookkeeping
- `security` for risk review

## Memory And Bookkeeping

Treat `docs/memory/` as part of the implementation surface.
Do not leave the repo in a state where code changed but the active project memory is clearly stale.
