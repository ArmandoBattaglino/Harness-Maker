# Full Research Brief: Claude Code Visual Manager V3 — Swarm Orchestrator
_Supervisor synthesis · 2026-03-27_
_Coverage: 3 topics from Researchers (A, B, C) + architectural synthesis_

---

## Tech Stack — Final Recommendations

| Layer | Chosen | Version | Why | Alternatives considered & rejected |
|-------|--------|---------|-----|-------------------------------------|
| Canvas | @xyflow/react | v12 | Official React Flow v12 — immutable updates, parentId group nodes, mature API | D3.js: too low-level, no built-in node system; Cytoscape: not React-native |
| State (execution) | Zustand | ^4 | Already in project (AppContext); slice subscriptions prevent re-render storms | Redux: overkill; Context: triggers global re-renders on every agent tick |
| State (canvas) | React Flow internal | v12 | `useReactFlow()` hooks + `setNodes`/`setEdges` — kept separate from execution state | Mixing with Zustand: causes updateNode bug #5036 |
| PTY | node-pty | ^1.0 | Already in project; `session.swarmListeners` Set for tap without replacing DEC-009 handler | node-pty-prebuilt-multiarch: not available (R-01 known issue) |
| Backend orchestration | SwarmEngine.js (custom) | — | Equivalent to OpenAI Swarm `client.run()` — manages workflowContext flat dict, handoff loop, circuit breaker | No viable off-the-shelf equivalent for Claude CLI PTY |
| Handoff parsing | HandoffParser.js (custom) | — | Stateful rolling 4KB byte accumulator; three-state FSM; ANSI stripping | Line-by-line: fails on ConPTY chunk splits (Windows) |
| Workflow persistence | WorkflowStore.js (custom) | — | Pattern identical to existing ConfigStore; UUID-named JSON on disk | SQLite: heavy dependency for simple JSON files |
| HTTP | Express | 4.x (existing) | Already in project; add new `app.use()` only | — |
| WebSocket | ws (existing) | 8.x | `channel=swarm` routing on existing `wss` | Socket.io: not needed, existing ws works |

---

## Architecture Deep Dive

### Execution Flow

```
User clicks ▶ Start
     │
     ▼
POST /api/v1/swarm/:workflowId/start
     │
     ▼
SwarmEngine.startExecution(workflowId)
  ├── Load WorkflowDefinition from WorkflowStore
  ├── Create WorkflowExecution in memory
  ├── Validate schema (SEC-V3-02)
  ├── Find triage/entry node (isTriageNode === true, or first node)
  └── spawnAgentPty(entryNodeId, workflowContext)
           │
           ▼
     SessionManager.createSession(projectId, systemPrompt)
           │
           ├── session.swarmListeners = new Set()   ← tap without removing primary DEC-009 handler
           ├── session.pty.onData(primary_handler)   ← DEC-009: NEVER removed
           └── session.pty.onData(swarmTapCallback)  ← second listener
                    │
                    ▼
              HandoffParser.feed(chunk)
                    │
                    ├── SCANNING state: accumulate bytes (4KB max)
                    ├── Detect __HANDOFF__:<targetId>:<base64json>
                    └── Detect __DONE__ (soft notify only — workflow continues)
                              │
                              ▼
                    SwarmEngine.executeHandoff(sourceId, targetId, contextUpdate)
                              │
                              ├── CircuitBreaker.check(edgeId)   ← threshold 10
                              ├── Merge contextUpdate into workflowContext (shallow, not replace)
                              ├── BudgetTracker.estimate(tokenCount)  ← soft warn only
                              ├── spawnAgentPty(targetId, updatedContext)
                              └── emit WS { type: 'handoff_started', ... }
```

### Canvas Architecture (React Flow v12)

Two completely separate state trees:

```
React Flow Internal State (canvas layout)
  ├── nodes[]  ← positions, parentId, hidden, style (width/height via style only)
  └── edges[]  ← connections, hidden

Zustand ExecutionStore (swarm runtime)
  ├── executions: Map<executionId, WorkflowExecution>
  ├── agentStates: Map<nodeId, AgentState>
  ├── focusedDepartmentId: string | null
  ├── departmentStack: string[]
  └── inboxItems: InboxItem[]
```

`AgentNode` subscribes to its own Zustand slice: `useExecutionStore(s => s.agentStates.get(nodeId))`. Canvas re-renders only on layout changes. Execution state changes never touch `setNodes`.

### DepartmentNode Matrioska

```
focusedDepartmentId === null   → show all top-level nodes + collapsed dept nodes
focusedDepartmentId === 'dept-X' → filter: show dept-X + children with parentId === 'dept-X'
                                    → call reactFlowInstance.fitView()
                                    → push 'dept-X' to departmentStack

BreadcrumbBar: Home > Marketing > Copywriting
  click 'Home' → pop stack to [], focusedDepartmentId = null
  click 'Marketing' → pop stack to ['dept-marketing'], focusedDepartmentId = 'dept-marketing'
```

---

## Implementation Patterns

### HandoffParser (CRITICAL — must be stateful rolling buffer)

ConPTY on Windows splits PTY output into arbitrary byte chunks. `__HANDOFF__:target-id:base64payload` may arrive as 3 separate chunks. Line-by-line parsing WILL miss tokens.

**Pattern: Three-state FSM with 4KB rolling accumulator**

```js
class HandoffParser {
  constructor() {
    this._buf = '';          // rolling accumulator (max 4KB)
    this._state = 'SCANNING';
    this._target = '';
    this._payload = '';
  }

  feed(rawChunk) {
    // 1. Strip ANSI escape codes
    const chunk = rawChunk.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
                           .replace(/\r\n/g, '\n');
    this._buf += chunk;

    // 2. Enforce 4KB cap (flush oldest bytes)
    if (this._buf.length > 4096) {
      this._buf = this._buf.slice(this._buf.length - 4096);
    }

    // 3. Extract tokens
    const results = [];
    let match;

    // Handoff token
    const handoffRe = /__HANDOFF__:([^:\s]+):([A-Za-z0-9+/=]+)/g;
    while ((match = handoffRe.exec(this._buf)) !== null) {
      try {
        const ctx = JSON.parse(Buffer.from(match[2], 'base64').toString('utf8'));
        results.push({ type: 'handoff', targetId: match[1], contextUpdate: ctx });
      } catch (_) { /* malformed base64/JSON — skip */ }
    }

    // Done token
    if (/__DONE__/.test(this._buf)) {
      results.push({ type: 'done' });
    }

    // Clear matched region
    if (results.length) this._buf = '';

    return results;
  }

  reset() { this._buf = ''; this._state = 'SCANNING'; }
}
```

**Security:** The 4KB cap from SEC-V3-07 is enforced here. The parsed `contextUpdate` object must be schema-validated before merge (max depth 2, max keys 50, max string value 1KB).

### SwarmEngine Context Propagation (OpenAI Swarm pattern)

```js
// On handoff detected:
async executeHandoff(sourceNodeId, targetNodeId, contextUpdate) {
  // 1. Circuit breaker
  const edgeId = this._findEdge(sourceNodeId, targetNodeId);
  const count = (this._edgeCounters.get(edgeId) || 0) + 1;
  if (count >= this._threshold) {
    return this._freezeAndNotify(edgeId, count);
  }
  this._edgeCounters.set(edgeId, count);

  // 2. Merge context (SHALLOW MERGE — matching OpenAI Swarm behavior)
  Object.assign(this._workflowContext, contextUpdate);  // not replace, merge

  // 3. Build system prompt for target agent
  const targetNode = this._workflow.nodes.find(n => n.id === targetNodeId);
  const systemPrompt = this._renderSystemPrompt(targetNode, this._workflowContext);

  // 4. Spawn or reuse PTY
  const sessionId = await this._spawnOrGetSession(targetNodeId, systemPrompt);

  // 5. Emit WS event
  this._emitWS({ type: 'handoff_started', sourceNodeId, targetNodeId, edgeId, counter: count });
}

_renderSystemPrompt(node, context) {
  const handoffTargets = this._workflow.edges
    .filter(e => e.source === node.id)
    .map(e => e.target);

  return `${node.data.systemPrompt}

--- SWARM PROTOCOL (mandatory) ---
Current workflow context:
${Object.entries(context).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n')}

When your task is complete and you must pass to another agent, output EXACTLY (last line only):
__HANDOFF__:<targetId>:<base64_json_context_update>

Valid target IDs: ${handoffTargets.join(', ')}

When fully done (no handoff needed):
__DONE__

Do NOT output the handoff token mid-response. Only as the very last line.
--- END PROTOCOL ---`;
}
```

### DepartmentNode Expand/Collapse

```jsx
// In DepartmentNode.jsx
const DepartmentNode = ({ id, data }) => {
  const { setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const setFocused = useExecutionStore(s => s.setFocusedDepartment);

  const toggleCollapse = useCallback(() => {
    const collapsed = !data.collapsed;
    const childIds = new Set(getNodes().filter(n => n.parentId === id).map(n => n.id));

    // Immutable update — REQUIRED in v12
    setNodes(nodes => nodes.map(n =>
      childIds.has(n.id) ? { ...n, hidden: collapsed } : n
    ));
    setEdges(edges => edges.map(e =>
      childIds.has(e.source) || childIds.has(e.target)
        ? { ...e, hidden: collapsed }
        : e
    ));
    // Update collapsed state in node data
    setNodes(nodes => nodes.map(n =>
      n.id === id ? { ...n, data: { ...n.data, collapsed } } : n
    ));
  }, [id, data.collapsed, setNodes, setEdges, getNodes]);

  const handleDoubleClick = useCallback(() => {
    setFocused(id);  // triggers matrioska drill-down in SwarmCanvasView
  }, [id, setFocused]);

  return (
    <div className="department-node" onDoubleClick={handleDoubleClick}>
      <button onClick={toggleCollapse}>{data.collapsed ? '▶' : '▼'}</button>
      <span>{data.label}</span>
    </div>
  );
};
```

### PTY Live Injection — Two-Mode Broadcast

```js
// SwarmEngine.broadcast(text, scope, mode)
// scope: 'all' | departmentId | agentNodeId
// mode: 'soft' | 'hard'

async broadcastToAgent(sessionId, text, mode = 'soft') {
  if (mode === 'hard') {
    // Hard broadcast: interrupt first, then inject
    sessionManager.writeInput(sessionId, '\x03');        // Ctrl+C
    await sleep(300);                                      // wait for yield
    sessionManager.writeInput(sessionId, text);
    await sleep(300);
    sessionManager.writeInput(sessionId, '\x1b');         // Escape (dismiss Ink autocomplete)
    await sleep(100);
    sessionManager.writeInput(sessionId, '\r');           // Enter
  } else {
    // Soft broadcast: queue only — agent processes after current task
    sessionManager.writeInput(sessionId, text);
    await sleep(300);
    sessionManager.writeInput(sessionId, '\x1b');
    await sleep(100);
    sessionManager.writeInput(sessionId, '\r');
  }
}

// NOTE: Hard broadcast interruption is NOT guaranteed during tool execution phases.
// Total latency per agent: ~700ms (hard) or ~400ms (soft).
// PTY Explosion (physical keyboard): works correctly — no special handling needed.
```

### Prompt-to-Flow JSON Extraction

```js
// In SwarmEngine.scaffoldFromPrompt(prompt, projectId)
const scaffoldSystemPrompt = `Output ONLY valid JSON (no markdown, no explanation).
Schema: { "name":"...", "nodes":[...], "edges":[...] }
AgentNode: { "id":"agent-<slug>", "type":"agent", "position":{"x":N,"y":N},
  "data":{ "label":"...", "systemPrompt":"...", "tools":[], "model":"claude-sonnet-4-6",
           "isTriageNode": false } }
DepartmentNode: { "id":"dept-<slug>", "type":"department", "position":{"x":N,"y":N},
  "style":{"width":400,"height":300}, "data":{"label":"..."} }
Edge: { "id":"e-src-tgt", "source":"...", "target":"...", "type":"handoff" }
Auto-layout: 280px horizontal spacing, 160px vertical spacing.
User request: ${prompt}`;

const result = await jobRunner.startJob(projectId, projectPath, scaffoldSystemPrompt, 'none', 1);

// Extract JSON from result — strip any markdown fences Claude might add
const jsonMatch = result.match(/```json\n([\s\S]+?)\n```/) ||
                  result.match(/(\{[\s\S]+\})/);
if (!jsonMatch) throw new Error('SCAFFOLD_PARSE_FAILED');  // frontend shows toast, no raw log (SEC-08)

const workflow = JSON.parse(jsonMatch[1]);
// Validate schema before saving
await workflowStore.create(projectId, workflow);
```

---

## Security Requirements (Mandatory — from SEC-V3-01 through SEC-V3-07)

### SEC-V3-01: Webhook Body Size Cap
- **Risk:** PTY spam / memory exhaustion via oversized webhook payloads
- **Implementation:** `express.json({ limit: '32kb' })` on `/api/v1/triggers/webhooks/*`
- **Verification:** POST 33KB body → 413 response

### SEC-V3-02: WorkflowDefinition Schema Validation
- **Risk:** Malicious workflow with oversized systemPrompt spawning unbounded PTY
- **Implementation:** Validate on `WorkflowStore.create()` and before any `SwarmEngine.startExecution()`: `systemPrompt` max 16KB, node count max 50, edge count max 200, `id` field must match `^[a-z][a-z0-9-]*$`
- **Verification:** Create workflow with 17KB systemPrompt → 400 response

### SEC-V3-03: SSRF Prevention (RSS/Webhook URLs)
- **Risk:** TriggerManager polling attacker-controlled internal URLs (127.x, 10.x, 172.16-31.x, 192.168.x, ::1)
- **Implementation:** Before any `fetch()` in TriggerManager, resolve the URL and check against private IP ranges. Block and log if matched.
- **Verification:** Set RSS URL to `http://192.168.1.1/feed` → blocked, error logged

### SEC-V3-04: Webhook Rate Limiting
- **Risk:** Flood of webhook triggers overwhelming the swarm
- **Implementation:** Separate rate limiter for `/api/v1/triggers/webhooks/*`: 10 req/min per source IP (vs main 200 req/min)
- **Verification:** Send 11 webhook calls in 60s → 11th returns 429

### SEC-V3-05: HITL Resume Text Size Cap
- **Risk:** Oversized resume text injected into agent PTY
- **Implementation:** `POST /api/v1/inbox/:itemId/approve` — validate `body.resumeText` max 8KB. Return 400 if exceeded.
- **Verification:** Approve with 9KB resumeText → 400 response

### SEC-V3-06: Workflow Name/Description Sanitization
- **Risk:** XSS via workflow name rendered in React without escaping (if React escaping is bypassed)
- **Implementation:** Server-side: `name` max 100 chars, `/^[\w\s\-\.]+$/`; `description` max 500 chars. Return 400 on violation.
- **Verification:** Create workflow with `<script>alert(1)</script>` name → 400

### SEC-V3-07: HandoffParser Payload Sanitization
- **Risk:** `contextUpdate` from handoff token injected into `workflowContext` without size limits
- **Implementation:** After parsing: max depth 2, max keys 50, max string value 1KB. Reject oversized updates (log, don't crash)
- **Verification:** Emit `__HANDOFF__:target:<base64 of 2KB string>` → rejected, agent not crashed

---

## Reference Implementations

- **OpenAI Swarm (conceptual reference):** Hub-and-spoke triage pattern, `context_variables` merge semantics, `Result` wrapper — https://github.com/openai/swarm
- **React Flow SubFlows:** Official group node + parentId example — https://reactflow.dev/examples/grouping/sub-flows
- **React Flow Hidden Nodes:** Expand/collapse via `hidden` flag — https://reactflow.dev/examples/nodes/hidden
- **PTY Injection workaround:** Escape + delay + Enter pattern — https://github.com/anthropics/claude-code/issues/15553

---

## Per-Agent Guidance

### → For Architect
- `SwarmEngine.js` is the `client.run()` equivalent — it's the most complex new file
- `HandoffParser.js` must be a pure class (no side effects) — unit testable with buffer injection
- `WorkflowStore.js` follows exact same pattern as existing `ConfigStore.js` — read it before writing
- `SessionManager.js` stays UNTOUCHED. SwarmEngine taps via `session.swarmListeners` Set only
- React Flow canvas state and Zustand execution state MUST be separate — never mix

### → For Backend Dev
- Start with `WorkflowStore.js` (simple) → `HandoffParser.js` (critical) → `SwarmEngine.js` skeleton → routes → WS handler
- `child.stdin.end()` after every spawn (DEC-005)
- `shell: false` always (SEC-02)
- `write-file-atomic` for all workflow JSON writes (project-wide constraint)
- Heartbeat writes every 5 minutes to active PTY sessions to prevent idle sweeper (30min default)
- SwarmEngine spawn: inject system prompt via first `writeInput()` call, then `stdin.end()` is NOT needed (interactive session, not job)

### → For Frontend Dev
- Install: `npm install @xyflow/react zustand` in client/
- `SwarmContext.jsx` + Zustand store in same file — keep it separate from existing `AppContext.jsx`
- `AgentNode.jsx` uses `React.memo` + subscribes to its Zustand slice only
- All `setNodes` calls MUST spread: `{ ...node, data: { ...node.data } }` — mutation breaks v12
- `displayedNodes` and `displayedEdges` are `useMemo` in `SwarmCanvasView` — not in store
- PTY Explosion reuses `Terminal.jsx` 100% — just pass different `sessionId`

### → For QA Tester
- 110 existing tests must stay green (no modifications to existing services)
- New tests needed: HandoffParser unit tests (buffer split simulation), SwarmEngine integration tests (mock SessionManager)
- E2E: Canvas create → scaffold → start execution → PTY explosion → handoff → circuit breaker → HITL approve

### → For Security
- All 7 SEC-V3-* requirements above must be in the PRD and verified
- Webhook endpoints are CSRF-exempt (external callers) but need the 32KB cap + rate limiter
- `POST /api/v1/swarm/scaffold` must not log the user prompt (SEC-08 equivalent)
- WorkflowDefinition IDs: must be UUIDs (generated server-side, never client-supplied as primary key)

---

## Open Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Ctrl+C injection fails during tool execution | HIGH | MEDIUM | Hard broadcast is "best effort" — document this; use soft broadcast as default; expose UI status |
| Claude refuses to emit `__HANDOFF__` token in some responses | MEDIUM | HIGH | System prompt must be very explicit; add retry logic with re-injection of protocol reminder |
| ConPTY splits `__HANDOFF__` token across >3 chunks | LOW | HIGH | 4KB rolling accumulator handles this; tested pattern |
| React Flow v12 `updateNode` bug #5036 causes selection glitches | MEDIUM | LOW | Use `setNodes` with map callback, avoid `updateNode` |
| Idle sweeper kills long-running agent PTY | MEDIUM | HIGH | Heartbeat writes every 5 minutes from SwarmEngine |
| WorkflowContext grows unbounded over many handoffs | MEDIUM | MEDIUM | SEC-V3-07 caps per-update; add global context size cap (100KB) |
