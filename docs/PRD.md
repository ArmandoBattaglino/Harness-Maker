# PRD: Claude Code Visual Manager — V3 (Multi-Agent Swarm Orchestrator)
**Version:** 3.0
**Date:** 2026-03-27
**Status:** Draft

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
- FR-V3-19: The server must expose `POST /api/v1/swarm/scaffold` which accepts a plain-English workflow description and uses a Claude job (via JobRunner, `claude -p`) to generate a WorkflowDefinition JSON. The response must stream a valid WorkflowDefinition structure.
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
- FR-V3-30: When an agent is paused for HITL, SwarmEngine must freeze that agent's PTY input (not kill it). On approve, the approved text must be injected via the PTY live injection sequence (see FR-V3-36). On reject, a rejection message must be injected.
- FR-V3-31: The HITL inbox UI must show all pending items with Approve and Reject buttons, the agent label, the pending action text, and timestamp.

**PTY Live Injection and PTY Explosion**
- FR-V3-32: PTY Explosion must allow any agent node to be clicked and expanded into a full-screen xterm.js terminal (reusing the existing `Terminal.jsx` component). This gives the user direct keyboard access to that agent's PTY session. Physical keyboard input works correctly with no special handling.
- FR-V3-33: Programmatic PTY injection (soft broadcast and HITL approval injection) must use the Ink-compatible sequence: `\x03` (Ctrl+C) + 300ms delay + text + `\x1b` + `\r`. Total latency budget: approximately 700ms. This is required because Claude Code's Ink library does not respond to plain `\r` or `\n` for prompt submission.
- FR-V3-34: Two injection modes must be supported: `soft` (queued injection — agent processes after current task) and `hard` (immediate interrupt attempt — `\x03` + inject; unreliable during active tool execution, must be documented as best-effort).

**Broadcast**
- FR-V3-35: `POST /api/v1/swarm/:executionId/broadcast` must accept `{ text, scope: "all" | "department" | "agent", targetId? }` and inject the text into all matched agents using the soft injection mode.
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
       Response: { injectedCount: number }

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
{ type: "agent_status", nodeId, status, lastOutputSnippet }
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
