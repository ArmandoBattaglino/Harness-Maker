# PRD: Claude Code Visual Manager — V3/V5 (Multi-Agent Swarm Orchestrator + Visual Workflow Editor)
**Version:** 5.0
**Date:** 2026-04-06
**Status:** Draft — V5 Addendum (N8N-Style Workflow Editor)

---

## 1. Problem Statement

Claude Code Visual Manager V2 is a local GUI that wraps the `claude` CLI binary, providing PTY terminal sessions and job mode in a browser. Power users building agentic workflows need more than a terminal wrapper: they need to coordinate multiple Claude agents working in parallel, passing context between them, and reacting to external triggers — all without leaving the localhost environment, adding API keys, or learning a new orchestration framework.

**Who has this problem:** Developers and AI power users already using Claude Code who want to build autonomous multi-agent pipelines (content agencies, research loops, code review chains, data processing flows) without cloud infrastructure or direct Anthropic API integration.

**Why it matters:** The OpenAI Swarm framework introduced a clear, minimal model for agent orchestration: agents + handoffs + context_variables. V3 adapts this pattern to the Claude CLI binary via PTY stdout token parsing, making it accessible through a visual org-chart canvas editor that runs entirely on localhost.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Visual workflow creation | Time from idea to running workflow | Under 2 minutes using Prompt-to-Flow |
| Reliable handoff delivery | Handoff token parse success rate across ConPTY chunking | 100% (rolling accumulator) |
| Canvas performance | React Flow render at 50 nodes | Under 100ms frame time |
| Zero API calls | Direct Anthropic API calls in codebase | 0 |
| V2 backward compatibility | Existing V2 tests passing after V3 merge | 110/110 |
| Security compliance | All 7 SEC-V3-* requirements satisfied | 100% before release |
| Autonomous execution | Workflow runs without user intervention | Confirmed via HITL-optional mode |

---

## 3. User Stories

- As a user, I want to draw an org-chart canvas where each node is a Claude agent, so that I can visualize my multi-agent workflow before running it.
- As a user, I want to edit the canvas at any time including during execution, so that I can adjust the workflow in response to what I observe.
- As a user, I want to create agent nodes from scratch (with optional templates) or by selecting from my existing `.claude/agents/` directory, so that I can reuse work I have already done.
- As a user, I want agent nodes grouped into departments, and I want to drill into a department by double-clicking it, so that I can manage large workflows without visual clutter.
- As a user, I want to start a workflow execution and watch agents light up with animated status as they run and pass handoffs to each other, so that I understand what is happening in real time.
- As a user, I want handoff edges to show an animated pulse and a counter badge when a handoff occurs, so that I can trace the flow of context through the graph.
- As a user, I want the workflow to never stop automatically — only a manual Stop button ends execution — so that looping workflows run indefinitely without surprise termination.
- As a user, I want a soft budget warning when the estimated token usage crosses a threshold, without the workflow stopping, so that I stay informed without losing progress.
- As a user, I want a circuit breaker that warns me when an edge fires more than N times, without stopping execution, so that I can detect runaway loops without being blocked.
- As a user, I want to type a plain-English description of a workflow and have AI scaffold the initial canvas for me (Prompt-to-Flow), so that I do not have to build every node manually.
- As a user, I want to chat with a running agent at the department level or the individual agent level (HITL), so that I can inject instructions mid-execution.
- As a user, I want to click any agent node and "explode" it into a full xterm.js PTY terminal, so that I have direct keyboard access to that agent's process.
- As a user, I want to broadcast a message to all agents, all agents in a department, or a single agent, so that I can issue instructions at any scope.
- As a user, I want an HITL inbox where I can review and approve or reject paused agent actions, so that critical steps require human confirmation before proceeding.
- As a user, I want to define trigger nodes (webhook or RSS) that start or resume workflows automatically, so that workflows can react to external events without manual intervention.
- As a user, I want all of this to work through the `claude` CLI binary I already have installed, with zero additional API keys or cloud setup, so that there is no new cost or configuration burden.

---

## 4. Functional Requirements

### Must Have (MVP — V3.0)

**Workflow CRUD**
- FR-V3-01: The system must provide a WorkflowStore that persists workflow definitions as JSON files at `CONFIG_DIR/workflows/<id>.json`. Workflow IDs must be server-generated UUIDs. Concurrent writes must use `write-file-atomic`.
- FR-V3-02: The server must expose a full CRUD REST API for workflows: `GET /api/v1/workflows`, `POST /api/v1/workflows`, `GET /api/v1/workflows/:id`, `PUT /api/v1/workflows/:id`, `DELETE /api/v1/workflows/:id`.
- FR-V3-03: WorkflowDefinition schema must be validated on every write operation. Validation rules: node count maximum 50, systemPrompt per node maximum 16 KB, name and description length caps and character whitelist. Any validation failure must return HTTP 400 with a descriptive error message. (SEC-V3-02, SEC-V3-06)
- FR-V3-04: WorkflowDefinition must support the following structure: `id`, `name`, `projectId`, `nodes` (array), `edges` (array), `settings` (mode, budgetTokens, circuitBreakerThreshold, defaultModel), `initialContext` (flat dict).
- FR-V3-05: Each node must support these types: `agent`, `department`, `trigger`. Agent nodes carry: `label`, `systemPrompt`, `model`, `tools`, `isTriageNode`, `maxTurns`, `parentDepartmentId`. Trigger nodes carry: `triggerType` (`webhook` or `rss`), `rssUrl` or `webhookPath`, `targetNodeId`.
- FR-V3-06: Each edge must carry: `id`, `source`, `target`, `type: "handoff"`, `data.circuitBreakerThreshold` (optional override).

**Swarm Execution Engine**
- FR-V3-07: The SwarmEngine must manage a Map of active executions keyed by `executionId` (UUID). Each execution maintains a Map of `nodeId` → `{ pty, handoffParser, status, handoffCount }`.
- FR-V3-08: When an execution starts, SwarmEngine must inject a system prompt block into each agent's PTY that includes: the agent's own domain instructions, a SWARM PROTOCOL section explaining the handoff token format, the list of valid target agent IDs the agent may hand off to, and the current `workflowContext` key-value pairs.
- FR-V3-09: The handoff token format must be: `__HANDOFF__:<targetAgentId>:<base64_json_context_update>`. The done token must be: `__DONE__`. These tokens are emitted by agents via stdout.
- FR-V3-10: On receiving a `__HANDOFF__` token, SwarmEngine must: base64-decode and JSON-parse the context update, shallow-merge it into the shared `workflowContext` dict, look up the target agent's PTY, inject the updated context into that PTY session, and increment the handoff counter for that edge.
- FR-V3-11: On receiving a `__DONE__` token, SwarmEngine must emit a soft `execution_status` WebSocket notification only. The workflow must NOT stop. Execution continues until the user clicks Stop.
- FR-V3-12: The only way to terminate an execution is via `DELETE /api/v1/swarm/:workflowId` or the manual Stop button in the UI. This must kill all agent PTYs in the execution using `tree-kill`.
- FR-V3-13: SwarmEngine must tap PTY stdout via a non-destructive listener added to `session.swarmListeners` Set on `SessionManager` sessions. The existing permanent `pty.onData` handler must NEVER be removed. (DEC-009)

**HandoffParser**
- FR-V3-14: HandoffParser must implement a stateful rolling byte accumulator, maximum 4 KB capacity. It must use a three-state FSM: `SCANNING` → `COLLECTING_TARGET` → `COLLECTING_PAYLOAD`. ANSI escape sequences must be stripped before accumulation. `\r\n` sequences must be normalized to `\n` before accumulation.
- FR-V3-15: HandoffParser must handle `__HANDOFF__` and `__DONE__` tokens that arrive split across multiple PTY output chunks (ConPTY on Windows splits output into arbitrary byte fragments). The accumulator must reconstruct the full token before emitting it.
- FR-V3-16: HandoffParser payload (base64 context update) must be capped at 4 KB. Payloads exceeding this cap must be silently dropped and logged as a warning. The extracted `contextUpdate` must be schema-validated (flat dict, string keys and values only) before being merged into `workflowContext`. (SEC-V3-07)

**Circuit Breaker**
- FR-V3-17: CircuitBreaker must track handoff counts per edge. When an edge's handoff count reaches the configured threshold (default 10, configurable per workflow and per edge), CircuitBreaker must emit a `circuit_breaker` WebSocket event with `{ edgeId, counter, threshold }`. The workflow must NOT stop — the event is advisory only.

**Budget Tracker**
- FR-V3-18: BudgetTracker must estimate token usage from character count (approximate: chars / 4 = tokens). When estimated usage reaches the workflow's `budgetTokens` setting, BudgetTracker must emit a `budget_update` WebSocket event with `{ estimatedTokensUsed, limitTokens }`. The workflow must NOT stop. (User decision: soft warn only, never halt.)

**Prompt-to-Flow (AI Scaffold)**
- FR-V3-19: The server must expose `POST /api/v1/swarm/scaffold` which accepts a plain-English workflow description and tries the configured scaffold providers in order (Claude, then Codex). If all providers are temporarily unavailable with retryable/limit-style failures, the endpoint must still return a deterministic runnable WorkflowDefinition fallback rather than a generic 500.
- FR-V3-20: The frontend must display a "Scaffolding AI..." animation while the scaffold job is running, then animate each new node onto the canvas with an 80ms staggered delay per node.

**Canvas (React Flow v12)**
- FR-V3-21: The canvas must use `@xyflow/react` v12 (package name `@xyflow/react`). Canvas state (nodes, edges, viewport) must use React Flow's internal state management with immutable updates.
- FR-V3-22: Agent execution state (status, handoff count, last output snippet) must be stored in a separate Zustand `ExecutionStore` completely independent from canvas state and from `AppContext`. The canvas must NOT re-render on every PTY output byte — only on status changes.
- FR-V3-23: Department nodes must use `parentId` field (React Flow v12 group nodes). Expand/collapse must toggle `hidden: true/false` on child nodes using immutable updates.
- FR-V3-24: Double-clicking a department node must drill into it, updating `focusedDepartmentId` state and filtering the canvas via `useMemo` to show only nodes within that department. A breadcrumb bar must display the current drill path (Home > Department > Sub-department).
- FR-V3-25: The canvas must always remain editable — adding, moving, and connecting nodes must work during execution. There is no read-only lock during execution.
- FR-V3-26: AgentNode must display: agent label, current status via border color (idle: gray, running: blue animated pulse, done: green, error: red), a micro PTY log showing the last 3 lines of PTY output, and the total handoff count for that node.
- FR-V3-27: HandoffEdge must display a `[xN]` badge showing the handoff count for that edge. When a handoff event fires, the edge must animate (CSS keyframe light pulse) for 800ms.
- FR-V3-28: TriggerNode must display: trigger type icon (webhook or RSS), the configured path or URL, and current status (waiting/firing).

**HITL (Human-in-the-Loop)**
- FR-V3-29: HITL inbox must expose: `GET /api/v1/inbox`, `GET /api/v1/inbox/:executionId`, `POST /api/v1/inbox/:itemId/approve`, `POST /api/v1/inbox/:itemId/reject`.
- FR-V3-30: When an agent is paused for HITL, SwarmEngine must freeze that agent's PTY input (not kill it). On approve, the approved text must be injected and the agent must resume through the canonical unfreeze path. On reject, explicit rejection guidance must be injected and the agent must likewise resume through the canonical unfreeze path.
- FR-V3-31: The HITL inbox UI must show all pending items with Approve and Reject buttons, the agent label, the pending action text, and timestamp.

**PTY Live Injection and PTY Explosion**
- FR-V3-32: PTY Explosion must allow any agent node to be clicked and expanded into a full-screen xterm.js terminal (reusing the existing `Terminal.jsx` component). This gives the user direct keyboard access to that agent's PTY session. Physical keyboard input works correctly with no special handling.
- FR-V3-33: Programmatic PTY injection (soft broadcast and HITL approval injection) must use the Ink-compatible sequence: `\x03` (Ctrl+C) + 300ms delay + text + `\x1b` + `\r`. Total latency budget: approximately 700ms. This is required because Claude Code's Ink library does not respond to plain `\r` or `\n` for prompt submission.
- FR-V3-34: Two injection modes must be supported: `soft` (queued injection — agent processes after current task) and `hard` (immediate interrupt attempt — `\x03` + inject; unreliable during active tool execution, must be documented as best-effort).

**Broadcast**
- FR-V3-35: `POST /api/v1/swarm/:executionId/broadcast` must accept `{ text, scope: "all" | "department" | "agent", targetId?, mode }`, resolve recipients according to workflow structure, and return `{ sent, scope, targetId, recipientNodeIds }` so QA can verify the actual targets.
- FR-V3-36: The BroadcastBar UI component must allow the user to type a message and select scope (All Agents / Department / Specific Agent) before sending.

**Triggers**
- FR-V3-37: TriggerManager must support two trigger types: `webhook` (dynamic HTTP endpoint registered at runtime at `/api/v1/triggers/webhooks/:path`) and `rss` (polling via `setInterval`, configurable interval, minimum 60 seconds).
- FR-V3-38: On trigger fire, TriggerManager must inject the trigger payload as context into the target agent's PTY using soft injection mode.
- FR-V3-39: Webhook body size must be capped at 32 KB. Payloads exceeding this limit must return HTTP 413 and must NOT be passed to any PTY. (SEC-V3-01)
- FR-V3-40: Webhook endpoint must have a separate rate limiter of 10 requests per minute per source IP, independent of the main 200 req/min limiter. (SEC-V3-04)
- FR-V3-41: RSS and webhook URLs must be validated against a private IP blocklist before any network request or dynamic endpoint registration. Blocked ranges: `127.x.x.x`, `10.x.x.x`, `172.16.x.x–172.31.x.x`, `192.168.x.x`, `::1`. Any URL resolving to these ranges must return HTTP 400. (SEC-V3-03)

**WebSocket**
- FR-V3-42: The existing `wss` WebSocket server must gain a new channel `channel=swarm`. All swarm runtime events must be delivered over this channel. The existing `channel=terminal` behavior must remain unchanged.
- FR-V3-43: SwarmHandler must emit these event types: `agent_status`, `handoff_started`, `handoff_completed`, `circuit_breaker`, `inbox_item`, `execution_status`, `budget_update`.

**Swarm Execution API**
- FR-V3-44: Swarm execution control endpoints: `POST /api/v1/swarm/:workflowId/start`, `POST /api/v1/swarm/:workflowId/pause`, `POST /api/v1/swarm/:workflowId/resume`, `DELETE /api/v1/swarm/:workflowId`, `GET /api/v1/swarm/:workflowId/status`, `GET /api/v1/swarm/:executionId/agent/:nodeId/output`.

**InterAgentFeed**
- FR-V3-45: The InterAgentFeed panel must display a real-time chronological log of all inter-agent handoff events: source agent, target agent, context update preview, and timestamp. It must be updated via WebSocket without polling.

**V2 Backward Compatibility**
- FR-V3-46: All existing V2 API routes (`/api/v1/projects`, `/api/v1/sessions`, `/api/v1/agents`, `/api/v1/skills`, `/api/v1/claudemd`, `/api/v1/jobs`) must continue to function without modification. V3 adds new routes; it does not replace or break existing ones.
- FR-V3-47: All existing V2 frontend views (ProjectsView, TerminalView, JobView, DeploymentManagerView, ContextEditorView) must remain accessible via sidebar navigation. The new SwarmView is additive.

### Should Have (V3.1)

- FR-V3-48: Workflow version history — store previous versions of WorkflowDefinition on each PUT, accessible via `GET /api/v1/workflows/:id/versions`.
- FR-V3-49: Agent output export — download full PTY session log for any agent as a `.txt` file.
- FR-V3-50: Canvas minimap — React Flow built-in `<MiniMap>` component for large workflows (over 15 nodes).
- FR-V3-51: Workflow templates library — pre-built WorkflowDefinitions for common patterns (content agency, code review chain, research loop).
- FR-V3-52: RSS trigger deduplication — track seen item GUIDs to avoid re-triggering on repeated poll of the same feed.

### Won't Have (explicitly out of scope for V3.0)

- Direct Anthropic API calls — reason: all Claude invocations must go through the `claude` CLI binary. This is a hard architectural constraint, not a preference.
- Multi-user or cloud deployment — reason: localhost-only is a core security constraint (DEC-002). Adding multi-user would require a full auth redesign.
- Agent-to-agent direct TCP/WebSocket communication — reason: all communication goes through the SwarmEngine stdout token protocol. Direct inter-agent networking would bypass the audit trail.
- Persistent execution history across server restarts — reason: deferred to V3.1. Execution state lives in memory.
- Workflow scheduling (cron) — reason: deferred to V3.1. Triggers cover webhook and RSS only for V3.0.
- Git integration in swarm view — reason: out of scope for V2 and V3.
- Mobile browser support — reason: React Flow canvas requires pointer events and precise layout not suitable for mobile.

---

## 5. Non-Functional Requirements

- **Performance:** React Flow canvas must render 50 nodes at under 100ms frame time. Agent status updates via WebSocket must reach the UI within 200ms of the PTY event. Prompt-to-Flow scaffold response must begin streaming within 2 seconds.
- **Security:** All 7 SEC-V3-* requirements must be implemented before release (see Section 10 for full list). Server must continue to bind exclusively to 127.0.0.1. No user data, prompts, or PTY content may be logged to stdout or persisted outside the designated CONFIG_DIR.
- **Compatibility:** Node.js 20 LTS. Windows 11 23H2 or later (ConPTY requirement for PTY). The `claude` CLI binary must be present and auto-detectable via PATH or `%LOCALAPPDATA%\AnthropicClaude\claude.exe`. React 18, `@xyflow/react` v12, Zustand (new dependency for ExecutionStore).
- **Scalability:** Designed for single-user localhost. Maximum supported simultaneous agents in one execution: 50 (enforced by WorkflowDefinition schema validation FR-V3-03). Maximum simultaneous workflow executions: not formally capped in V3.0 but expected to be 3–5 based on PTY resource constraints.
- **Reliability:** A crash or exception in any single agent's PTY handler must NOT crash the SwarmEngine or affect other agents. Each agent's PTY and HandoffParser must be isolated. Errors must be caught, logged to the execution event stream, and set that node's status to `error`.
- **Build:** V3 must pass `npm run build` (Vite) with 0 errors. All 110 existing V2 tests must continue to pass (`npm test`). New services must have corresponding unit tests covering HandoffParser token splitting, CircuitBreaker threshold, BudgetTracker estimation, and WorkflowStore CRUD.

---

## 6. Technical Constraints

- NEVER use `shell: true` in any `spawn()` or `exec()` call — SEC-02, enforced project-wide. All new V3 spawn calls (SwarmEngine PTY spawn, TriggerManager RSS fetch) must use `shell: false`.
- NEVER use `fs.writeFile` directly for any config, workflow, agent, or skill file — use `write-file-atomic` (the correct npm package name, confirmed in DEC-001 revision). WorkflowStore must follow the same atomic write pattern as ConfigStore.
- ALWAYS validate file paths with `path.resolve()` + prefix assertion before any write. WorkflowStore path validation: resolved path must begin with `CONFIG_DIR/workflows/`.
- PTY `onData` handler must NEVER be removed from SessionManager sessions — DEC-009 (ConPTY deadlock prevention on Windows). SwarmEngine taps output via `session.swarmListeners` Set, not by replacing `onData`.
- `child.stdin.end()` must be called immediately after every job spawn in JobRunner (DEC-005, GitHub #7497). This constraint applies to Prompt-to-Flow scaffold jobs. It does NOT apply to interactive PTY sessions spawned by SwarmEngine.
- All REST endpoints under `/api/v1/`. CSRF header `X-Requested-With: ClaudeCodeManager` required on all mutating requests (existing middleware covers this automatically for new routes mounted on the existing app).
- Workflow IDs: server-generated UUIDs only (uuid v4). Client-supplied IDs must be ignored on POST.
- Zero direct Anthropic API calls. All Claude invocations must use the `claude` CLI binary via `node-pty` (interactive PTY sessions) or `child_process.spawn` (job mode for scaffold). The SwarmEngine must never import or call the Anthropic SDK.
- `@xyflow/react` v12 must be used for the canvas (user decision). The package name is `@xyflow/react`, not the older `reactflow`.
- Zustand must be used for ExecutionStore (canvas execution state). AppContext must remain unchanged — Zustand store is additive, not a replacement.
- Webhook local trust: for V3.0, webhook endpoints trust all requests from 127.0.0.1 without additional auth tokens. A security note (SEC-V3-NOTE-01) must be added to SECURITY_AUDIT.md acknowledging this as a known postilla for V3.1.

---

## 7. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                                           │
│                                                                     │
│  ┌────────────┐  ┌──────────────────────────────────────────────┐  │
│  │  Sidebar   │  │  SwarmView                                   │  │
│  │  (V2 nav + │  │  ┌─────────────────┐  ┌──────────────────┐  │  │
│  │   Swarm)   │  │  │  SwarmCanvas    │  │  AgentInspector  │  │  │
│  │            │  │  │  (React Flow    │  │  InterAgentFeed  │  │  │
│  │            │  │  │   v12)          │  │  HitlInbox       │  │  │
│  │            │  │  │  AgentNode      │  └──────────────────┘  │  │
│  │            │  │  │  DepartmentNode │                         │  │
│  │            │  │  │  TriggerNode    │  ┌──────────────────┐  │  │
│  │            │  │  │  HandoffEdge    │  │  BroadcastBar    │  │  │
│  │            │  │  └─────────────────┘  │  PromptToFlow    │  │  │
│  └────────────┘  │  BreadcrumbBar        │  Bar             │  │  │
│                  └──────────────────────────────────────────┘  │  │
│                                                                     │
│  Zustand ExecutionStore (separate from AppContext)                  │
│  useSwarm hook → WS channel=swarm                                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP + WebSocket (127.0.0.1:3000)
┌───────────────────────────────▼─────────────────────────────────────┐
│  Express Server                                                     │
│                                                                     │
│  New routes:  /api/v1/workflows  /api/v1/swarm  /api/v1/inbox       │
│               /api/v1/triggers                                      │
│  Existing:    /api/v1/projects  /api/v1/sessions  /api/v1/agents    │
│               /api/v1/skills  /api/v1/claudemd  /api/v1/jobs        │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  SwarmEngine    │  │ WorkflowStore│  │  TriggerManager        │ │
│  │  - executions   │  │ (JSON on     │  │  (webhook endpoints    │ │
│  │    Map          │  │  disk, atomic│  │   + RSS polling)       │ │
│  │  - HandoffParser│  │  writes)     │  └────────────────────────┘ │
│  │  - CircuitBreaker│ └──────────────┘  ┌────────────────────────┐ │
│  │  - BudgetTracker│                    │  WS swarmHandler       │ │
│  └────────┬────────┘                    │  (channel=swarm)       │ │
│           │ taps via swarmListeners Set └────────────────────────┘ │
│  ┌────────▼────────────────────────────────────────────────────┐   │
│  │  SessionManager (V2, UNCHANGED)                              │   │
│  │  - PTY sessions Map                                          │   │
│  │  - permanent pty.onData (never removed — DEC-009)           │   │
│  │  - session.swarmListeners Set (new tap point for V3)        │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  node-pty processes (one per agent per execution)          │   │
│  │  each spawning: claude CLI binary via PTY                  │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Data Model

### WorkflowDefinition
- `id`: UUID (server-generated)
- `name`: string (max 128 chars, `^[a-zA-Z0-9 _\-]+$`)
- `description`: string (max 512 chars)
- `projectId`: UUID (reference to V2 project)
- `nodes`: array of NodeDefinition
- `edges`: array of EdgeDefinition
- `settings`: WorkflowSettings
- `initialContext`: flat dict `{ [key: string]: string }`
- `createdAt`: ISO 8601
- `updatedAt`: ISO 8601

### NodeDefinition
- `id`: string (user-defined slug, `^[a-z][a-z0-9-]*$`)
- `type`: `"agent"` | `"department"` | `"trigger"`
- `position`: `{ x: number, y: number }`
- `data`: AgentData | DepartmentData | TriggerData

### AgentData
- `label`: string
- `systemPrompt`: string (max 16 KB — SEC-V3-02)
- `model`: string (e.g. `"claude-sonnet-4-6"`)
- `tools`: array of string
- `isTriageNode`: boolean (triage = first agent to receive initial context)
- `maxTurns`: number
- `parentDepartmentId`: string | null

### DepartmentData
- `label`: string
- `color`: string (hex)
- `collapsed`: boolean

### TriggerData
- `label`: string
- `triggerType`: `"webhook"` | `"rss"`
- `webhookPath`: string | null (for webhook type)
- `rssUrl`: string | null (for rss type)
- `pollIntervalSeconds`: number (minimum 60)
- `targetNodeId`: string

### EdgeDefinition
- `id`: string
- `source`: string (nodeId)
- `target`: string (nodeId)
- `type`: `"handoff"`
- `data.circuitBreakerThreshold`: number | null

### WorkflowSettings
- `mode`: `"autonomous"` | `"hitl"`
- `budgetTokens`: number
- `circuitBreakerThreshold`: number (default 10)
- `defaultModel`: string

### ExecutionState (in-memory only, not persisted)
- `executionId`: UUID
- `workflowId`: UUID
- `status`: `"running"` | `"paused"` | `"stopped"` | `"error"`
- `workflowContext`: flat dict `{ [key: string]: string }`
- `agents`: Map of `nodeId` → AgentRuntime
- `startedAt`: ISO 8601

### AgentRuntime (in-memory)
- `nodeId`: string
- `pty`: node-pty IPty instance
- `handoffParser`: HandoffParser instance
- `status`: `"idle"` | `"running"` | `"waiting_hitl"` | `"done"` | `"error"`
- `handoffCount`: number
- `lastOutputSnippet`: string (last 3 lines)

### InboxItem
- `id`: UUID
- `executionId`: UUID
- `nodeId`: string
- `agentLabel`: string
- `pendingText`: string (max 8 KB — SEC-V3-05)
- `status`: `"pending"` | `"approved"` | `"rejected"`
- `createdAt`: ISO 8601

---

## 9. API Surface

### Workflow CRUD
```
GET    /api/v1/workflows
       Response: { workflows: WorkflowDefinition[] }

POST   /api/v1/workflows
       Body: Partial<WorkflowDefinition> (id ignored — server-generated)
       Response: WorkflowDefinition

GET    /api/v1/workflows/:id
       Response: WorkflowDefinition | 404

PUT    /api/v1/workflows/:id
       Body: Partial<WorkflowDefinition>
       Response: WorkflowDefinition | 400 (validation) | 404

DELETE /api/v1/workflows/:id
       Response: 204 | 404
```

### Swarm Execution
```
POST   /api/v1/swarm/:workflowId/start
       Body: { initialContext?: object }
       Response: { executionId: string }

POST   /api/v1/swarm/:workflowId/pause
       Response: 200

POST   /api/v1/swarm/:workflowId/resume
       Response: 200

DELETE /api/v1/swarm/:workflowId
       Response: 204 (kills all PTYs, clears execution)

GET    /api/v1/swarm/:workflowId/status
       Response: ExecutionState (status, workflowContext, per-agent status)

POST   /api/v1/swarm/scaffold
       Body: { description: string }
       Response: WorkflowDefinition (streamed via SSE)

POST   /api/v1/swarm/:executionId/broadcast
       Body: { text: string, scope: "all"|"department"|"agent", targetId?: string }
       Response: { sent: number, scope: string, targetId: string|null, recipientNodeIds: string[] }

GET    /api/v1/swarm/:executionId/agent/:nodeId/output
       Response: { output: string } (last 100 lines of PTY output)
```

### HITL Inbox
```
GET    /api/v1/inbox
       Response: { items: InboxItem[] }

GET    /api/v1/inbox/:executionId
       Response: { items: InboxItem[] }

POST   /api/v1/inbox/:itemId/approve
       Body: { approvedText?: string }
       Response: 200

POST   /api/v1/inbox/:itemId/reject
       Body: { reason?: string }
       Response: 200
```

### Triggers
```
GET    /api/v1/triggers
       Response: { triggers: TriggerData[] }

POST   /api/v1/triggers/webhooks/:path
       Body: any (max 32 KB — SEC-V3-01)
       Response: 200 | 413 (body too large) | 429 (rate limited)
```

### WebSocket Events (channel=swarm)
All events delivered as JSON frames on the WebSocket connection with `channel: "swarm"`.
```
{ type: "agent_status", nodeId, status, sessionId, lastOutputSnippet }
{ type: "handoff_started", sourceNodeId, targetNodeId, edgeId, counter }
{ type: "handoff_completed", sourceNodeId, targetNodeId }
{ type: "circuit_breaker", edgeId, counter, threshold }
{ type: "inbox_item", item: InboxItem }
{ type: "execution_status", status }
{ type: "budget_update", estimatedTokensUsed, limitTokens }
```

---

## 10. UX Flow

### Main Flow: Building and Running a Workflow

1. User opens the app (localhost:3000). The V2 sidebar is visible with all existing views plus a new "Swarm" item.
2. User clicks "Swarm" in the sidebar. SwarmView opens with an empty React Flow canvas and a PromptToFlowBar at the top.
3. **Option A — Prompt-to-Flow:** User types a workflow description (e.g. "Content agency with copywriter, editor, SEO reviewer, and publisher") and presses Enter. The PromptToFlowBar shows "Scaffolding AI..." animation. Nodes appear on canvas with 80ms staggered animation.
4. **Option B — Manual build:** User right-clicks canvas → "Add Agent". A modal appears where they can either (a) create from scratch (enter label, system prompt, model, tools) or (b) select from existing `.claude/agents/` in the active project directory. Department nodes are created similarly.
5. User draws edges between nodes by dragging from one node's output handle to another node's input handle. Each edge is a handoff.
6. User double-clicks a department node to drill into it. BreadcrumbBar updates: "Home > Marketing Dept". User adds agents inside the department, then clicks "Home" in the breadcrumb to return to top level.
7. User opens AgentInspector (right panel) by clicking an agent node. They review and edit the system prompt, model selection, tool list, and maxTurns.
8. User clicks "Run Workflow". SwarmEngine starts, spawns PTYs for each agent, injects system prompts. Triage node receives the initial context.
9. Canvas animates: the triage node's border pulses blue. When it emits `__HANDOFF__:target-id:base64payload`, the source edge pulses with a light animation, the badge shows `[x1]`, and the target node's border turns blue.
10. InterAgentFeed panel (right side) shows: "Copywriter → Editor: { topic: 'AI trends', draft_complete: true }".
11. If `__DONE__` is received from any agent, a soft toast notification appears: "Agent 'Copywriter' signaled done". Workflow continues.
12. If circuit breaker fires (edge hits threshold), a warning toast appears. Workflow continues.
13. If budget soft-warn fires, a banner appears at the top of SwarmView: "Estimated tokens used: 85,000 / 100,000". Workflow continues.
14. **HITL flow:** In HITL mode, when an agent is ready to act, it emits an inbox item. HitlInbox panel shows: "Editor wants to publish draft: [preview]". User clicks Approve or Reject. On approve, text is injected into the agent's PTY via the Ink-compatible sequence.
15. **PTY Explosion:** User clicks a running agent node and selects "Open Terminal". Terminal.jsx opens fullscreen, connected to that agent's PTY. User types directly. User presses Escape or clicks X to close.
16. **Broadcast:** User opens BroadcastBar, types "Focus on brevity", selects scope "All Agents", and clicks Send. Text is injected into all running agents via soft injection.
17. User clicks Stop. All PTYs are killed via tree-kill. Canvas nodes return to idle state.

### Trigger Flow

1. User adds a TriggerNode to the canvas and connects it to an agent node with a handoff edge.
2. User opens TriggerNode inspector: selects type "webhook", enters path `/my-hook`.
3. On workflow start, TriggerManager dynamically registers `POST /api/v1/triggers/webhooks/my-hook`.
4. An external tool posts to that endpoint. TriggerManager receives the body (validated, max 32 KB), and injects it as context into the connected agent's PTY.
5. The connected agent node animates on canvas and processing begins.

---

## 11. Open Questions

1. **Scaffold AI model:** Which model should `POST /api/v1/swarm/scaffold` use for the prompt-to-flow generation job? Assumption: the user's default model configured in Claude Code settings. Architect should confirm whether a hardcoded model is preferable for reliability.
2. **Workflow-to-project binding:** The WorkflowDefinition includes a `projectId` field. Should workflows be strictly scoped to a single project, or should they be global (usable across projects)? Current assumption: scoped to projectId for file system coherence, but the store does not enforce this filter server-side in V3.0.
3. **Agent PTY spawn flags:** Should each agent PTY inherit the project's working directory from the V2 project record, or use a separate configurable CWD? Assumption: inherit the registered project's path.
4. **RSS authentication:** RSS feeds behind HTTP auth are out of scope for V3.0. Should TriggerManager throw a clear error or silently skip authenticated feeds?
5. **Zustand version:** What Zustand version should be installed? Latest (v5) changes the store API significantly from v4. Architect should specify version to avoid breaking changes during implementation.
6. **`swarmListeners` Set contract:** The `session.swarmListeners` Set is described as a tap point on SessionManager, but SessionManager (V2) does not currently have this field. The backend-dev implementing SwarmEngine must add this field to SessionManager non-destructively. This is a V2 file modification; it must be done carefully to avoid breaking V2 tests.

---

## 12. Out of Scope

- Direct Anthropic API SDK calls or API key configuration — all Claude invocations via `claude` binary only.
- Cloud, remote, or multi-user deployment — localhost-only architecture.
- Agent-to-agent TCP/WebSocket networking — all communication through SwarmEngine stdout token protocol.
- Persistent execution history across server restarts — in-memory only in V3.0.
- Workflow cron scheduling — deferred to V3.1.
- Workflow version history — deferred to V3.1.
- Canvas export to image/PDF — not planned.
- Mobile browser support — React Flow canvas requires desktop pointer events.
- Git integration in the swarm canvas — out of scope for V2 and V3.
- Authentication, API keys, or access control — localhost trust model.
- Electron or Tauri packaging — web app only.
- MCP server configuration editor — read-only display remains as-is from V2.

---

## Appendix A: Security Requirements (SEC-V3-*)

All seven requirements are mandatory and must be implemented and verified before the V3.0 release tag.

| ID | Requirement | Implementation location |
|----|-------------|------------------------|
| SEC-V3-01 | Webhook body size cap: 32 KB maximum. Payloads over this limit must return HTTP 413 and must NOT be forwarded to any PTY. | `server/routes/triggers.js` — `express.json({ limit: '32kb' })` |
| SEC-V3-02 | WorkflowDefinition schema validation: systemPrompt max 16 KB per node, node count max 50, all string fields validated. HTTP 400 on any violation. Must run on every POST and PUT to `/api/v1/workflows`. | `server/services/WorkflowStore.js` — `validateWorkflow()` |
| SEC-V3-03 | SSRF prevention: RSS URLs and webhook source URLs must be checked against a private IP blocklist before any outbound request or dynamic endpoint registration. Blocked: 127.x, 10.x, 172.16-31.x, 192.168.x, ::1. Return HTTP 400 on match. | `server/services/TriggerManager.js` — `isSafeUrl()` |
| SEC-V3-04 | Webhook rate limiter: 10 requests per minute per source IP on the `/api/v1/triggers/webhooks/*` path. Separate from and stricter than the main 200 req/min limiter. Return HTTP 429 on breach. | `server/routes/triggers.js` — dedicated rate limiter middleware |
| SEC-V3-05 | HITL resume text size cap: approved text injected via PTY must not exceed 8 KB. Text exceeding this must return HTTP 400 at the inbox approve endpoint before any PTY injection. | `server/routes/inbox.js` — length check on `approvedText` |
| SEC-V3-06 | Workflow name/description length caps: name max 128 chars, description max 512 chars. Character whitelist for name: `^[a-zA-Z0-9 _\-]+$`. Enforced server-side in `validateWorkflow()`. HTTP 400 on violation. | `server/services/WorkflowStore.js` — `validateWorkflow()` |
| SEC-V3-07 | HandoffParser payload cap: base64 payload accumulation must stop and flush (discard) at 4 KB. The extracted `contextUpdate` JSON must be schema-validated (flat dict, string keys, string values only) before being merged into `workflowContext`. Any non-conforming payload is dropped with a warning log. | `server/services/HandoffParser.js` + `server/services/SwarmEngine.js` — merge guard |

**SEC-V3-NOTE-01 (known postilla):** Webhook endpoints in V3.0 trust all requests from the localhost interface without additional auth tokens. This is an accepted risk for a localhost-only tool and will be revisited in V3.1 with optional shared-secret header validation.

---

## Appendix B: Implementation Phase Plan

### Phase 1 — Backend Foundation
1. `server/services/WorkflowStore.js` — CRUD, atomic writes, path validation, `validateWorkflow()`
2. `server/routes/workflows.js` — REST CRUD, mounted at `/api/v1/workflows`
3. `server/services/HandoffParser.js` — rolling 4 KB accumulator, three-state FSM, ANSI strip
4. `server/services/SwarmEngine.js` — skeleton: execution Map, spawn agent PTY, tap `swarmListeners`, handoff loop
5. `server/routes/swarm.js` — execution control endpoints
6. `server/ws/swarmHandler.js` — WS channel=swarm event dispatch

### Phase 2 — Canvas Static (no execution)
1. `npm install @xyflow/react zustand` in `client/`
2. `client/src/store/SwarmContext.jsx` — Zustand ExecutionStore
3. `client/src/canvas/SwarmCanvas.jsx` + custom nodes (`AgentNode`, `DepartmentNode`, `TriggerNode`) + `HandoffEdge`
4. `client/src/panels/AgentInspector.jsx`
5. `client/src/canvas/overlays/BreadcrumbBar.jsx`
6. `client/src/views/SwarmView.jsx` — full layout assembly
7. `client/src/App.jsx` + Sidebar — add "swarm" view entry

### Phase 3 — Prompt-to-Flow
1. `POST /api/v1/swarm/scaffold` backend (JobRunner call, JSON extraction from stdout, SSE streaming)
2. `client/src/canvas/overlays/PromptToFlowBar.jsx` — input + "Scaffolding AI..." animation
3. Canvas ingestion: JSON → React Flow nodes with 80ms staggered animation

### Phase 4 — Live Execution
1. `server/services/CircuitBreaker.js` — edge count tracking, threshold emit
2. `server/services/BudgetTracker.js` — char-count estimation, soft-warn emit
3. `server/services/SwarmEngine.js` — completion: handoff loop, circuit breaker integration, budget integration
4. `client/src/hooks/useSwarm.js` — WS connection, dispatch to SwarmContext
5. `client/src/hooks/useHandoff.js` — CSS keyframe edge animations
6. `AgentNode.jsx` — blinking border, micro PTY log, status color system
7. `client/src/canvas/overlays/BroadcastBar.jsx` + broadcast route

### Phase 5 — HITL + PTY Explosion
1. `server/routes/inbox.js` — HITL inbox CRUD + approve/reject with PTY injection
2. SwarmEngine freeze/unfreeze agent on HITL transition
3. PTY Explosion: click agent node → `Terminal.jsx` fullscreen overlay
4. `client/src/panels/InterAgentFeed.jsx` — real-time handoff event log
5. `client/src/hooks/useInbox.js` — WS/polling HITL notification

### Phase 6 — Trigger Nodes
1. `server/services/TriggerManager.js` — dynamic webhook registration + RSS polling + SSRF guard
2. `server/routes/triggers.js` — webhook endpoints + rate limiter + body size cap
3. `client/src/canvas/nodes/TriggerNode.jsx` — visual + status display

---

## Section 11 — Component Specifications (Swarm V3)

This section is the authoritative single source of truth for every Swarm component's inputs, outputs, behavior, and contracts. All TEST GATE tasks must use these specs to derive their acceptance criteria. All bug reports must compare actual behavior to the spec below.

---

### SwarmEngine
**File:** `server/services/SwarmEngine.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Central orchestration engine — manages the lifecycle of all workflow executions, spawns agent PTYs, routes handoffs, tracks budget, and broadcasts WS events.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| sessionManager | SessionManager instance | yes | V2 session manager; used to create, write to, and kill PTY sessions |
| workflowStore | WorkflowStore instance | yes | Used to load workflow definitions by ID |
| circuitBreaker | CircuitBreaker instance | no | Optional; if set, checked on every handoff |
| budgetTracker | BudgetTracker instance | no | Optional; if set, tracks token estimates and emits budget_update |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| executionId | string (UUID) | Returned by startExecution(); identifies the running execution |
| WS event: agent_status | `{ type: 'agent_status', nodeId: string, status: string }` | Emitted when any agent changes status |
| WS event: handoff_started | `{ type: 'handoff_started', sourceNodeId: string, targetNodeId: string, edgeId: string, counter: number }` | Emitted on each handoff |
| WS event: circuit_breaker | `{ type: 'circuit_breaker', edgeId: string, counter: number, threshold: number }` | Emitted when circuit breaker threshold is reached |
| WS event: budget_update | `{ type: 'budget_update', estimatedTokensUsed: number, limitTokens: number }` | Emitted when budget limit is exceeded |
| WS event: execution_status | `{ type: 'execution_status', status: string, nodeId: string }` | Emitted when an agent signals `__DONE__` |
| WS event: hitl_required | `{ type: 'hitl_required', nodeId: string, item: object }` | Emitted when freezeAgent() is called |

**Behavior (step by step):**
1. `startExecution(workflowId, projectId, projectPath)`: loads workflow from WorkflowStore, generates executionId (UUID), builds execution record in-memory, finds triage node (first node with `isTriageNode === true`, or first node), spawns triage agent PTY via `_spawnAgentPty()`, starts heartbeat timer (5-minute interval writing empty string to keep PTYs alive).
2. `_spawnAgentPty(executionId, nodeId)`: resolves node from workflowDef, builds handoff target list from outgoing edges, calls `_buildSystemPrompt()`, creates PTY session via `sessionManager.createSession()`, registers session with BudgetTracker if available, creates `HandoffParser` instance, installs `tapFn` into `session.swarmListeners` Set, emits `agent_status` with status `'running'`.
3. `_buildSystemPrompt(node, workflowContext, handoffTargets)`: assembles prompt from node.data.systemPrompt, current workflowContext key-value pairs, handoff token format instructions, and valid target IDs.
4. `_onHandoff(executionId, sourceNodeId, event)`: merges contextUpdate into workflowContext, finds or synthesizes edgeId, increments edge counter, checks circuit breaker, increments source agent handoffCount, emits `handoff_started`, calls `_ensureAgentPty()` for target, injects updated context prompt into target PTY, sets source status to `'done'` and target status to `'running'`.
5. `_onDone(executionId, nodeId)`: sets agent status to `'done'`, emits `execution_status` with `status: 'agent_done'` and `nodeId`, emits `agent_status` with `status: 'done'`. Workflow does NOT stop.
6. `stopExecution(executionId)`: clears heartbeat, removes all swarm tap listeners, kills all agent PTY sessions, calls `triggerManager.cleanupExecution()` and `budgetTracker.clearExecution()`.
7. `pauseExecution(executionId)`: sets all `'running'` agents to `'paused'`, emits `agent_status` for each.
8. `resumeExecution(executionId)`: sets all `'paused'` agents to `'running'`, emits `agent_status` for each.
9. `freezeAgent(executionId, nodeId, inboxItem)`: sets agent to `'paused'`, appends item to `execution.inboxItems`, emits `hitl_required` and `agent_status`.
10. `unfreezeAgent(executionId, nodeId)`: sets agent to `'running'`, emits `agent_status`.
11. `getStatus(executionId)`: returns `{ executionId, workflowId, status, agentStates: Object.fromEntries(...), edgeCounters: Object.fromEntries(...), budget }` — reads real budget from BudgetTracker.
12. `getExecution(executionId)`: returns raw execution object (for route-layer use only).

**Contracts with other components:**
- **Calls:** `sessionManager.createSession()`, `sessionManager.writeInput()`, `sessionManager.getSession()`, `sessionManager.killSession()`, `workflowStore.get()`, `budgetTracker.registerSession()`, `budgetTracker.track()`, `budgetTracker.checkBudget()`, `budgetTracker.getTotal()`, `budgetTracker.clearExecution()`, `triggerManager.cleanupExecution()`, `circuitBreaker.check()`
- **Called by:** `server/routes/swarm.js` (startExecution, stopExecution, pauseExecution, resumeExecution, getStatus, getExecution), `server/ws/swarmHandler.js` (getStatus on WS connect), `TriggerManager._fireTrigger()`
- **WS events EMITTED:** `{ type: 'agent_status', nodeId: string, status: string }` — NOTE: `sessionId` is NOT included in this event (see Known Issues); `{ type: 'handoff_started', sourceNodeId: string, targetNodeId: string, edgeId: string, counter: number }`; `{ type: 'circuit_breaker', edgeId: string, counter: number, threshold: number }`; `{ type: 'budget_update', estimatedTokensUsed: number, limitTokens: number }`; `{ type: 'execution_status', status: string, nodeId: string }`; `{ type: 'hitl_required', nodeId: string, item: object }`
- **WS events CONSUMED:** none (server-side only)
- **Store reads:** none (server-side service)
- **Store writes:** none (server-side service)

**Known issues:**
- BUG: `agent_status` events are emitted with `{ type, nodeId, status }` only — the `sessionId` field is absent. `useSwarm.js` calls `updateAgentState(msg.nodeId, { status: msg.status })` on this event, which does not set `agentState.sessionId`. As a result, `AgentInspector` can never display the "Open Terminal" button (which requires `agentState?.sessionId` to be truthy) via WS updates alone. The sessionId is only populated if the client independently fetches `/api/v1/swarm/:executionId/status`.
- RESOLVED 2026-04-02: `_onHandoff()` emits `handoff_completed` after the target agent is running, matching FR-V3-43 and the InterAgentFeed client contract.

**Acceptance Criteria:**
- [ ] `startExecution()` returns a UUID string and the triage agent's PTY emits output within 5 seconds
- [ ] Providing an unknown workflowId throws `Error('Workflow not found')`
- [ ] After `_onHandoff()`, `workflowContext` contains the merged keys from `contextUpdate`
- [ ] After `stopExecution()`, all agent PTY sessions are killed and the execution is removed from the internal Map
- [ ] `pauseExecution()` sets all running agents to `'paused'` and emits `agent_status` for each
- [ ] `resumeExecution()` sets all paused agents to `'running'` and emits `agent_status` for each
- [ ] `getStatus()` returns `budget.estimatedTokensUsed` as a number (not undefined)

---

### HandoffParser
**File:** `server/services/HandoffParser.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Stateful rolling-buffer token extractor that reconstructs `__HANDOFF__` and `__DONE__` tokens from arbitrarily chunked ConPTY output.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| rawChunk | string | yes | Raw PTY output chunk from `session.swarmListeners` tap — may contain ANSI escapes, CRLF, partial tokens |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| results array | `Array<{ type: 'handoff', targetId: string, contextUpdate: object } \| { type: 'done' }>` | Zero or more parsed events per call to `feed()` |

**Behavior (step by step):**
1. `feed(rawChunk)`: strips ANSI CSI, OSC, and other ESC sequences; normalizes `\r\n` and `\r` to `\n`; appends cleaned text to rolling buffer `_buf`.
2. Enforces 4 KB cap: if `_buf.length > 4096`, truncates to the last 4096 characters (SEC-V3-07).
3. Scans buffer with `HANDOFF_RE` regex (global flag, new instance per call to avoid lastIndex drift): for each match, base64-decodes capture group 2, JSON-parses the result, validates with `_validateContext()`. Valid payloads push `{ type: 'handoff', targetId, contextUpdate }` to results.
4. Scans buffer with `DONE_RE`; if matched, pushes `{ type: 'done' }`.
5. If any results were found, clears `_buf` to empty string.
6. Returns results array (may be empty).
7. `_validateContext(obj)`: accepts only plain objects (not arrays, not null), max 50 keys, values must be `string | number | boolean`, strings must be max 1024 chars.
8. `reset()`: clears `_buf`.

**Contracts with other components:**
- **Called by:** `SwarmEngine._spawnAgentPty()` — one HandoffParser instance is created per agent per execution; `tapFn` calls `parser.feed(chunk)` on every PTY output chunk
- **Calls:** none
- **WS events EMITTED:** none (pure parser — events returned to SwarmEngine for dispatch)
- **WS events CONSUMED:** none

**Acceptance Criteria:**
- [ ] A `__HANDOFF__:target-id:<valid_base64>` token split across 3 separate `feed()` calls is correctly parsed into a single `{ type: 'handoff', targetId: 'target-id', contextUpdate: {...} }` result
- [ ] A chunk containing ANSI color codes before the token still parses correctly
- [ ] A contextUpdate with 51 keys is rejected and `_validateContext()` returns false
- [ ] A contextUpdate with a string value exceeding 1024 chars is rejected
- [ ] Buffer overflow: feeding 8 KB of data without a token results in the buffer being capped at 4096 chars

---

### WorkflowStore
**File:** `server/services/WorkflowStore.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Persists workflow definitions as atomic JSON files under `CONFIG_DIR/workflows/<id>.json`. Provides full CRUD with schema validation and path-traversal protection.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| configDir | string (directory path) | yes | Constructor argument; workflows stored at `configDir/workflows/` |
| data (create/update) | object | yes | Workflow definition payload from route layer |
| id (get/update/delete) | string | yes | Workflow UUID |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| list() | WorkflowDefinition[] | All valid workflows in the store; returns [] on empty or error |
| get(id) | WorkflowDefinition \| null | Single workflow or null if not found |
| create(data) | WorkflowDefinition | Created workflow with server-generated UUID, timestamps |
| update(id, data) | WorkflowDefinition | Updated workflow with new updatedAt |
| delete(id) | boolean | true if deleted, false if not found |

**Behavior (step by step):**
1. `init()`: creates `workflows/` directory if it does not exist.
2. `create(data)`: calls `validate(data)`; on failure throws Error with `statusCode: 400`; generates UUID via `randomUUID()`; adds `createdAt` and `updatedAt` ISO timestamps; calls `_writeWorkflow()` using `write-file-atomic`.
3. `update(id, data)`: loads existing workflow via `get(id)`; if not found throws Error with `statusCode: 404`; validates; merges fields; calls `_writeWorkflow()`.
4. `validate(data)`: validates name (required, max 100 chars, `^[\w\s\-.]+$`), description (optional, max 500 chars), nodes (array, max 50 items, each with id matching `^[a-z][a-z0-9-]*$`, systemPrompt max 16384 chars). Returns `{ valid: boolean, errors: string[] }`.
5. `_resolveFilePath(id)`: returns null if id is empty, contains `/`, `\`, `..`, or `\0`; asserts resolved path starts with `workflowsDir + path.sep` (SEC-V3-06).

**Contracts with other components:**
- **Called by:** `SwarmEngine.startExecution()` (get), `server/routes/swarm.js` (create via scaffold), `server/routes/workflows.js` (full CRUD)
- **Calls:** `write-file-atomic` for all writes

**Acceptance Criteria:**
- [ ] `create()` with a node id of `"../evil"` returns a 400 validation error
- [ ] `create()` with more than 50 nodes returns a 400 validation error
- [ ] `create()` with a systemPrompt of 16385 characters returns a 400 validation error
- [ ] `get()` with id containing `..` returns null without throwing
- [ ] `delete()` returns false for a non-existent id
- [ ] Two concurrent `create()` calls do not produce a corrupted file (atomic write guarantee)

---

### TriggerManager
**File:** `server/services/TriggerManager.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Manages two trigger mechanisms — dynamic webhook path registration and RSS feed polling — that can start or inject into workflow executions on external events.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| swarmEngine | SwarmEngine instance | yes | Used to start executions and broadcast WS events on trigger fire |
| path (webhook) | string | yes | URL path suffix, e.g. `/hooks/my-hook` |
| workflowId | string | yes | Workflow to start when trigger fires |
| targetNodeId | string | yes | Target agent node for webhook registration |
| nodeId (RSS) | string | yes | Node ID owning the RSS poller |
| rssUrl | string | yes | URL of RSS/Atom feed (validated via `isSafeUrl()` — SEC-V3-03) |
| pollIntervalMs | number | no | Default 300000ms (5 minutes) |
| executionId | string \| null | no | Attach to running execution or null to start new one |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| handleWebhook() | `{ triggered: boolean, executionId?: string }` | Result of webhook processing |
| listTriggers() | `{ webhooks: object[], rssPollers: object[] }` | Current registrations |
| WS event: rss_item | `{ type: 'rss_item', nodeId: string, guid: string \| null }` | Emitted when a new RSS item is found and an execution is already running |

**Behavior (step by step):**
1. `registerWebhook(path, workflowId, targetNodeId)`: validates all three args; stores in `this.webhooks` Map.
2. `handleWebhook(path, payload)`: looks up registration; if not found returns `{ triggered: false }`; calls `swarmEngine.startExecution(workflowId, workflowId, '')` (note: projectId and projectPath are both set to workflowId and empty string respectively for webhook-triggered executions).
3. `createRssTrigger(nodeId, rssUrl, workflowId, pollIntervalMs, executionId)`: validates args; calls `isSafeUrl(rssUrl)` — throws if SSRF check fails; calls `removeTrigger(nodeId)` to clear any existing poller; runs first poll as seedOnly (sets `lastSeenGuid` without firing); starts `setInterval` for subsequent polls with `unref()`.
4. `_pollRss(nodeId, seedOnly)`: fetches feed with 15-second timeout and `User-Agent: ClaudeCodeManager/1.0 RSS-Poller`; parses `<item>` or `<entry>` elements; extracts GUID from `<guid>`, `<id>`, or `<link>`; on seedOnly sets `lastSeenGuid` and returns; on subsequent polls collects all items newer than `lastSeenGuid` and calls `_fireTrigger()` for each.
5. `_fireTrigger(nodeId, workflowId, executionId, item)`: if executionId is set, broadcasts `rss_item` WS event; if no executionId, calls `swarmEngine.startExecution()`.
6. `cleanupExecution(executionId)`: removes all pollers whose `executionId` matches or is null (prevents orphaned intervals after execution stop).

**Contracts with other components:**
- **Calls:** `swarmEngine.startExecution()`, `swarmEngine._wsBroadcast()` (directly — accesses private field), `isSafeUrl()` from `server/utils/ssrfGuard.js`
- **Called by:** `SwarmEngine.setTriggerManager()`, `SwarmEngine.stopExecution()` (cleanupExecution), `server/routes/triggers.js` (handleWebhook, registerWebhook, listTriggers), `server/index.js` (createRssTrigger on workflow load)
- **WS events EMITTED:** `{ type: 'rss_item', nodeId: string, guid: string | null }` (only when execution is already running)

**Acceptance Criteria:**
- [ ] `registerWebhook()` with an empty path throws an Error
- [ ] `createRssTrigger()` with a private IP URL (e.g. `http://192.168.1.1/feed.xml`) throws an SSRF guard error
- [ ] First RSS poll does not fire `_fireTrigger()` (seed-only behavior)
- [ ] Second RSS poll fires `_fireTrigger()` only for items whose GUID was not seen in the first poll
- [ ] After `cleanupExecution()`, the RSS poller interval is cleared and the poller is removed from `rssPollers` Map

---

### swarmRoutes (server/routes/swarm.js)
**File:** `server/routes/swarm.js`
**Type:** `route`
**Layer:** `server`
**Purpose:** Express router providing all swarm execution control REST endpoints plus the `POST /scaffold` AI-generated workflow endpoint.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| swarmEngine | SwarmEngine | yes | Factory function parameter |
| sessionManager | SessionManager | yes | Factory function parameter |
| claudeBin | string | yes | Path to the `claude` binary for scaffold generation |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| POST /scaffold | 201 `{ workflowId, workflowDef }` | AI-generated workflow saved to WorkflowStore |
| POST /:workflowId/start | 201 `{ executionId, status: 'running' }` | New execution started |
| POST /:executionId/pause | 200 `{ ok: true }` | All running agents paused |
| POST /:executionId/resume | 200 `{ ok: true }` | All paused agents resumed |
| DELETE /:executionId | 204 | Execution stopped and all PTYs killed |
| GET /:executionId/status | 200 `{ executionId, status, agentStates, edgeCounters, budget }` | Current execution snapshot |
| GET /:executionId/agent/:nodeId/output | 200 `{ output: string }` | PTY ring buffer contents |
| POST /:executionId/broadcast | 200 `{ sent: number }` | Number of agents that received the message |

**Behavior (step by step):**
1. `POST /scaffold`: validates `prompt` (required, non-empty, max 2000 chars); calls `generateWorkflowFromPrompt(claudeBin, prompt)` which spawns `claude -p <fullPrompt> --output-format json --max-turns 1 --no-session-persistence --allowedTools none` with `shell: false` and `child.stdin.end()` immediately (DEC-005); parses JSON from stdout; strips markdown fences; saves to WorkflowStore; returns `{ workflowId, workflowDef }`.
2. `POST /:workflowId/start`: validates `projectId` and `projectPath` from body; calls `swarmEngine.startExecution()`.
3. `POST /:executionId/pause`: sends `\x03` (Ctrl-C) to every running agent session, then calls `swarmEngine.pauseExecution()`.
4. `POST /:executionId/resume`: calls `swarmEngine.resumeExecution()`.
5. `DELETE /:executionId`: calls `swarmEngine.stopExecution()`; returns 204.
6. `GET /:executionId/status`: calls `swarmEngine.getStatus()`; returns 404 if null.
7. `GET /:executionId/agent/:nodeId/output`: resolves sessionId from agentStates, gets PTY session, returns `session.buffer.toString()`.
8. `POST /:executionId/broadcast`: collects running agent sessionIds filtered by `scope` (`'all'` or exact nodeId match); for `soft` mode sends `text + '\x1b\n'`; for `hard` mode sends `'\x03'` then after 300ms sends `text + '\x1b'` then after 100ms sends `'\n'`; returns `{ sent: count }`.

**Contracts with other components:**
- **Calls:** `swarmEngine.startExecution()`, `swarmEngine.stopExecution()`, `swarmEngine.pauseExecution()`, `swarmEngine.resumeExecution()`, `swarmEngine.getStatus()`, `sessionManager.writeInput()`, `sessionManager.getSession()`, `req.app.locals.workflowStore.create()`
- **Called by:** HTTP clients (frontend via `useSwarm.js`, `BroadcastBar.jsx`)

**Acceptance Criteria:**
- [ ] `POST /scaffold` with empty prompt returns 400
- [ ] `POST /scaffold` with prompt exceeding 2000 chars returns 400
- [ ] `POST /:workflowId/start` with missing `projectId` returns 400
- [ ] `POST /:workflowId/start` with non-existent workflowId returns 404
- [ ] `DELETE /:executionId` returns 204 even if executionId does not exist (stopExecution is idempotent)
- [ ] `POST /:executionId/broadcast` with `scope: 'all'` sends to all running agents; returns `{ sent: N }` where N equals the number of running agents

---

### swarmHandler (server/ws/swarmHandler.js)
**File:** `server/ws/swarmHandler.js`
**Type:** `ws-event`
**Layer:** `server`
**Purpose:** WebSocket connection handler for swarm execution subscriptions. Routes execution events to all open clients watching a given executionId.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| ws | WebSocket | yes | Incoming WebSocket connection |
| req | IncomingMessage | yes | HTTP upgrade request; `?executionId=<uuid>` expected in query string |
| swarmEngine | SwarmEngine | yes | Used to call `getStatus()` on initial connection |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| broadcast(executionId, event) | void | Sends JSON event to all OPEN subscribers for that executionId |
| getSubscribers(executionId) | Set\<WebSocket\> | Returns subscriber set (used by tests) |
| Initial WS message | `{ type: 'execution_status', executionId, workflowId, status, agentStates, edgeCounters, budget }` | Sent once on connection if execution exists |
| Error WS message | `{ type: 'error', message: string }` | Sent if executionId missing or URL malformed |

**Behavior (step by step):**
1. Parses `executionId` from `req.url` query string. On parse failure sends `{ type: 'error', message: 'Bad request URL' }` and closes.
2. If no `executionId`, sends `{ type: 'error', message: 'executionId required' }` and closes.
3. Adds `ws` to `_subscribers.get(executionId)` Set (creates Set if first subscriber).
4. On `ws.close`: removes `ws` from subscriber Set; deletes Set if empty.
5. On `ws.error`: logs error with executionId context; removes `ws` from subscriber Set.
6. Calls `swarmEngine.getStatus(executionId)`; if status exists, sends full status as `{ type: 'execution_status', ...status }`.
7. `broadcast(executionId, event)`: serializes event to JSON; iterates subscriber Set; sends to all sockets with `readyState === 1` (OPEN).

**Contracts with other components:**
- **Called by:** `server/index.js` (WS upgrade handler on `/ws/swarm` path), `SwarmEngine._wsBroadcast` (set via `setWsBroadcast()`)
- **Calls:** `swarmEngine.getStatus()`

**Acceptance Criteria:**
- [ ] WS connection without `?executionId` receives `{ type: 'error' }` and is closed
- [ ] WS connection with valid executionId receives `{ type: 'execution_status', ... }` immediately on connect
- [ ] After WS disconnect, the subscriber is removed and `getSubscribers(executionId)` no longer includes it
- [ ] `broadcast()` does not throw when called with an executionId that has zero subscribers

---

### SwarmContext (client/src/store/SwarmContext.jsx)
**File:** `client/src/store/SwarmContext.jsx`
**Type:** `store-action`
**Layer:** `client`
**Purpose:** Zustand store holding all client-side swarm execution state — execution identity, per-agent status, edge counters, budget, HITL inbox items, inter-agent feed events, canvas navigation, and workflow definition.

**Inputs (actions):**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| setExecution(id, status) | (string\|null, string) | — | Sets activeExecutionId and executionStatus |
| updateAgentState(nodeId, patch) | (string, object) | — | Shallow-merges patch into agentStates[nodeId] |
| updateTriggerState(triggerId, patch) | (string, object) | — | Shallow-merges patch into triggerStates[triggerId] |
| updateEdgeCounter(edgeId, count) | (string, number) | — | Sets edgeCounters[edgeId] = count |
| updateBudget(used, limit) | (number, number) | — | Sets budget.estimatedTokensUsed and limitTokens |
| addInboxItem(item) | object | — | Appends item to inboxItems array |
| resolveInboxItem(itemId) | string | — | Removes item by id from inboxItems |
| addFeedEvent(event) | object | — | Appends event to interAgentFeed, capped at 100 entries |
| setFocusedDepartment(id) | string\|null | — | Sets focusedDepartmentId and pushes to departmentStack |
| navigateBreadcrumb(index) | number | — | Slices departmentStack to index, updates focusedDepartmentId |
| setPaused() | — | — | Sets executionStatus to 'paused' |
| setResumed() | — | — | Sets executionStatus to 'running' |
| setSelectedNode(id) | string\|null | — | Sets selectedNodeId |
| setPtyExplosionNodeId(id) | string\|null | — | Sets ptyExplosionNodeId |
| setWsConnected(b) | boolean | — | Sets wsConnected flag |
| setWorkflowDef(def) | object\|null | — | Sets workflowDef (persists across navigation — BUG-SWARM-3 fix) |
| reset() | — | — | Resets all fields except workflowDef to initial values |

**Outputs / Emits (state shape):**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| activeExecutionId | string\|null | UUID of the currently running execution |
| executionStatus | 'idle'\|'running'\|'paused'\|'stopped' | Overall execution lifecycle status |
| agentStates | `{ [nodeId]: { status?, lastOutputSnippet?, handoffCount?, sessionId? } }` | Per-agent runtime state |
| triggerStates | `{ [triggerId]: { fired, lastFiredAt, status } }` | Trigger state (no WS events update this — see Known Issues) |
| edgeCounters | `{ [edgeId]: number }` | Handoff count per edge |
| budget | `{ estimatedTokensUsed: number, limitTokens: number }` | Token usage estimate |
| inboxItems | object[] | HITL pending approval items |
| interAgentFeed | object[] | Last 100 inter-agent events (handoffs, circuit breakers, etc.) |
| focusedDepartmentId | string\|null | Currently drilled-in department |
| departmentStack | string[] | Breadcrumb navigation stack |
| selectedNodeId | string\|null | Node selected in AgentInspector |
| ptyExplosionNodeId | string\|null | SessionId of the node whose PTY is shown full-screen |
| workflowDef | object\|null | Current workflow definition (survives navigation) |
| wsConnected | boolean | Whether the swarm WS is connected |

**Contracts with other components:**
- **Store reads:** `useSwarm.js`, `useInbox.js`, `SwarmView.jsx`, `SwarmCanvas.jsx`, `AgentNode.jsx`, `HandoffEdge.jsx`, `AgentInspector.jsx`, `BroadcastBar.jsx`, `InterAgentFeed.jsx`
- **Store writes:** `useSwarm.js` (setExecution, updateAgentState, updateEdgeCounter, updateBudget, addInboxItem, addFeedEvent, setWsConnected), `useInbox.js` (resolveInboxItem, setState direct for polling), `SwarmView.jsx` (setPaused, setResumed, reset, setWorkflowDef, setPtyExplosionNodeId), `SwarmCanvas.jsx` (setSelectedNode, setFocusedDepartment via child nodes), `AgentInspector.jsx` (setSelectedNode, setPtyExplosionNodeId)

**Known issues:**
- `triggerStates` is initialized in the store and `updateTriggerState` action exists, but no WS event handler in `useSwarm.js` updates it. The `trigger_fired` and `trigger_status` event types are not handled in the `ws.onmessage` switch. As a result, trigger nodes never reflect live status in the UI.

**Acceptance Criteria:**
- [ ] After `updateAgentState('node-1', { status: 'running' })`, `agentStates['node-1'].status === 'running'`
- [ ] After `addFeedEvent()` called 101 times, `interAgentFeed.length === 100`
- [ ] After `reset()`, `activeExecutionId === null` and `executionStatus === 'idle'`
- [ ] `workflowDef` is preserved after calling `reset()` — NOTE: current implementation does reset workflowDef in reset(); confirm desired behavior

---

### useSwarm
**File:** `client/src/hooks/useSwarm.js`
**Type:** `hook`
**Layer:** `client`
**Purpose:** Manages WebSocket connection to the swarm execution channel, dispatches incoming events to the Zustand store, and provides `startExecution` and `stopExecution` callbacks.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| workflowId | string\|undefined | yes (effective) | Workflow ID passed by SwarmView; if undefined, startExecution throws |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| startExecution(projectId, projectPath) | async function | POSTs to `/api/v1/swarm/:workflowId/start`, sets execution in store, connects WS |
| stopExecution(executionId) | async function | DELETEs execution, resets store, closes WS |
| connectWs(executionId) | function | Opens WebSocket at `/ws/swarm?executionId=<id>` |

**Behavior (step by step):**
1. `startExecution(projectId, projectPath)`: POSTs to `/api/v1/swarm/${workflowId}/start`; receives `{ executionId }`; calls `setExecution(executionId, 'running')`; calls `connectWs(executionId)`.
2. `connectWs(executionId)`: closes existing WS if open; creates `WebSocket` at `ws://host/ws/swarm?executionId=<id>`; sets `onopen` → `setWsConnected(true)`, `onclose/onerror` → `setWsConnected(false)`.
3. `ws.onmessage` dispatches on `msg.type`:
   - `'agent_status'` → `updateAgentState(msg.nodeId, { status: msg.status })`
   - `'handoff_started'` → `updateEdgeCounter(msg.edgeId, msg.counter)` + `addFeedEvent(...)` + increments source agent handoffCount via direct store state access
   - `'execution_status'` → `setExecution(msg.executionId ?? null, msg.status ?? 'running')`
   - `'budget_update'` → `updateBudget(msg.estimatedTokensUsed, msg.limitTokens)`
   - `'circuit_breaker'` → `addFeedEvent({ ...msg, timestamp: Date.now() })`
   - `'hitl_required'` → `addInboxItem(msg)`
   - all other types → ignored (default case)
4. `stopExecution(executionId)`: DELETEs `/api/v1/swarm/${executionId}`; calls `setExecution(null, 'stopped')`; closes WS.
5. Cleanup effect: closes and nulls `wsRef.current` when `workflowId` changes or component unmounts (BUG-TOOLBAR-2 fix).

**Known issues:**
- BUG: `'trigger_fired'` and `'trigger_status'` event types are not handled in the `onmessage` switch. They fall through to the `default` case and are silently ignored. As a result, `triggerStates` in the store is never updated from WS events.
- BUG: `'agent_status'` events from the server do not include `sessionId`. The handler only patches `{ status }`, so `agentState.sessionId` is never populated via WS. The "Open Terminal" button in AgentInspector requires `agentState?.sessionId` to be truthy.

**Acceptance Criteria:**
- [ ] After `startExecution()` succeeds, `activeExecutionId` in the store is a non-null UUID string
- [ ] After `stopExecution()`, `executionStatus === 'stopped'` and `activeExecutionId === null`
- [ ] On receiving `{ type: 'handoff_started', edgeId: 'e1', counter: 3, sourceNodeId: 'a', targetNodeId: 'b' }`, `edgeCounters['e1'] === 3` and `interAgentFeed` contains the event
- [ ] WS is closed and wsConnected = false when workflowId changes
- [ ] On receiving `{ type: 'unknown_event' }`, no exception is thrown (handled by default case)

---

### useInbox
**File:** `client/src/hooks/useInbox.js`
**Type:** `hook`
**Layer:** `client`
**Purpose:** Manages HITL inbox items — loads them from the server on mount and polls when WS is disconnected; provides `approve` and `reject` actions.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| executionId | string\|null | yes (effective) | Active execution ID; if null/undefined, no polling occurs |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| inboxItems | object[] | Normalized, pending-only inbox items from store |
| approve(itemId, resumeText) | async function | POSTs to `/api/v1/swarm/:executionId/inbox/:itemId/approve` |
| reject(itemId) | async function | POSTs to `/api/v1/swarm/:executionId/inbox/:itemId/reject` |

**Behavior (step by step):**
1. `loadInbox()`: GETs `/api/v1/swarm/${executionId}/inbox`; normalizes items via `normalizeInboxItem()`; replaces store `inboxItems` via `useSwarmStore.setState({ inboxItems: items })` (direct state mutation, not via action).
2. On mount: calls `loadInbox()` immediately; if `!wsConnected`, starts 10-second polling interval.
3. `normalizeInboxItem(item)`: extracts `{ id, type, agentId, status, payload }` from raw item; falls back to empty string for missing fields.
4. Returns only `status === 'pending'` items (filtered from store via selector).
5. `approve(itemId, resumeText)`: POSTs `{ resumeText }` with CSRF header; on success calls `resolveInboxItem(itemId)`.
6. `reject(itemId)`: POSTs with CSRF header; on success calls `resolveInboxItem(itemId)`.

**Contracts with other components:**
- **Store reads:** `inboxItems`, `wsConnected`
- **Store writes:** `resolveInboxItem(itemId)`, `useSwarmStore.setState({ inboxItems })` (direct)
- **Called by:** `SwarmView.jsx` (mounts via `useInbox(activeExecutionId)` — BUG-AUDIT-4 fix)

**Acceptance Criteria:**
- [ ] On mount with a valid executionId, `loadInbox()` is called and items are normalized
- [ ] When wsConnected = false, polling runs every 10 seconds
- [ ] `approve()` with empty resumeText still succeeds (defaults to empty string)
- [ ] After `approve(itemId)`, the item is removed from the visible inboxItems list
- [ ] `loadInbox()` does not throw when executionId is null (returns early)

---

### SwarmView
**File:** `client/src/views/SwarmView.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Top-level layout shell for the Swarm Orchestrator view — renders toolbar (run/stop/pause/resume/reset/HITL badge), PromptToFlowBar, SwarmCanvas, HitlInbox drawer, BroadcastBar, and PtyExplosion overlay.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| (none — reads from store) | — | — | All state comes from useSwarmStore and useAppState |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | React tree | Rendered swarm UI |
| handleRun() | async | Calls useSwarm.startExecution(activeProjectId, projectPath) |
| handleStop() | async | Calls useSwarm.stopExecution(activeExecutionId) |
| handlePause() | async | POSTs to /api/v1/swarm/:executionId/pause; calls setPaused() |
| handleResume() | async | POSTs to /api/v1/swarm/:executionId/resume; calls setResumed() |

**Behavior (step by step):**
1. Reads `executionStatus`, `activeExecutionId`, `inboxItems`, `workflowDef`, `ptyExplosionNodeId` from SwarmContext.
2. Mounts `useInbox(activeExecutionId)` for HITL polling fallback when WS is disconnected (BUG-AUDIT-4 fix).
3. Renders toolbar buttons conditionally: Run (idle only), Pause (running only), Resume (paused only), Stop (running or paused), Reset (stopped only).
4. Run button is disabled if no workflowDef or no activeProjectId; shows tooltip explaining why.
5. Escape key closes PtyExplosion overlay if open.
6. HITL badge shows pending item count; clicking toggles HitlInbox drawer.
7. BroadcastBar renders only during active execution (isActive = status 'running' + activeExecutionId).

**Contracts with other components:**
- **Calls:** `useSwarm(workflowDef?.id)`, `useInbox(activeExecutionId)`, `useAppState()`, `apiPost('/api/v1/swarm/:id/pause')`, `apiPost('/api/v1/swarm/:id/resume')`
- **Renders:** `SwarmCanvas`, `PromptToFlowBar`, `BroadcastBar`, `HitlInbox`, `PtyExplosion`
- **Store reads:** `executionStatus`, `activeExecutionId`, `inboxItems`, `workflowDef`, `ptyExplosionNodeId`
- **Store writes:** `setPaused`, `setResumed`, `reset`, `setWorkflowDef`, `setPtyExplosionNodeId`

**Acceptance Criteria:**
- [ ] Run button is disabled when `workflowDef === null`
- [ ] Run button is disabled when `activeProjectId === null`
- [ ] Run button is not rendered when `executionStatus !== 'idle'`
- [ ] Stop button renders when status is 'running' or 'paused'
- [ ] Pressing Escape when `ptyExplosionNodeId !== null` calls `setPtyExplosionNodeId(null)`
- [ ] HITL badge shows numeric count when `inboxItems` has pending items

---

### SwarmCanvas
**File:** `client/src/canvas/SwarmCanvas.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** React Flow v12 canvas rendering all workflow nodes and edges with drill-down department filtering, live status updates, and node selection for AgentInspector.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| workflowDef | object\|null | no | Workflow definition; when changed, canvas nodes/edges are replaced and fitView() is called |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | React Flow canvas | Renders nodes, edges, MiniMap, Controls, Background |

**Behavior (step by step):**
1. Initializes `useNodesState` and `useEdgesState` from `workflowDef.nodes` and `workflowDef.edges` (empty arrays if null).
2. On `workflowDef` change: replaces nodes and edges; calls `fitView({ padding: 0.2, duration: 400 })` after 50ms delay.
3. Applies drill-down filter via `useMemo`: if `focusedDepartmentId` is set, shows only nodes where `n.id === focusedDepartmentId` or `n.parentId === focusedDepartmentId`; filters edges to only those connecting visible nodes.
4. On node click: calls `setSelectedNode(node.id)`.
5. On pane click: calls `setSelectedNode(null)`.
6. On connect (drag between handles): creates edge with `type: 'handoff'`.
7. Renders `AgentInspector` always (visible when selectedNodeId is set); renders `InterAgentFeed` only when `executionStatus === 'running' || 'paused'`.
8. Custom node types: `agent` → `AgentNode`, `department` → `DepartmentNode`, `trigger` → `TriggerNode`. Custom edge type: `handoff` → `HandoffEdge`.

**Contracts with other components:**
- **Calls:** `useSwarmStore` (focusedDepartmentId, setSelectedNode, executionStatus)
- **Renders:** `AgentNode`, `DepartmentNode`, `TriggerNode`, `HandoffEdge`, `AgentInspector`, `BreadcrumbBar`, `InterAgentFeed`

**Known issues:**
- BUG: `onUpdateNode` is accepted as a prop by `AgentInspector` but is never defined or passed in `SwarmCanvas.jsx`. `AgentInspector` receives `onUpdateNode={undefined}`. Any future code in AgentInspector that calls `onUpdateNode()` will throw `TypeError: onUpdateNode is not a function`.

**Acceptance Criteria:**
- [ ] When `workflowDef` changes, canvas nodes and edges are replaced with the new values
- [ ] When `focusedDepartmentId` is set to a department ID, only nodes with matching `id` or `parentId` are visible
- [ ] Clicking a node calls `setSelectedNode` with that node's ID
- [ ] Clicking the canvas background calls `setSelectedNode(null)`
- [ ] `InterAgentFeed` is visible when status is 'running'; hidden when status is 'idle'

---

### AgentNode
**File:** `client/src/canvas/nodes/AgentNode.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Custom React Flow node representing a single Claude agent. Displays label, live status via border color, last output snippet, and handoff count badge.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| id | string | yes | React Flow node ID; used to read `agentStates[id]` from store |
| data | object | yes | `{ label: string, systemPrompt?: string, isTriageNode?: boolean }` |
| selected | boolean | no | Whether the node is selected in React Flow (adds ring) |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | React element | Renders agent card with status color, label, snippet, handoff count |

**Behavior (step by step):**
1. Reads `agentStates[id]` from SwarmContext; defaults `status` to `'idle'` if agentState is missing.
2. Maps status to border + background color: idle → gray, running → blue animated pulse, done → green, paused → yellow, error → red.
3. Adds `ring-2 ring-white` highlight when `selected === true`.
4. Shows `lastOutputSnippet` in a scrollable `<pre>` block (last 4 lines); shows blinking cursor `▋` when status is `'running'`.
5. Shows handoff count badge when `agentState.handoffCount > 0`.
6. Renders React Flow `Handle` at top (target/input) and bottom (source/output).

**Contracts with other components:**
- **Store reads:** `agentStates[id]` (status, lastOutputSnippet, handoffCount)
- **Called by:** SwarmCanvas (registered as `nodeTypes.agent`)

**Acceptance Criteria:**
- [ ] Node with status 'running' has the class `animate-pulse` applied
- [ ] Node with status 'done' has green border color class applied
- [ ] Node with `agentState.handoffCount === 0` does not show a handoff count badge
- [ ] Node with `selected === true` shows a white ring highlight

---

### HandoffEdge
**File:** `client/src/canvas/edges/HandoffEdge.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Custom React Flow edge visualizing handoffs between agents — shows animated dashed stroke and a counter badge when the edge has fired at least once.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| id | string | yes | Edge ID; used to read `edgeCounters[id]` from store |
| sourceX/Y, targetX/Y | number | yes | React Flow geometry props |
| sourcePosition, targetPosition | Position | yes | React Flow handle positions |
| data | object | no | Optional edge data |
| markerEnd | string | no | Arrow marker end ref |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | SVG path + label | Bezier edge with optional animated stroke and counter badge |

**Behavior (step by step):**
1. Reads `edgeCounters[id]` from SwarmContext; defaults to 0 if missing.
2. If `counter > 0` (`isActive`): renders edge with blue stroke (`#60a5fa`), strokeWidth 2, dashed pattern (`6 3`), `dashdraw` animation.
3. If `counter === 0`: renders gray stroke (`#4b5563`), strokeWidth 1, no animation.
4. If `isActive`, renders `EdgeLabelRenderer` with a blue badge showing the counter value, centered on the edge midpoint.

**Contracts with other components:**
- **Store reads:** `edgeCounters[id]`
- **Called by:** SwarmCanvas (registered as `edgeTypes.handoff`)

**Acceptance Criteria:**
- [ ] Edge with `edgeCounters[id] === 0` renders without animation and without a counter badge
- [ ] Edge with `edgeCounters[id] === 5` renders with blue animated stroke and badge showing "5"
- [ ] Counter badge uses `EdgeLabelRenderer` (positioned in the correct SVG coordinate space)

---

### AgentInspector
**File:** `client/src/canvas/AgentInspector.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Right-side panel that shows detailed information about the selected agent node — status, system prompt, last output snippet, and a button to open the PTY terminal.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| nodes | object[] | yes | All React Flow nodes (used to find selectedNode by ID) |
| onUpdateNode | function | no | Callback for editing node data — NOTE: not passed by SwarmCanvas (see Known Issues) |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | React element | Inspector panel (64px wide) or "Select a node" placeholder |

**Behavior (step by step):**
1. Reads `selectedNodeId` and `agentStates[selectedNodeId]` from SwarmContext.
2. If no `selectedNodeId` or node not found in `nodes` array, renders placeholder "Select a node to inspect".
3. Otherwise renders: header with `node.data.label`, close button (calls `setSelectedNode(null)`), node type badge, "Open Terminal" button (only if `agentState?.sessionId` is truthy — calls `setPtyExplosionNodeId(agentState.sessionId)`), status block (status + handoffCount), system prompt (read-only scrollable pre block), last output snippet (green monospace).

**Known issues:**
- BUG: `onUpdateNode` prop is accepted but never passed from SwarmCanvas. Any future attempt to call `props.onUpdateNode()` will fail with `TypeError`. Additionally, the "Open Terminal" button condition (`agentState?.sessionId`) will never be true via WS alone because `agent_status` events from SwarmEngine do not include `sessionId`.

**Acceptance Criteria:**
- [ ] When `selectedNodeId === null`, the panel shows "Select a node to inspect"
- [ ] When a node is selected, its label is shown in the header
- [ ] Clicking the close button (×) calls `setSelectedNode(null)`
- [ ] "Open Terminal" button renders only when `agentState?.sessionId` is truthy
- [ ] Clicking "Open Terminal" calls `setPtyExplosionNodeId(agentState.sessionId)`

---

### BroadcastBar
**File:** `client/src/canvas/BroadcastBar.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Input bar at the bottom of SwarmView that lets the user broadcast a text message to all running agents, a department, or a specific agent with soft or hard injection mode.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| (none — reads from store) | — | — | Reads `activeExecutionId` and `executionStatus` from SwarmContext |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | React element | Hidden when not active; visible text input + mode selector + Send button |
| POST broadcast | `{ text, scope, targetId, mode }` | Sent to `/api/v1/swarm/:executionId/broadcast` |

**Behavior (step by step):**
1. `isActive = executionStatus === 'running' && activeExecutionId`. If not active, renders null.
2. On Send (button click or Enter key without Shift): POSTs `{ text: text.trim(), scope, targetId, mode }` to broadcast endpoint with `X-Requested-With: ClaudeCodeManager` header.
3. On success: shows `"Sent to N agents"` feedback for 3 seconds; clears input.
4. On failure: shows `"Error: <message>"` feedback.
5. Input is limited to 500 characters (maxLength attribute).
6. Mode selector allows `'soft'` (default) or `'hard'`.

**Contracts with other components:**
- **Store reads:** `activeExecutionId`, `executionStatus`
- **Calls:** `fetch('/api/v1/swarm/:executionId/broadcast', { method: 'POST', ... })`

**Acceptance Criteria:**
- [ ] Component renders null when `executionStatus !== 'running'`
- [ ] Sending empty text does not trigger a POST request
- [ ] After successful send, input is cleared and feedback message is shown
- [ ] Pressing Enter (without Shift) submits the form
- [ ] Mode selector toggles between 'soft' and 'hard' before sending

---

### InterAgentFeed
**File:** `client/src/canvas/InterAgentFeed.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Real-time event log panel showing chronological inter-agent handoffs, status changes, and circuit breaker warnings during execution.

**Inputs:**
| Nome | Tipo | Required | Descrizione |
|------|------|----------|-------------|
| (none — reads from store) | — | — | Reads `interAgentFeed` array from SwarmContext |

**Outputs / Emits:**
| Nome | Tipo | Descrizione |
|------|------|-------------|
| DOM | React element | Scrollable 224px-wide panel with event entries; auto-scrolls to bottom |

**Behavior (step by step):**
1. Reads `interAgentFeed` from SwarmContext.
2. If empty, shows "No handoffs yet" placeholder.
3. Auto-scrolls to bottom via `useEffect` on `feed.length` change.
4. Renders each event with: formatted timestamp, icon (→ for handoff_started, ● for agent_status, ⚠ for circuit_breaker, ⚡ for execution_status), and a text summary.
5. `handoff_started` events display: `<sourceNodeId[:6]> → <targetNodeId[:6]>`.
6. `circuit_breaker` events display: `⚠ loop <edgeId[:8]> (<counter>)`.
7. Other events display their `type` string as fallback.
8. Only renders (is mounted in SwarmCanvas) when `executionStatus === 'running' || 'paused'`.

**Contracts with other components:**
- **Store reads:** `interAgentFeed`
- **Called by:** SwarmCanvas (conditionally rendered)
- **Receives events via:** `useSwarm.js` → `addFeedEvent()` on `handoff_started` and `circuit_breaker` WS messages

**Acceptance Criteria:**
- [ ] Feed with 0 items shows "No handoffs yet"
- [ ] Feed auto-scrolls to the bottom when a new event is added
- [ ] A `handoff_started` event from 'node-alpha' to 'node-beta' displays "node-a → node-b" (first 6 chars of each)
- [ ] A `circuit_breaker` event with counter 15 displays "⚠ loop" and the counter

---

## Section 11.1 — WebSocket Event Field Reference (Actual Implementation)

This section documents the exact fields emitted by the server implementation, as read from the source code. Fields listed in the original PRD Section 9 that differ from actual code are flagged.

---

### WS Event: `agent_status`
**Emitted by:** `SwarmEngine._spawnAgentPty()`, `_onHandoff()`, `_onDone()`, `pauseExecution()`, `resumeExecution()`, `freezeAgent()`, `unfreezeAgent()`
**Actual fields:** `{ type: 'agent_status', nodeId: string, status: string, sessionId: string|null, lastOutputSnippet: string }`
**PRD Section 9 discrepancy:** Resolved 2026-04-02. `agent_status` now includes both `sessionId` and `lastOutputSnippet`, and live PTY output refreshes the snippet through the same event contract.
**Known issue:** none for this contract after the 2026-04-02 runtime-contract pass.

---

### WS Event: `handoff_started`
**Emitted by:** `SwarmEngine._onHandoff()`
**Actual fields:** `{ type: 'handoff_started', sourceNodeId: string, targetNodeId: string, edgeId: string, counter: number }`
**PRD Section 9 match:** Correct — PRD specifies these exact fields.

---

### WS Event: `handoff_completed`
**Emitted by:** NEVER — not implemented
**PRD Section 9 requirement:** `{ type: "handoff_completed", sourceNodeId, targetNodeId }` — listed in FR-V3-43
**Known issue:** This event is never emitted by SwarmEngine. The `_onHandoff()` method emits `handoff_started` and then two `agent_status` events (source → 'done', target → 'running'), but no `handoff_completed`. The client's `useSwarm.js` has no handler for it. The PRD requirement is unimplemented.

---

### WS Event: `circuit_breaker`
**Emitted by:** `SwarmEngine._onHandoff()` (when circuitBreaker.check() returns true)
**Actual fields:** `{ type: 'circuit_breaker', edgeId: string, counter: number, threshold: number }`
**PRD Section 9 match:** Correct.
**Client handling:** `useSwarm.js` handles this event — calls `addFeedEvent({ ...msg, timestamp: Date.now() })`.

---

### WS Event: `inbox_item` / `hitl_required`
**Emitted by:** `SwarmEngine.freezeAgent()` emits `{ type: 'hitl_required', nodeId: string, item: object }`
**PRD Section 9 discrepancy:** PRD specifies `{ type: "inbox_item", item: InboxItem }`. The actual emitted type is `'hitl_required'`, not `'inbox_item'`. The client handler in `useSwarm.js` correctly handles `'hitl_required'`.

---

### WS Event: `execution_status`
**Emitted by:** `SwarmEngine._onDone()` and `swarmHandler.js` (on initial WS connect)
**From `_onDone()` — actual fields:** `{ type: 'execution_status', status: 'agent_done', nodeId: string }`
**From `swarmHandler.js` on connect — actual fields:** `{ type: 'execution_status', executionId: string, workflowId: string, status: string, agentStates: object, edgeCounters: object, budget: object }` (spread of getStatus() result)
**PRD Section 9 discrepancy:** PRD specifies `{ type: "execution_status", status }`. The on-connect variant includes many more fields. The `_onDone()` variant includes `nodeId` which the PRD does not mention.
**Client handling:** `useSwarm.js` handles this event — calls `setExecution(msg.executionId ?? null, msg.status ?? 'running')`.

---

### WS Event: `budget_update`
**Emitted by:** `SwarmEngine._spawnAgentPty()` tapFn (when budget limit is exceeded)
**Actual fields:** `{ type: 'budget_update', estimatedTokensUsed: number, limitTokens: number }`
**PRD Section 9 match:** Correct.
**Client handling:** `useSwarm.js` handles this — calls `updateBudget(msg.estimatedTokensUsed, msg.limitTokens)`.

---

### WS Event: `trigger_fired` / `trigger_status`
**Emitted by:** NEVER — not implemented by SwarmEngine or TriggerManager
**Client handling:** NOT handled — no `case 'trigger_fired'` or `case 'trigger_status'` in `useSwarm.js` `onmessage` switch
**Known issue:** TriggerManager emits `{ type: 'rss_item', nodeId, guid }` when a running execution receives a new RSS item — but this event type is also not handled in the client. The `triggerStates` store slice is never updated from any WS event.

---

### WS Event: `rss_item`
**Emitted by:** `TriggerManager._fireTrigger()` (when executionId is set and a new RSS item is found)
**Actual fields:** `{ type: 'rss_item', nodeId: string, guid: string | null }`
**PRD Section 9:** Not listed — this event is not documented in the original PRD.
**Client handling:** NOT handled in `useSwarm.js`. The event is silently dropped by the `default` case.

---

---

# V5: N8N-Style Visual Workflow Editor

**Version:** 5.0
**Date:** 2026-04-06
**Status:** Draft
**Depends on:** V3 (Swarm Orchestrator) + V4 (Multi-Provider Runtime)

---

## V5.1. Problem Statement

The Swarm canvas in V3/V4 is a **viewer and runner**, not an **editor**. Users can generate workflows via Prompt-to-Flow or load saved ones, but they cannot:
- Create nodes manually (no "Add Node" button, no palette)
- Edit node properties inline (system prompt, label, model, tools are read-only)
- Delete nodes or edges from the canvas
- Save canvas modifications back to the server
- Configure workflow settings (mode, budget, circuit breaker)
- Set initial context variables before execution
- Undo/redo canvas changes
- Use advanced flow-control patterns (conditionals, merge/join, loops, error handlers)

Power users (workflow builders, not just watchers) need **full manual control** over workflow topology, node configuration, and execution settings — comparable to what N8N provides for integration workflows, but for AI agent orchestration.

---

## V5.2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Manual workflow creation | User can build a workflow from scratch without Prompt-to-Flow | Complete in < 5 min for a 5-node workflow |
| Inline node editing | All node properties editable from inspector panel | 100% of AgentData, DepartmentData, TriggerData fields |
| Canvas persistence | All canvas changes saveable to server | Save round-trip < 500ms |
| Undo/redo reliability | Canvas state recoverable after any edit | 50-step undo history |
| Workflow validation | Invalid workflows flagged before execution | Zero silent failures from missing connections |
| Advanced flow control | Conditional routing, merge/join, error handling | All 5 advanced node types functional |
| N8N parity (core) | Feature coverage vs N8N workflow editor | 80%+ for AI agent use case |

---

## V5.3. User Stories

### Wave 1 — Editor Transition (MUST HAVE, V5.0 MVP)
- As a user, I want to **save my canvas changes** so that node positions, new connections, and edits persist across sessions.
- As a user, I want to **edit the workflow name and description** directly from the toolbar so I can organize my workflows.
- As a user, I want to **edit an agent's system prompt** in the inspector panel so I can customize agent behavior without regenerating the workflow.
- As a user, I want to **edit an agent's label** in the inspector panel so I can rename agents.
- As a user, I want to **delete nodes** by selecting them and pressing Delete or via right-click context menu.
- As a user, I want to **delete edges** by clicking them and pressing Delete or via context menu.
- As a user, I want **undo/redo** (Ctrl+Z / Ctrl+Shift+Z) so I can revert mistakes.
- As a user, I want a **right-click context menu** on the canvas, nodes, and edges for quick actions.

### Wave 2 — Node Creation & Configuration (MUST HAVE, V5.0)
- As a user, I want a **node palette sidebar** where I can see all available node types and drag them onto the canvas.
- As a user, I want to **duplicate a node** via context menu to quickly create similar agents.
- As a user, I want to **select an AI model per agent** from a dropdown in the inspector.
- As a user, I want to **configure tools per agent** (multi-select from available tools list).
- As a user, I want to **set maxTurns per agent** to limit agent execution length.
- As a user, I want to **toggle the triage node flag** to designate which agent receives initial context.
- As a user, I want to **assign agents to departments** via the inspector.
- As a user, I want a **workflow settings panel** (modal) to configure mode, budget, circuit breaker threshold, default model.
- As a user, I want an **initial context editor** (key-value pairs) to set workflow variables before execution.

### Wave 3 — Workflow Management & UX (SHOULD HAVE, V5.1)
- As a user, I want to **duplicate/clone a workflow** to iterate on designs without modifying the original.
- As a user, I want to **export a workflow as JSON** and **import from JSON file** for sharing and backup.
- As a user, I want to **copy/paste nodes** (Ctrl+C/Ctrl+V) for rapid canvas building.
- As a user, I want **snap-to-grid** for clean node alignment.
- As a user, I want **auto-layout** to automatically arrange nodes in a readable flow.
- As a user, I want **keyboard shortcuts** for all common operations (add node, delete, save, run).
- As a user, I want **validation indicators** (red borders, warning badges) on nodes/edges that have problems.
- As a user, I want to **set circuit breaker threshold per edge** via edge inspector.
- As a user, I want to **add labels/descriptions to edges** for documentation.

### Wave 4 — Execution Visibility (SHOULD HAVE, V5.1)
- As a user, I want an **execution history** showing past runs with status, duration, and node outcomes.
- As a user, I want **per-node execution timing** (start, end, duration) visible in the inspector during/after runs.
- As a user, I want a **workflow templates library** with pre-built patterns I can load and customize.
- As a user, I want **workflow version history** so I can revert to previous versions.

### Wave 5 — Advanced Flow Control (NICE TO HAVE, V5.2+)
- As a user, I want a **Conditional Router node** that routes handoffs to different targets based on context variable values.
- As a user, I want a **Merge/Join node** that waits for N upstream agents to complete before forwarding.
- As a user, I want a **Delay/Timer node** that waits N seconds before forwarding context to the next agent.
- As a user, I want a **Loop node** that repeats a sub-graph N times or until a condition is met.
- As a user, I want an **Error Handler node** that activates when an upstream agent errors.
- As a user, I want a **Sub-workflow node** that embeds and runs another saved workflow.

---

## V5.4. Functional Requirements

### Wave 1 — Editor Transition (V5.0 MVP)

**Save & Persistence**
- FR-V5-01: The SwarmView toolbar must include a "Save" button that serializes the current canvas state (nodes, edges, settings) and calls `PUT /api/v1/workflows/:id`. The button must be disabled when no workflow is loaded or when no changes have been made (clean state). A "dirty" indicator (asterisk on workflow name or dot on Save button) must be visible when unsaved changes exist.
- FR-V5-02: Before saving, a sanitizer must strip React Flow internal fields (`measured`, `width`, `height`, `selected`, `dragging`, `positionAbsolute`) from node objects. Only `id`, `type`, `position`, `data`, `parentId` fields are persisted. Edge objects persist: `id`, `source`, `target`, `type`, `data`.
- FR-V5-03: After a successful save, the "dirty" indicator must clear. Save errors must display an inline error banner (not an alert/modal).
- FR-V5-04: "Save As New" option must be available (creates a new workflow copy via `POST /api/v1/workflows`). A prompt asks for the new name.

**Workflow Name & Description Editing**
- FR-V5-05: The toolbar must display the current workflow name as an editable inline text field (click to edit, Enter to confirm, Escape to cancel). Below or beside it, a smaller editable field for description.
- FR-V5-06: Name changes mark the workflow as dirty (unsaved). Validation: name max 128 chars, `^[a-zA-Z0-9 _\-]+$`. Description max 512 chars.

**Inspector Editing**
- FR-V5-07: AgentInspector must upgrade from read-only display to a full edit panel. Editable fields for agent nodes: `label` (text input), `systemPrompt` (expandable textarea with line numbers), `model` (select dropdown from SUPPORTED_RUNTIME_MODELS), `tools` (multi-select or comma-separated input), `maxTurns` (number input), `isTriageNode` (toggle switch), `parentDepartmentId` (select from available departments or null).
- FR-V5-08: Inspector changes must call `onUpdateNode(nodeId, patch)` immediately (optimistic local update) and mark the workflow as dirty.
- FR-V5-09: For department nodes: editable `label`, `color` (color picker), `collapsed` (toggle).
- FR-V5-10: For trigger nodes: editable `label`, `triggerType` (select: webhook/rss), `webhookPath` (text), `rssUrl` (text), `pollIntervalSeconds` (number, min 60), `targetNodeId` (select from connected agents).

**Node Deletion**
- FR-V5-11: Selecting one or more nodes and pressing the Delete key must remove them from the canvas. All edges connected to deleted nodes must also be removed. Multi-select via Shift+click or drag-select box.
- FR-V5-12: Node deletion must be undoable (see FR-V5-17).
- FR-V5-13: When deleting a department node, a confirmation dialog must appear: "Delete department and all N child agents?" with options "Delete All" / "Ungroup Only" (moves children to root level) / "Cancel".

**Edge Deletion**
- FR-V5-14: Clicking an edge selects it (visual highlight). Pressing Delete removes it. React Flow's `onEdgesDelete` callback must be wired.
- FR-V5-15: Edge deletion must be undoable (see FR-V5-17).

**Undo/Redo**
- FR-V5-16: The canvas must maintain a history stack of up to 50 state snapshots. Each snapshot captures the full `{ nodes, edges }` arrays.
- FR-V5-17: `Ctrl+Z` triggers undo (pop from history, push current to redo stack). `Ctrl+Shift+Z` or `Ctrl+Y` triggers redo.
- FR-V5-18: Actions that create history entries: add node, delete node, move node (on drag end, not during drag), add edge, delete edge, update node data (debounced — batch rapid edits into one entry).
- FR-V5-19: Toolbar must display Undo/Redo buttons with visual state (grayed out when stack is empty).
- FR-V5-20: Undo/redo operates only on canvas state (nodes/edges). It does NOT affect execution state (Zustand store) per DEC-011.

**Context Menu**
- FR-V5-21: Right-clicking the canvas background must show a context menu with: "Add Agent Node", "Add Department Node", "Add Trigger Node", "Paste" (if clipboard has nodes), "Select All", "Auto-Layout".
- FR-V5-22: Right-clicking a node must show: "Edit" (opens inspector), "Duplicate", "Delete", "Copy", "Open Terminal" (if agent with active session).
- FR-V5-23: Right-clicking an edge must show: "Delete", "Configure" (opens edge settings if applicable).
- FR-V5-24: Context menus must close on click-away or Escape.

### Wave 2 — Node Creation & Configuration (V5.0)

**Node Palette Sidebar**
- FR-V5-25: A collapsible left sidebar ("Node Palette") must display all available node types as draggable cards: Agent, Department, Trigger (webhook), Trigger (RSS). Each card shows an icon, label, and brief description.
- FR-V5-26: Dragging a card from the palette onto the canvas creates a new node at the drop position. The new node must have a server-valid ID generated as `[type]-[short-uuid]` matching `^[a-z][a-z0-9-]*$` (WorkflowStore NODE_ID_REGEX).
- FR-V5-27: New nodes are created with sensible defaults: Agent — label "New Agent", empty systemPrompt, default model, empty tools, maxTurns 0, isTriageNode false. Department — label "New Department", random pastel color. Trigger — label "New Trigger", type "webhook".
- FR-V5-28: The palette must also include a section "From Project Agents" that lists `.claude/agents/*.md` files from the active project. Dragging one creates an agent node pre-populated with that agent's name and system prompt content.
- FR-V5-29: When advanced flow control nodes are implemented (V5.2+), the palette gains new sections: "Flow Control" with Conditional Router, Merge/Join, Delay, Loop, Error Handler, Sub-workflow.

**Node Duplication**
- FR-V5-30: Right-click → "Duplicate" on any node creates a copy offset by (+40px, +40px) from the original. The copy gets a new unique ID but inherits all data properties. Edges are NOT duplicated.

**Full Node Configuration (Inspector)**
- FR-V5-31: Model selection dropdown must be populated from `SUPPORTED_RUNTIME_MODELS` (fetched from `/api/v1/swarm/runtime-capabilities` or hardcoded list). Must show provider groupings: Claude models, Codex models, Gemini models.
- FR-V5-32: Tools configuration must support free-text comma-separated input with validation. Common tools can be offered as quick-add chips (e.g., "Read", "Write", "Bash", "WebSearch").
- FR-V5-33: Triage node toggle: when enabled, sets `isTriageNode: true` on the node. A visual indicator (star icon on node) must appear on the canvas. Only ONE node per workflow should be triage — toggling on a new node should auto-disable the previous triage node with a toast notification.

**Workflow Settings Panel**
- FR-V5-34: A "Settings" button in the toolbar opens a modal with workflow-level configuration:
  - `mode`: Radio buttons "Autonomous" / "HITL (Human-in-the-Loop)"
  - `budgetTokens`: Number input with presets (10K, 50K, 100K, 500K, Unlimited)
  - `circuitBreakerThreshold`: Number input (default 10)
  - `defaultModel`: Select from supported models
  - Changes mark workflow as dirty.
- FR-V5-35: Settings are stored in `workflowDef.settings` and persisted on save.

**Initial Context Editor**
- FR-V5-36: The Settings modal includes an "Initial Context" tab with a dynamic key-value editor:
  - "Add Variable" button adds a new row with key (text input) and value (text input)
  - Delete button per row
  - Keys must be non-empty strings, values must be strings
  - This maps to `workflowDef.initialContext`
  - Changes mark workflow as dirty.

### Wave 3 — Workflow Management & UX (V5.1)

**Duplicate/Clone Workflow**
- FR-V5-37: "Duplicate Workflow" button or menu option creates a copy with name "[Original Name] (Copy)" via `POST /api/v1/workflows`. Opens the copy immediately.

**Export/Import**
- FR-V5-38: "Export" button downloads the current WorkflowDefinition as a `.json` file (browser download dialog).
- FR-V5-39: "Import" button opens a file picker. Selected JSON is validated against WorkflowDefinition schema. On success, creates a new workflow and loads it. On failure, shows validation errors.

**Copy/Paste Nodes**
- FR-V5-40: `Ctrl+C` copies selected nodes to an internal clipboard (not system clipboard — node data is too complex for plain text). `Ctrl+V` pastes copies at the current mouse position with new unique IDs.

**Snap-to-Grid**
- FR-V5-41: ReactFlow prop `snapToGrid={true}` with `snapGrid={[20, 20]}`. A toggle in the toolbar enables/disables snap.

**Auto-Layout**
- FR-V5-42: An "Auto-Layout" button arranges all nodes using a directed-graph layout algorithm (dagre or elkjs). Must handle departments as groups. Layout must not destroy user-placed positions without confirmation.

**Keyboard Shortcuts**
- FR-V5-43: Keyboard shortcut map:
  - `Ctrl+S` — Save workflow
  - `Ctrl+Z` — Undo
  - `Ctrl+Shift+Z` / `Ctrl+Y` — Redo
  - `Delete` / `Backspace` — Delete selected nodes/edges
  - `Ctrl+C` — Copy selected
  - `Ctrl+V` — Paste
  - `Ctrl+D` — Duplicate selected
  - `Ctrl+A` — Select all
  - `Escape` — Deselect all / close panels
  - `Space` (hold) — Pan mode
  - `Ctrl+Enter` — Run workflow (when idle)

**Validation Indicators**
- FR-V5-44: Before execution, the canvas must validate:
  - At least one agent node exists
  - At least one node is marked as triage (isTriageNode)
  - No orphan nodes (all nodes connected to at least one edge, except triage which may be a sole entry point)
  - Agent nodes have non-empty systemPrompt
  - Trigger nodes have valid configuration (webhookPath or rssUrl set)
- FR-V5-45: Invalid nodes show a red warning badge (!) on the top-right corner. Hovering shows the validation error. Invalid edges show a dashed red line.
- FR-V5-46: The Run button must be disabled when validation fails, with a tooltip showing the error count.

**Edge Inspector**
- FR-V5-47: Clicking an edge opens an Edge Inspector panel (replaces or shares space with AgentInspector):
  - Circuit breaker threshold override (number or "Use workflow default")
  - Edge label (optional descriptive text displayed on the edge)
  - Edge source and target (read-only, showing node labels)

### Wave 4 — Execution Visibility (V5.1)

**Execution History**
- FR-V5-48: A new tab or panel "History" in SwarmView shows past executions for the current workflow:
  - Columns: executionId (truncated), status, started, duration, nodes run, outcome
  - Data persisted to `CONFIG_DIR/execution-history/<workflowId>.json` (append-only log, max 100 entries)
  - Click to view execution details (per-node status snapshot)

**Per-Node Execution Timing**
- FR-V5-49: During and after execution, AgentInspector shows timing:
  - "Started at: HH:MM:SS"
  - "Duration: Xs" (running timer during execution, final value after completion)
  - "Handoffs received: N, Handoffs sent: M"
- FR-V5-50: Agent status transitions are timestamped in the Zustand store: `agentStates[nodeId].timestamps: { started, done, error }`.

**Workflow Templates Library**
- FR-V5-51: A "Templates" section in the Node Palette sidebar (or a separate modal) offers pre-built workflow patterns:
  - Content Agency (writer → editor → publisher)
  - Code Review Chain (coder → reviewer → merger)
  - Research Loop (researcher → analyst → fact-checker → researcher)
  - Customer Support Triage (triage → billing / support / escalation)
  - Data Pipeline (fetcher → transformer → validator → loader)
- FR-V5-52: Each template is a complete WorkflowDefinition JSON. Selecting one creates a new workflow and loads it onto the canvas.

**Workflow Version History**
- FR-V5-53: Each `PUT /api/v1/workflows/:id` stores the previous version in `CONFIG_DIR/workflows/versions/<workflowId>/<timestamp>.json`.
- FR-V5-54: `GET /api/v1/workflows/:id/versions` returns a list of versions with timestamps.
- FR-V5-55: UI: "Version History" button opens a panel showing versions as a timeline. Click to preview, "Restore" to revert.

### Wave 5 — Advanced Flow Control Nodes (V5.2+)

**Conditional Router Node**
- FR-V5-56: New node type `conditional`. Renders as a diamond shape on canvas.
- FR-V5-57: Configuration: array of `{ condition: string, targetNodeId: string }` rules evaluated top-to-bottom against `workflowContext`. Conditions use simple expression syntax: `key == "value"`, `key != "value"`, `key contains "text"`, `key exists`. A "default" (else) route is mandatory.
- FR-V5-58: SwarmEngine evaluates conditions locally (no AI call). The conditional node does NOT spawn a PTY — it's a pure routing node.
- FR-V5-59: Canvas shows outgoing edges labeled with condition text and colored differently per branch.

**Merge/Join Node**
- FR-V5-60: New node type `merge`. Renders as a hexagon shape.
- FR-V5-61: Configuration: `waitFor: "all" | "any" | number`. "all" waits for ALL upstream agents to reach `done` status. "any" fires on the first upstream `done`. A number N waits for exactly N.
- FR-V5-62: On trigger, the merge node shallow-merges all upstream workflowContext contributions and forwards the combined context to its outgoing edge targets.
- FR-V5-63: SwarmEngine tracks convergence state per merge node: `{ received: Set<nodeId>, required: number }`.

**Delay/Timer Node**
- FR-V5-64: New node type `delay`. Renders as a clock icon node.
- FR-V5-65: Configuration: `delaySeconds: number` (1-3600). After receiving a handoff, waits the configured duration then forwards context unchanged.
- FR-V5-66: During the delay, the node shows a countdown timer on the canvas.
- FR-V5-67: No PTY is spawned — pure timer node.

**Loop Node**
- FR-V5-68: New node type `loop`. Renders as a circular arrow shape.
- FR-V5-69: Configuration: `maxIterations: number` (1-100) and optional `exitCondition: string` (expression against workflowContext, same syntax as conditional).
- FR-V5-70: On each iteration, the loop node forwards context to its inner sub-graph (outgoing edges). When the sub-graph's exit edge returns to the loop node, iteration counter increments. If `maxIterations` reached or `exitCondition` evaluates true, forwards to the loop's "exit" edge instead.
- FR-V5-71: Canvas shows iteration counter `[3/10]` badge on the loop node.
- FR-V5-72: Circuit breaker must not false-trigger on loop edges — loop edges are exempt up to `maxIterations`.

**Error Handler Node**
- FR-V5-73: New node type `errorHandler`. Renders with a red lightning bolt icon.
- FR-V5-74: Configuration: `watchedNodes: string[]` (node IDs to monitor). When any watched node transitions to `error` status, the error handler activates.
- FR-V5-75: On activation, receives the error context (node ID, error message, last output) and forwards to its outgoing edges.
- FR-V5-76: Error handler agents receive a system prompt augmented with the error context automatically.

**Sub-Workflow Node**
- FR-V5-77: New node type `subWorkflow`. Renders as a nested rectangle with a miniature workflow icon.
- FR-V5-78: Configuration: `workflowId: string` (reference to another saved WorkflowDefinition).
- FR-V5-79: On activation, SwarmEngine starts a nested execution of the referenced workflow. The parent execution's workflowContext is passed as the sub-workflow's initialContext.
- FR-V5-80: When the sub-workflow's last agent signals `__DONE__`, the sub-workflow node forwards the merged context to its outgoing edges in the parent workflow.
- FR-V5-81: PTY sessions for sub-workflow agents are namespaced: `<parentExecId>/<subExecId>/<nodeId>`.

---

## V5.5. New Data Model Additions

### CanvasHistoryEntry (client-side only)
- `nodes`: array of NodeDefinition (snapshot)
- `edges`: array of EdgeDefinition (snapshot)
- `timestamp`: number (Date.now())

### ConditionalData (extends NodeDefinition)
- `label`: string
- `rules`: array of `{ condition: string, targetNodeId: string }`
- `defaultTargetNodeId`: string

### MergeData (extends NodeDefinition)
- `label`: string
- `waitFor`: `"all"` | `"any"` | number

### DelayData (extends NodeDefinition)
- `label`: string
- `delaySeconds`: number

### LoopData (extends NodeDefinition)
- `label`: string
- `maxIterations`: number
- `exitCondition`: string | null
- `exitTargetNodeId`: string

### ErrorHandlerData (extends NodeDefinition)
- `label`: string
- `watchedNodes`: string[]

### SubWorkflowData (extends NodeDefinition)
- `label`: string
- `workflowId`: string

### ExecutionHistoryEntry (server-side, persisted)
- `executionId`: string
- `workflowId`: string
- `status`: string
- `startedAt`: ISO 8601
- `endedAt`: ISO 8601 | null
- `duration`: number (seconds)
- `agentOutcomes`: `{ [nodeId]: { status, handoffCount, duration } }`

---

## V5.6. New API Endpoints

### Workflow Versioning
```
GET    /api/v1/workflows/:id/versions
       Response: { versions: [{ timestamp, name, description }] }

GET    /api/v1/workflows/:id/versions/:timestamp
       Response: WorkflowDefinition (the version at that timestamp)

POST   /api/v1/workflows/:id/versions/:timestamp/restore
       Response: WorkflowDefinition (restored version becomes current)
```

### Execution History
```
GET    /api/v1/swarm/history/:workflowId
       Response: { executions: ExecutionHistoryEntry[] }

GET    /api/v1/swarm/history/:workflowId/:executionId
       Response: ExecutionHistoryEntry (detailed)
```

### Project Agents Discovery
```
GET    /api/v1/agents/discover?projectPath=<path>
       Response: { agents: [{ name, systemPrompt, filePath }] }
       Purpose: List .claude/agents/*.md files for Node Palette "From Project Agents" section.
```

### Workflow Templates
```
GET    /api/v1/workflows/templates
       Response: { templates: [{ id, name, description, nodeCount, preview }] }

POST   /api/v1/workflows/templates/:templateId/instantiate
       Body: { name?: string, projectId?: string }
       Response: WorkflowDefinition (new workflow created from template)
```

---

## V5.7. Architecture Changes

### New Client Components
```
client/src/canvas/NodePalette.jsx          — Draggable node type sidebar
client/src/canvas/ContextMenu.jsx          — Right-click context menu
client/src/canvas/EdgeInspector.jsx         — Edge configuration panel
client/src/canvas/WorkflowSettingsModal.jsx — Settings + initial context editor
client/src/canvas/WorkflowToolbar.jsx       — Save, undo/redo, name edit, settings button
client/src/canvas/ValidationBadge.jsx       — Warning indicators on nodes/edges
client/src/canvas/nodes/ConditionalNode.jsx — Diamond conditional router
client/src/canvas/nodes/MergeNode.jsx       — Hexagon merge/join
client/src/canvas/nodes/DelayNode.jsx       — Clock delay timer
client/src/canvas/nodes/LoopNode.jsx        — Circular loop iterator
client/src/canvas/nodes/ErrorHandlerNode.jsx— Red error handler
client/src/canvas/nodes/SubWorkflowNode.jsx — Nested workflow runner
client/src/hooks/useCanvasHistory.js        — Undo/redo state management
client/src/hooks/useCanvasValidation.js     — Pre-run validation
client/src/utils/sanitizeWorkflow.js        — Strip RF internal fields before save
client/src/utils/nodeIdGenerator.js         — Generate ^[a-z][a-z0-9-]*$ IDs
```

### Modified Client Components
```
client/src/canvas/SwarmCanvas.jsx           — Add palette, context menu, keyboard shortcuts, onDelete handlers
client/src/canvas/AgentInspector.jsx        — Upgrade to full edit panel
client/src/views/SwarmView.jsx              — Add toolbar (save, undo, settings), dirty state tracking
client/src/store/SwarmContext.jsx            — Add canvasHistory, dirtyState, clipboard
```

### New Server Components
```
server/services/ExecutionHistory.js         — Append-only execution log persistence
server/services/WorkflowVersionStore.js     — Version snapshot storage
server/routes/templates.js                  — Template CRUD endpoints
```

### Modified Server Components
```
server/services/SwarmEngine.js              — Conditional/merge/delay/loop/error/sub-workflow evaluation
server/services/WorkflowStore.js            — Validate new node types, version snapshots on PUT
server/routes/workflows.js                  — Version endpoints
server/routes/swarm.js                      — Execution history endpoints
```

---

## V5.8. Implementation Phase Plan

### Wave 1 — Editor Transition (8 features, ~15 tasks)
**Goal:** Transform Swarm from viewer to editor. This is the critical phase transition.
**Scope:** FR-V5-01 through FR-V5-24

| Order | Feature | Files | Complexity |
|-------|---------|-------|------------|
| 1.1 | Undo/Redo hook | useCanvasHistory.js (new), SwarmCanvas.jsx | M |
| 1.2 | Node delete + Edge delete | SwarmCanvas.jsx | S |
| 1.3 | Sanitize utility | sanitizeWorkflow.js (new) | S |
| 1.4 | Save button + dirty tracking | SwarmView.jsx, useWorkflow.js | M |
| 1.5 | Workflow name/description edit | SwarmView.jsx → WorkflowToolbar.jsx (new) | S |
| 1.6 | Inspector editing (agent) | AgentInspector.jsx | M |
| 1.7 | Inspector editing (dept, trigger) | AgentInspector.jsx | S |
| 1.8 | Context menu | ContextMenu.jsx (new), SwarmCanvas.jsx | M |
| 1.9 | TEST GATE Wave 1 | qa-tester | — |

### Wave 2 — Node Creation & Config (9 features, ~12 tasks)
**Goal:** Users can build workflows from scratch.
**Scope:** FR-V5-25 through FR-V5-36
**Depends on:** Wave 1 (save, inspector editing, context menu)

| Order | Feature | Files | Complexity |
|-------|---------|-------|------------|
| 2.1 | Node ID generator | nodeIdGenerator.js (new) | S |
| 2.2 | Node Palette sidebar | NodePalette.jsx (new), SwarmCanvas.jsx | M |
| 2.3 | Node duplication | SwarmCanvas.jsx, ContextMenu.jsx | S |
| 2.4 | Model selection per node | AgentInspector.jsx | S |
| 2.5 | Tools config per node | AgentInspector.jsx | S |
| 2.6 | maxTurns + triage toggle | AgentInspector.jsx | S |
| 2.7 | Department assignment | AgentInspector.jsx | S |
| 2.8 | Workflow Settings modal | WorkflowSettingsModal.jsx (new) | M |
| 2.9 | Initial Context editor | WorkflowSettingsModal.jsx | M |
| 2.10 | "From Project Agents" palette section | NodePalette.jsx, agents discover endpoint | M |
| 2.11 | TEST GATE Wave 2 | qa-tester | — |

### Wave 3 — Workflow Management & UX (9 features, ~12 tasks)
**Scope:** FR-V5-37 through FR-V5-47
**Depends on:** Wave 2

| Order | Feature | Files | Complexity |
|-------|---------|-------|------------|
| 3.1 | Duplicate workflow | SwarmView.jsx | S |
| 3.2 | Export JSON | SwarmView.jsx | S |
| 3.3 | Import JSON | SwarmView.jsx | S |
| 3.4 | Copy/paste nodes | SwarmCanvas.jsx, SwarmContext.jsx | M |
| 3.5 | Snap-to-grid toggle | SwarmCanvas.jsx | S (one prop) |
| 3.6 | Auto-layout (dagre) | SwarmCanvas.jsx + dagre dependency | M |
| 3.7 | Keyboard shortcuts | SwarmCanvas.jsx | S |
| 3.8 | Validation indicators | useCanvasValidation.js (new), ValidationBadge.jsx | M |
| 3.9 | Edge inspector | EdgeInspector.jsx (new) | M |
| 3.10 | TEST GATE Wave 3 | qa-tester | — |

### Wave 4 — Execution Visibility (4 features, ~8 tasks)
**Scope:** FR-V5-48 through FR-V5-55
**Depends on:** Wave 1 (save infrastructure)

| Order | Feature | Files | Complexity |
|-------|---------|-------|------------|
| 4.1 | Execution history persistence | ExecutionHistory.js (new), swarm.js | M |
| 4.2 | Execution history UI | SwarmView.jsx | M |
| 4.3 | Per-node timing | SwarmContext.jsx, AgentInspector.jsx | S |
| 4.4 | Workflow templates | templates.js (new), NodePalette.jsx | M |
| 4.5 | Version history backend | WorkflowVersionStore.js (new), workflows.js | M |
| 4.6 | Version history UI | SwarmView.jsx | M |
| 4.7 | TEST GATE Wave 4 | qa-tester | — |

### Wave 5 — Advanced Flow Control (6 features, ~20 tasks)
**Scope:** FR-V5-56 through FR-V5-81
**Depends on:** Wave 2 (palette), Wave 3 (validation)
**Requires DEC decisions:** DEC-027 (conditional eval), DEC-028 (merge convergence), DEC-029 (loop + circuit breaker interaction)

| Order | Feature | Files | Complexity |
|-------|---------|-------|------------|
| 5.1 | Conditional Router node | ConditionalNode.jsx, SwarmEngine.js, WorkflowStore.js | L |
| 5.2 | Merge/Join node | MergeNode.jsx, SwarmEngine.js | L |
| 5.3 | Delay/Timer node | DelayNode.jsx, SwarmEngine.js | M |
| 5.4 | Loop node | LoopNode.jsx, SwarmEngine.js, CircuitBreaker.js | L |
| 5.5 | Error Handler node | ErrorHandlerNode.jsx, SwarmEngine.js | M |
| 5.6 | Sub-workflow node | SubWorkflowNode.jsx, SwarmEngine.js | XL |
| 5.7 | TEST GATE Wave 5 | qa-tester | — |

---

## V5.9. Security Considerations

- SEC-V5-01: Node ID generation must be server-side or validated server-side. Client-generated IDs must match `^[a-z][a-z0-9-]*$` and be re-validated by WorkflowStore on save.
- SEC-V5-02: Imported workflow JSON must be fully validated against WorkflowDefinition schema before creation. No bypass of SEC-V3-02 through SEC-V3-06.
- SEC-V5-03: Sub-workflow execution must not create circular references (workflow A embeds B which embeds A). Maximum nesting depth: 3 levels.
- SEC-V5-04: Condition expressions in Conditional Router and Loop nodes must be evaluated with a safe parser (no `eval()`, no arbitrary JS). Use a whitelist-based expression evaluator: `==`, `!=`, `contains`, `exists`, `>`, `<`, `>=`, `<=` operators only, operating on string/number values from workflowContext.
- SEC-V5-05: Execution history files must follow the same atomic-write and path-validation discipline as WorkflowStore (write-file-atomic, resolved path prefix check).

---

## V5.10. Open Questions (V5)

1. **Auto-layout library:** dagre vs elkjs? Dagre is simpler and lighter. ELK is more powerful for hierarchical layouts with departments. Recommend dagre for V5.0, evaluate ELK for V5.2.
2. **Template source:** Should templates be bundled in the app (static JSON) or fetched from a remote repository? Recommend bundled for V5.0 (no network dependency).
3. **Sub-workflow PTY budget:** Should sub-workflow PTY sessions share the parent's budget pool or have their own? Recommend shared pool for simplicity.
4. **Execution history retention:** How many past executions to keep per workflow? Recommend 100, auto-prune oldest.
5. **Version history retention:** How many workflow versions to keep? Recommend 50, auto-prune oldest.

---

## V5.11. Component Specifications (V5 Additions)

Detailed component specs for V5 new components will be added as tasks are created. The pattern follows Section 11 (V3 Component Specs) — each component gets: Inputs, Outputs, Step-by-step Behavior, Contracts, Acceptance Criteria.

Components requiring specs before implementation:
- `useCanvasHistory` — undo/redo hook
- `NodePalette` — drag-and-drop sidebar
- `ContextMenu` — right-click menus
- `WorkflowSettingsModal` — settings + context editor
- `sanitizeWorkflow` — RF field stripper
- `ConditionalNode` + SwarmEngine conditional evaluation
- `MergeNode` + SwarmEngine convergence tracking
- `LoopNode` + SwarmEngine iteration management
- `SubWorkflowNode` + SwarmEngine nested execution
