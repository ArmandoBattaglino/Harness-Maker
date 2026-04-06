# Test Workflows - Codex Project Model

This file is the project-local Codex operating model for this repository.

It is the local translation of:
- `CLAUDE.md`
- `.claude/CLAUDE.md`
- `.agent/workflows/bug-hunt-and-fix.md`

## Project Overview

This project is a local web application for managing Claude Code workflows visually.

It:
- spawns Claude Code processes directly from the installed binary
- exposes both PTY terminal interaction and job-mode prompt execution
- manages agents, skills, and CLAUDE-like configuration files
- persists multi-project session state

Primary project sources preserved from Claude are:
- `CLAUDE.md`
- `.claude/CLAUDE.md`
- `.claude/settings.local.json`
- `.agent/workflows/bug-hunt-and-fix.md`

Treat this file as the Codex-native runtime translation of those sources for this repository.

## Runtime Identity

This repo should behave as a Claude Code Visual Manager project:
- server default: `http://127.0.0.1:3000`
- bind only to `127.0.0.1`, never to the network
- Claude binary path: auto-detected unless explicitly overridden
- two execution modes matter: PTY terminal mode and job/SSE mode

Important environment variables:
- `PORT` default `3000`
- `IDLE_TIMEOUT_MINUTES` default `30`
- `CLAUDE_BINARY_PATH` for explicit Claude binary override

## Project Start

At the start of substantial work:
- read `docs/memory/PROJECT.md`
- read `docs/memory/DECISIONS.md`
- read `docs/memory/PROGRESS.md`
- read `docs/memory/CONTEXT.md`
- read `docs/memory/CODE_MAP.md`
- read `docs/memory/ACTIVITY_LOG.md`

For significant sessions, start with:
- `subagents.delegate(agent="project-manager", task="Review the current project state, verify docs/memory/, and identify the next priority task.", cwd="<repo-root>")`

If the session is multi-step or cross-role, prefer:
- `subagents.delegate(agent="orchestrator", task="<goal>", cwd="<repo-root>")`

## Local Claude-like Workflow

Within this repo, preserve the same working model Claude used:
- use `orchestrator` as the normal entrypoint for multi-step or cross-role work
- use specialists for planning, implementation, debugging, QA, documentation, and security
- keep docs/memory/ current as part of the work, not as an afterthought
- treat websocket contracts and task gates as first-class constraints
- keep the main thread more as supervisor/synthesizer than as the direct worker of first resort
- treat the original local `CLAUDE.md` files as source material and this file as the active Codex runtime contract

Primary local delegation:
- `subagents.delegate(agent="orchestrator", task="<goal>", cwd="<repo-root>")`

Delegate-first rule for this repo:
- if the work spans more than one role, start with `orchestrator`
- if the work is clearly single-role, route straight to that specialist
- only skip delegation entirely for trivial tasks

Common specialist runs:
- `project-manager`
- `architect`
- `backend-dev`
- `frontend-dev`
- `debugger`
- `qa-tester`
- `documenter`
- `security`
- `code-mapper`

Skills in `.codex/skills` are supporting guidance.
Subagents are the primary execution path for Claude-like behavior in this repo.

## Mandatory Local Rules

- Never use `shell: true` for spawn calls
- Never use raw `fs.writeFile` for config, agents, skills, or CLAUDE-like docs when atomic writing is required
- Always validate write targets with resolved absolute paths and prefix checks
- Do not remove the PTY `onData` handler
- Call `child.stdin.end()` immediately after every job spawn
- Require atomic writing for config, agent, skill, and CLAUDE-like content
- Keep one xterm terminal instance per session; do not reuse across project tabs
- Never log API keys, OAuth tokens, full prompt payloads, or full file contents

## API And Security Rules

- Server endpoints live under `/api/v1/`
- Mutating requests require header `X-Requested-With: ClaudeCodeManager`
- Validate agent names server-side with `^[a-z][a-z0-9-]*$`
- Use `js-yaml` for frontmatter parse/serialize when handling CLAUDE-like files
- Frontmatter shape remains `---`, YAML body, `---`, then markdown

## Local Permission And Tool Intent Parity

Mirror the intent of `.claude/settings.local.json` here:
- allow project config updates when needed
- allow browser verification through `puppeteer`
- allow `npm run:*`, `npm test:*`, and the project's sorting command when they are relevant to the task
- do not treat those permissions as a license to skip planning, verification, or path safety

## Memory Location

Project memory lives in `docs/memory/`.

Important files:
- `docs/memory/PROJECT.md`
- `docs/memory/DECISIONS.md`
- `docs/memory/PROGRESS.md`
- `docs/memory/CONTEXT.md`
- `docs/memory/CODE_MAP.md`
- `docs/memory/ACTIVITY_LOG.md`
- `docs/memory/knowledge/INDEX.md`

## Bug Protocol

Any error or unexpected behavior:
1. route immediately through `debugger`
2. update the plan and memory
3. verify the fix

Preferred local bug run:
- `subagents.delegate(agent="debugger", task="Investigate the bug, find the root cause, apply the minimal safe fix, and report what changed.", cwd="<repo-root>")`

For full-project bug sweeps or release-hardening, use:
- `$bug-hunt-and-fix`
- `$claude-cmd-debugger-loop` for the iterative deep E2E -> bulk-plan -> fix -> verify loop
- usually starting from `orchestrator` or `qa-tester`, then routing into `project-manager`, `debugger`, `backend-dev`, `frontend-dev`, `documenter`, and `code-mapper`

## Post-task Discipline

After meaningful implementation work:
- update or verify the task plan
- update documentation that became stale
- update memory artifacts
- run QA checks
- run security review when the change touches external input, process spawning, file I/O, auth, or secrets

Claude's local trio remains the right default here:
- `code-mapper`
- `project-manager`
- `documenter`

## Browser And UI Checks

Use `playwright` or `puppeteer` for:
- UI flows
- screenshots
- regression checks
- manual QA support

## Local Skills

Repo-local skills are available under `.codex/skills`:
- `$test-workflows-project-core`
- `$bug-hunt-and-fix`

Use them as supporting guidance and source preservation.
Prefer subagents for actual Claude-like execution inside this repo.
Global migrated command skills can also apply here, especially `$claude-cmd-debugger-loop` for multi-phase deep debug sweeps.
