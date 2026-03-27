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
