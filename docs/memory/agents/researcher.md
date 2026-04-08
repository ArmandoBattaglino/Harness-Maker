---
## 2026-03-27 — Research C: Claude CLI PTY Live Injection
**Status:** COMPLETED
**Called by:** user (V3 Swarm Orchestrator planning phase)

### Context when I started
V3 "Swarm Orchestrator" feature requires three input modes: broadcast to all agents in a department, direct message to a single agent mid-execution, and full PTY terminal per agent. The team needed to know exactly how Claude Code CLI handles text injected into its PTY stdin during active task execution, so BroadcastService and chat-with-agent features could be designed correctly.

### What I did
1. Ran 4 parallel web searches: (a) Claude Code CLI stdin injection mid-response, (b) Ctrl+C interrupt behavior, (c) node-pty write-to-running-process behavior, (d) --print flag / non-interactive mode
2. Fetched GitHub issues: #36326 (Enter queues not interrupts), #15553 (programmatic input submission), #3455 (Ctrl+C feedback without stopping), #17466 (ESC/Ctrl+C fail during tool calls), #29293 (agent teams spawn failure)
3. Fetched official Claude Code interactive-mode docs (full keyboard shortcut reference)
4. Fetched DeepWiki Claude Code CLI commands overview

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/research_c.md | CREATED | Full research report on Claude CLI PTY live injection |
| docs/memory/agents/researcher.md | MODIFIED | Added this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added activity entry |

### Improvements delivered
- Confirmed that mid-execution text injection is QUEUED, not dropped and not an immediate interrupt
- Identified the Ink library as the root cause of why programmatic \r/\n do not submit
- Documented the only reliable injection pattern: Ctrl+C → 300ms → text → Escape → 100ms → Enter
- Recommended hybrid --print + --resume architecture as the cleanest alternative
- Documented the /btw side-question mechanism (new in recent Claude Code) as a non-interrupting query path

### Bugs I encountered
None — read-only research task.

### Decisions I made
- Documented both "soft broadcast" (queue) and "hard broadcast" (interrupt first) patterns for the team
- Noted that the Enter-interrupts-mid-task documentation is WRONG as of 2026 — actual behavior is queuing

### What I learned
- Claude Code uses the Ink React library for terminal UI; programmatic stdin Enter != physical keyboard Enter
- Ctrl+C injection is timing-dependent and unreliable during active tool calls
- Official Agent Teams feature uses --print + stdin pipe (not interactive PTY injection) for spawning agents
- /btw command (new, March 2026) allows side questions without interrupting main task — relevant if V3 needs non-blocking status queries
- The Escape + delay + Enter tmux pattern is the only reliable workaround for programmatic submission

### State I'm leaving behind
research_c.md is complete. All findings are concrete and actionable. The prd-writer and backend-dev can use this to design BroadcastService.

### Handoff
backend-dev / architect should read docs/research_c.md before designing BroadcastService.writeToAgent() and the per-agent chat input flow.
---

## 2026-03-24 — Research: Puppeteer MCP Server for Claude Code
**Status:** COMPLETED
**Called by:** user

### Context when I started
User needed to find the correct npm package for a Puppeteer MCP server compatible with Claude Code, including exact package name, install command, and settings.json configuration.

### What I did
1. Checked npm for `@modelcontextprotocol/server-puppeteer` — confirmed it exists but is DEPRECATED
2. Searched npm and web for replacement packages
3. Found two viable community replacements: `puppeteer-mcp-claude` and `puppeteer-mcp-server`
4. Researched tools/capabilities of each package
5. Also identified `@playwright/mcp` as the officially recommended alternative
6. Produced structured research report with all four options compared

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | CREATED | Initial session log |

### Improvements delivered
- Clear comparison of 4 Puppeteer/browser MCP options with exact install commands and config blocks
- Identified that the original Anthropic package is deprecated — saved team from using dead package

### Bugs I encountered
None.

### Decisions I made
- Recommended `puppeteer-mcp-claude` as primary Puppeteer option (most recent, Claude Code-focused, auto-installer)
- Noted `@playwright/mcp` as better long-term alternative if not locked to Puppeteer

### What I learned
- `@modelcontextprotocol/server-puppeteer` was deprecated sometime in 2025; Anthropic did not publish a replacement under a new name
- `puppeteer-mcp-claude` by jaenster is the most Claude Code-optimized community replacement (v0.1.10, Jan 2026)
- MCP config for Claude Code goes in `.claude.json` or `~/.claude/claude_desktop_config.json`, NOT in `settings.json`
- The `claude mcp add` CLI command is the simplest way to register MCP servers

### State I'm leaving behind
Research report delivered. No code changes.

### Handoff
None — research task fully self-contained.
---

---
## 2026-03-27 — Task: Research A — OpenAI Swarm Framework Mechanics
**Status:** COMPLETED
**Called by:** user (deep-dive research for V3 Swarm Orchestrator /create pipeline)

### Context when I started
V3 Swarm Orchestrator project is in planning phase. Tech-lead, creative-director, architect, and security agent have all completed their Stage 0/1 analyses. prd-writer is next. The team needs a precise technical reference for the OpenAI Swarm framework mechanics so that the HandoffParser, agent node schema, system prompt template, and ExecutionEngine can be designed faithfully.

### What I did
1. Read docs/memory/agents/researcher.md and docs/memory/CONTEXT.md for project state
2. Ran 4 parallel web searches: Swarm GitHub primitives, handoff mechanism detail, CLI adaptation patterns, triage agent + transfer_to pattern
3. Fetched the raw README from github.com/openai/swarm — got the full Agent class schema, run loop mechanics, Result wrapper, and context_variables spec
4. Fetched developers.openai.com/cookbook/examples/orchestrating_agents — got execution loop agent-switching logic and handoff function return type confirmation
5. Attempted to fetch triage_agent/main.py — 404 (file may have moved; sufficient data already captured from README)
6. Synthesized all findings into docs/research_a.md

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/research_a.md | CREATED | Full research report on Swarm mechanics and CLI adaptation |
| docs/memory/agents/researcher.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended activity entry |

### Improvements delivered
- Precise Agent class field spec (name, model, instructions, functions, tool_choice)
- Exact handoff detection mechanism: `if type(result) is Agent` in run loop
- `context_variables` flow: callable instructions, function parameter injection, `Result` dict merge (not replace)
- `Result` wrapper semantics: simultaneous value + agent + context_variables return
- Triage agent hub-and-spoke topology documented with transfer_back_to_triage() pattern
- Full mapping table: every Swarm concept → CLI PTY equivalent
- Concrete implications for HandoffParser, node schema, system prompt template, ExecutionEngine

### Bugs I encountered
None — research only.

### Decisions I made
- Recommended `__HANDOFF__:{targetId}:{jsonPayload}` as the CLI handoff token format — mirrors Swarm's function-return-an-Agent pattern but works with free-form PTY stdout
- Recommended context merging (not replacing) to match Swarm's `Result.context_variables` merge behavior

### What I learned
- Swarm is deprecated (superseded by OpenAI Agents SDK, March 2025) but its conceptual model is the canonical reference for multi-agent design
- The run loop's handoff detection is a simple type check: `if type(result) is Agent` — extremely simple at the framework level
- `context_variables` callable instructions are the key mechanism for dynamic prompts — directly maps to injecting `workflowContext` into system prompt at spawn time
- The `Result` wrapper is the richest primitive — it handles value + agent switch + context update in one return, our handoff token JSON payload should mirror this
- Triage agent has NO domain logic — it is a pure router; this must be enforced via system prompt design, not code
- Only the last handoff function call wins if multiple are made in one turn — edge case to handle in ExecutionEngine

### State I'm leaving behind
docs/research_a.md is complete and ready for prd-writer and architect to reference. No code changes.

### Handoff
prd-writer should read docs/research_a.md — specifically the "Implications for This Project" section — before writing the V3 PRD. The HandoffParser and ExecutionEngine sections are directly actionable for backend-dev.
---

---
## 2026-03-27 — Quick Orientation Scan: V3 Swarm Orchestrator
**Status:** COMPLETED
**Called by:** user (orientation scan for /create pipeline, Stage 1)

### Context when I started
Stage 0 completed by tech-lead and creative-director. User requested a quick research snapshot covering: dominant canvas tech stacks in competitor products, competitor one-liners, top 3 pitfalls for visual multi-agent systems, @xyflow/react v12-specific notes, and the single most important architecture insight.

### What I did
1. Read project memory (PROJECT.md, ACTIVITY_LOG.md, researcher.md)
2. Ran 4 parallel web searches: stack comparison, @xyflow/react v12 specifics, multi-agent canvas pitfalls, React Flow performance limits
3. Ran 2 follow-up searches: Dify tech stack and v12 immutability/measured dimensions detail
4. Synthesized into a Quick Research Snapshot

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended activity entry |

### Improvements delivered
- Confirmed all four major competitors (LangFlow, Flowise, n8n, Dify) use React Flow as their canvas layer — validates the team's chosen approach
- Identified the v12 package rename (reactflow → @xyflow/react) and immutable-node-update requirement as hard breaking changes
- Identified ~500 nodes as the practical unoptimized performance ceiling; beyond that, custom nodes + memoization are mandatory
- Named state serialization/persistence as the single most critical architecture decision

### Bugs I encountered
None — research only.

### Decisions I made
- React Flow (@xyflow/react v12) is confirmed as the correct canvas choice based on industry adoption
- Performance ceiling is ~500 nodes before optimization work is needed

### What I learned
- ALL four main competitors (LangFlow, Flowise, n8n, Dify) use React Flow for their canvas — it is the de facto standard
- @xyflow/react v12 renamed from `reactflow`; node dimensions now live in `node.measured.width/height` not top-level
- v12 no longer supports object mutation for node updates — always create a new node object
- Practical performance ceiling without optimization: ~500 custom nodes. With memoization + virtualization: 1000+
- The biggest pitfall in multi-agent canvas systems is conflating visual state (canvas layout) with execution state (agent runtime) — they must be separate stores
- Circuit breaker and HITL inbox patterns require a dedicated execution state machine, not ad-hoc per-node state

### State I'm leaving behind
Research snapshot delivered. No code changes. Key finding: React Flow is the right call, v12 breaking changes are manageable but must be addressed upfront in architecture.

### Handoff
Architect should read the Key Architecture Insight section of the snapshot before designing the execution state model. Specifically: canvas state (positions, edges) and execution state (agent status, output, errors) must be in separate stores that stay in sync via a sync layer.
---

---
## 2026-03-27 — Research B: React Flow GroupNode / DepartmentNode
**Status:** COMPLETED
**Called by:** user (focused deep dive for V3 Swarm Orchestrator /create pipeline)

### Context when I started
V3 canvas architecture is being designed. The team needs concrete implementation details for DepartmentNode (group container) and the matrioska drill-down UX pattern. Known: @xyflow/react v12, immutable node updates, Zustand for execution state.

### What I did
1. Read memory files (researcher.md, CONTEXT.md)
2. Ran 4 parallel web searches: parentId/subflow docs, expand-collapse v12, drill-down navigation, extent/drag-within-parent
3. Fetched 5 official docs pages: sub-flows guide, expand-collapse example, sub-flows example, hidden example, Node API reference
4. Fetched GitHub discussion #1024 for community patterns and gotchas
5. Ran 1 follow-up search: updateNode/setNodes live update patterns + known bugs
6. Synthesized all findings into docs/research_b.md

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/research_b.md | CREATED | Full research report on React Flow group nodes and drill-down |
| docs/memory/agents/researcher.md | MODIFIED | Appended this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Appended activity entry |

### Improvements delivered
- Confirmed official parentId + extent:'parent' API for v12 — no breaking changes from v11.11.0+
- Identified expand/collapse Pro pattern vs free hidden-flag pattern — free pattern is sufficient for this project
- Designed complete matrioska drill-down via canvas filtering (focusedDepartmentId + departmentStack in Zustand)
- Flagged updateNode bug #5036 (unintended selection after drag-drop) — team should use setNodes instead
- Clarified that parent node width/height MUST be set via style:{}, not node fields

### Bugs I encountered
None — research only.

### Decisions I made
- Canvas filtering (Approach A) over embedded ReactFlow per node (Approach B) for drill-down — Approach B creates multiple independent ReactFlow stores, catastrophically expensive for live execution
- hidden flag (Pattern A) over Pro useExpandCollapse hook (Pattern B) — free, fits fixed-canvas model

### What I learned
- parentId was called parentNode before v11.11.0 — v12 removes the old name
- Parent nodes require explicit style.width/style.height — no auto-sizing to fit children
- extent:'parent' clipping can cut off execution overlay badges — inset children or add overflow:visible to parent style
- updateNode has a known bug causing unintended node selection after drag; use setNodes with map callback for bulk updates
- Embed ReactFlow in a node (community workaround) = separate store per node = not viable for live execution
- The hidden flag approach keeps full graph in Zustand state; only the rendering filter changes — clean separation

### State I'm leaving behind
docs/research_b.md is complete. Contains: full parentId/extent API, expand-collapse implementation, drill-down pattern with code sketches, all gotchas, and actionable implications for DepartmentNode.jsx and SwarmCanvasView.

### Handoff
frontend-dev building DepartmentNode.jsx and SwarmCanvasView should read docs/research_b.md — specifically the "Implications for this project" section — before implementing.
---

---
## 2026-04-08 — Quick Research Snapshot: Stream-JSON Agent Migration (Session Management + Event Types)
**Status:** COMPLETED
**Called by:** orchestrator (orientation scan for stream-json migration planning)

### Context when I started
Team is evaluating replacing PTY-based agent spawning in SwarmEngine with Claude CLI stream-json mode. Tech-lead flagged UNCERTAIN feasibility. Need concrete answers on: --resume + -p combination, --session-id custom IDs, stream-json event types, auto-accept flags, and session persistence behavior.

### What I did
1. Read project memory (researcher.md, PROJECT.md, ACTIVITY_LOG.md)
2. Read existing JobRunner.js to confirm current stream-json spawn pattern (uses --no-session-persistence)
3. Fetched official CLI reference at code.claude.com/docs/en/cli-reference — extracted all relevant flags
4. Fetched headless mode docs at code.claude.com/docs/en/headless — confirmed --resume + -p combination works
5. Fetched Agent SDK streaming docs at platform.claude.com/docs/en/agent-sdk/streaming-output — got complete event type reference
6. Fetched GitHub issue #24596 for community-reported event type gaps
7. Ran web searches for --dangerously-skip-permissions and auto-accept modes

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | MODIFIED | Added this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added activity entry |

### Improvements delivered
- Confirmed --resume + -p works: `claude -p "query" --resume <session-id>` is documented and supported
- Confirmed --session-id accepts custom UUIDs: `claude --session-id "550e8400-..."` 
- Complete stream-json event type reference assembled from 3 sources
- Identified critical limitation: extended thinking disables StreamEvent emission
- Confirmed --dangerously-skip-permissions is the auto-accept mechanism for -p mode

### Bugs I encountered
None — research only.

### Decisions I made
- None — research deliverable only

### What I learned
- --session-id flag exists and accepts custom UUIDs — this means we CAN pre-generate session IDs for agents
- --resume accepts session ID OR name — named sessions via --name flag are also an option
- --fork-session creates a new session ID from an existing conversation — useful for branching
- --input-format stream-json exists for multi-turn input piping (undocumented beyond flag table per issue #24594)
- Extended thinking (max_thinking_tokens) DISABLES StreamEvent emission — only complete messages are returned
- system/api_retry event type exists for rate limit retry visibility
- --no-session-persistence is print-mode-only — removing it enables resume capability (currently used in JobRunner)
- --bare skips CLAUDE.md, hooks, MCP, skills — faster but loses project context; NOT recommended for swarm agents that need project awareness

### State I'm leaving behind
Quick Research Snapshot delivered as direct response. All findings are from official docs (code.claude.com, platform.claude.com). No code changes.

### Handoff
Architect/backend-dev should use these findings to design the stream-json spawn pattern for SwarmEngine. Key decision: whether to use --session-id (pre-generated UUID) or capture session_id from first --output-format json response.

---
## 2026-04-08 — Research: Resume After Process Kill
**Status:** COMPLETED
**Called by:** orchestrator (stream-json migration planning — deep dive on --resume behavior)

### Context when I started
Team is migrating Claude agents in SwarmEngine from PTY to stream-json mode (DEC-027). Architect needs to know whether --resume works after process kill so stop/reset lifecycle can be designed correctly. DEC-029 establishes `result` event as turn-completion signal.

### What I did
1. Read project memory (researcher.md, PROJECT.md, DECISIONS.md, CONTEXT.md)
2. Ran 4 parallel web searches: resume after SIGTERM/SIGKILL, session write timing, stream-json mid-kill recovery, session storage location
3. Fetched GitHub issue #18880 (--resume crashes on killed sessions) -- got exact JSONL corruption pattern
4. Fetched GitHub issue #26729 (streaming resilience feature request) -- confirmed no recovery mechanism exists
5. Fetched ruvnet/ruflo wiki on session persistence -- got session structure overview
6. Attempted Milvus blog deep-dive on local storage -- redirect loop, used other sources instead
7. Attempted Medium internals article -- paywalled, partial content only
8. Synthesized all findings into docs/research_resume_after_kill.md

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/research_resume_after_kill.md | CREATED | Full research report on --resume behavior after process kill |
| docs/memory/agents/researcher.md | MODIFIED | Added this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added activity entry |

### Improvements delivered
- Confirmed session JSONL uses incremental append model (per-message, not batch)
- Confirmed --resume after mid-turn kill is BROKEN (orphaned tool_use blocks cause API 400 or loader crash)
- Confirmed SIGTERM vs SIGKILL makes no practical difference (signal handlers blocked during tool calls)
- Confirmed partial streaming responses are LOST on kill
- Identified the exact JSONL corruption pattern (tool_use without tool_result)
- Identified issue #25629: CLI can hang AFTER result event in stream-json mode -- timeout fallback needed
- Designed concrete stop/reset lifecycle recommendations for SwarmEngine

### Bugs I encountered
None -- research only.

### Decisions I made
None -- research deliverable only.

### What I learned
- Session JSONL path: ~/.claude/projects/<hashed-cwd>/<session-id>.jsonl
- Each message (user, assistant, tool_use, tool_result, system) is a separate JSONL line, appended incrementally
- Clean exits write stop_hook_summary + turn_duration markers; kills leave these missing
- The Anthropic API enforces strict tool_use/tool_result pairing -- orphaned tool_use = HTTP 400
- Issue #18880: simply deleting trailing incomplete lines does NOT fix resume -- loader does additional validation
- Issue #25629: CLI sometimes hangs AFTER sending result event in stream-json mode (stdout stays open)
- Issue #26729 proposes recovery snapshots but is NOT implemented
- No --resume --force flag exists

### State I'm leaving behind
docs/research_resume_after_kill.md is complete with findings, key takeaways, project implications, and sources. The critical design implication: graceful stop must wait for result event; forced stop requires JSONL truncation before resume.

### Handoff
Architect/backend-dev should read docs/research_resume_after_kill.md before designing the stop/reset lifecycle for stream-json agents. The "Implications for This Project" section contains the concrete design recommendations.

---
## 2026-04-08 — Research: Claude CLI Structured Output / Programmatic Parsing
**Status:** COMPLETED
**Called by:** user (research request for output fidelity improvement)

### Context when I started
Project is at v8.2 with 353 tasks (351 completed). The team is dealing with PTY output noise from Claude CLI (ConPTY artifacts, spinner text, ANSI sequences, space-splitting). The question: can we get clean structured output from Claude CLI instead of parsing PTY noise?

### What I did
1. Read project memory files (PROJECT.md, DECISIONS.md, CONTEXT.md, researcher.md, ACTIVITY_LOG.md)
2. Ran 5 parallel web searches covering: --output-format json, --print flag, Claude Code SDK, CLI docs, GitHub issues
3. Fetched 6 documentation pages: headless mode docs, CLI reference, Agent SDK overview, Agent SDK TypeScript reference, streaming output docs, structured outputs docs
4. Fetched community guide on programmatic Claude Code usage
5. Reviewed existing JobRunner.js to confirm current spawn pattern
6. Synthesized findings into comprehensive research report

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | MODIFIED | Added this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added activity entry |

### Improvements delivered
- Confirmed THREE viable approaches to avoid PTY parsing: (1) CLI -p with --output-format, (2) @anthropic-ai/claude-agent-sdk TypeScript package, (3) stream-json mode already in use by JobRunner
- Identified that the project ALREADY uses --output-format stream-json in JobRunner.js for job mode
- Confirmed the Claude Agent SDK (@anthropic-ai/claude-agent-sdk on npm) provides native TypeScript async generator with typed message objects — no PTY at all
- Documented all CLI flags relevant to structured output: --output-format (text/json/stream-json), --json-schema, --bare, --verbose, --include-partial-messages
- Identified that stream-json gives per-token events with type discrimination, eliminating all ANSI/spinner/ConPTY noise

### Bugs I encountered
None — research only.

### Decisions I made
- Recommended the TypeScript Agent SDK as the highest-fidelity option for new features
- Noted that the existing PTY mode (interactive terminal) is fundamentally incompatible with structured output — it is interactive by design
- Confirmed that -p mode + stream-json is the correct approach for non-interactive use (already implemented in JobRunner)

### What I learned
- Claude Code CLI has THREE output formats: text (default), json (metadata + result), stream-json (NDJSON events)
- The @anthropic-ai/claude-agent-sdk TypeScript package wraps Claude Code as a library — async generator yields typed SDKMessage objects (SystemMessage, AssistantMessage, ResultMessage, StreamEvent)
- --bare flag skips CLAUDE.md, hooks, MCP servers, skills — faster startup for scripted calls
- stream-json events include: message_start, content_block_start, content_block_delta (text_delta / input_json_delta), content_block_stop, message_delta, message_stop
- The Agent SDK supports structured output via JSON Schema (outputFormat option) — result in structured_output field
- Streaming and structured output are mutually exclusive in the SDK — structured_output only appears in final ResultMessage
- Session resumption works in -p mode via --resume <session-id>
- --json-schema flag on CLI gives validated JSON output matching a schema

### State I'm leaving behind
Research report delivered as direct response. No code changes. Three clear options documented with trade-offs for the team.

### Handoff
Architect/backend-dev should evaluate which approach fits best for the Swarm agent output extraction use case: (a) keep PTY for interactive display + add parallel -p/SDK channel for semantic extraction, (b) switch Swarm agents to -p mode entirely, or (c) use the Agent SDK for maximum control.
---

---
## 2026-04-08 — Research D: Claude CLI Session File Management
**Status:** COMPLETED
**Called by:** orchestrator (session cleanup and version tracking research)

### Context when I started
Project spawns Claude CLI agents with --session-id <uuid>. Sessions accumulate on disk. Team needs cleanup strategy and wants to save execution history (for "reset" = kill + save to memory). Need to understand exact file structure, CLI commands for management, and programmatic access.

### What I did
1. Read project memory (researcher.md, PROJECT.md, DECISIONS.md, CONTEXT.md, ACTIVITY_LOG.md)
2. Ran 4 parallel web searches: session storage location, CLI session management commands, JSONL/SQLite format, cleanup/disk usage
3. Fetched 3 web pages: remarkablemark session management guide, GitHub issue #16901 (session list/delete feature request), kentgigger conversation history guide
4. Inspected local filesystem: ~/.claude/ top-level, ~/.claude/projects/ structure, JSONL file contents, subagents directory, sessions/ directory, history.jsonl global index, meta.json files
5. Verified file structure, naming convention, message types, and disk usage empirically on local machine

### Files I touched
| File | Action | What changed and why |
|------|--------|----------------------|
| docs/memory/agents/researcher.md | MODIFIED | Added this session log |
| docs/memory/ACTIVITY_LOG.md | MODIFIED | Added activity entry |

### Improvements delivered
- Complete mapping of Claude CLI session file structure with exact paths, naming, and formats
- Confirmed no built-in CLI command for session listing/deletion (manual fs operations required)
- Identified JSONL message types and per-line schema (type, sessionId, timestamp, uuid, message, etc.)
- Measured real disk usage: 725 MB for one project, 881 MB total across all projects
- Discovered subagents/ subdirectory with per-agent .jsonl + .meta.json pairs
- Identified ~/.claude/sessions/ as PID-indexed active session registry (separate from transcript storage)

### Bugs I encountered
None -- research only.

### Decisions I made
None -- research deliverable only.

### What I learned
- Sessions stored at ~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
- Path encoding: drive letter + dashes replacing slashes (C--Users-arman-Downloads-...)
- Each session has BOTH a .jsonl file AND a UUID directory (containing tool-results/ and subagents/)
- Subagents stored at <session-uuid>/subagents/agent-<hex-id>.jsonl + .meta.json
- meta.json contains agentType and description
- JSONL message types: permission-mode, file-history-snapshot, user, attachment, assistant, system
- User messages include: parentUuid, promptId, message, uuid, timestamp, permissionMode, userType, entrypoint, cwd, sessionId, version, gitBranch
- ~/.claude/sessions/<PID>.json = active session registry (pid, sessionId, cwd, startedAt, kind, entrypoint)
- ~/.claude/history.jsonl = global prompt index (display, pastedContents, timestamp, project, sessionId)
- No built-in `claude sessions list/delete` command exists (PR #34168 is in progress)
- cleanupPeriodDays setting controls auto-cleanup (default 30 days)
- JSONL files range from ~2 KB (subagent) to 100+ MB (long sessions)

### State I'm leaving behind
Research findings delivered as direct response. No code changes.

### Handoff
Architect/backend-dev should use these findings to design session cleanup service and history extraction for reset/save-to-memory feature.
---
