# Claude Code Visual Manager — API Reference
**Version:** 3.0
**Date:** 2026-03-28
**Base URL:** `http://127.0.0.1:3000/api/v1` (port configurable via `PORT` env var)

All endpoints respond with `Content-Type: application/json` unless noted otherwise.

All mutating endpoints (POST, PUT, DELETE) require the header:
```
X-Requested-With: ClaudeCodeManager
```
Absence of this header returns `403 Forbidden`. Exception: `POST /api/v1/triggers/webhooks/:path` is called by external systems and is not CSRF-protected.

---

## Table of Contents

- [Projects](#projects)
- [Sessions](#sessions)
- [Jobs](#jobs)
- [Agents](#agents)
- [Skills](#skills)
- [CLAUDE.md](#claudemd)
- [Workflows (V3)](#workflows-v3)
- [Swarm Execution (V3)](#swarm-execution-v3)
- [Execution History (V5)](#execution-history-v5)
- [Workflow Templates (V5)](#workflow-templates-v5)
- [Workflow Versions (V5)](#workflow-versions-v5)
- [HITL Inbox (V3)](#hitl-inbox-v3)
- [Triggers (V3)](#triggers-v3)
- [WebSocket Channels](#websocket-channels)

---

## Projects

### `GET /api/v1/projects`

List all registered projects.

**Response 200:**
```json
[
  {
    "id": "uuid-v4",
    "name": "my-app",
    "path": "C:\\Users\\arman\\projects\\my-app",
    "createdAt": "2026-03-18T10:00:00.000Z"
  }
]
```

---

### `POST /api/v1/projects`

Register an existing directory as a project.

**Request body:**
```json
{
  "name": "my-app",
  "path": "C:\\Users\\arman\\projects\\my-app"
}
```

**Response 201:**
```json
{
  "id": "uuid-v4",
  "name": "my-app",
  "path": "C:\\Users\\arman\\projects\\my-app",
  "createdAt": "2026-03-18T10:00:00.000Z"
}
```

**Errors:**
- `400` ??? prompt missing, empty, or exceeds 2000 characters
- `500` ??? provider failure or invalid model output after provider fallback is exhausted
- `503` ??? WorkflowStore unavailable

**Notes:**
- Provider failures are normalized into client-safe messages when Claude/Codex output is malformed or unavailable.
- If both providers are unavailable with retryable or limit-style failures, the server returns a deterministic local workflow so Prompt-to-Flow still yields a runnable graph.

---

### `POST /api/v1/swarm/:workflowId/start`

Start executing a workflow. Spawns a PTY session for the triage (first) agent node.

**Request body:**
```json
{
  "projectId": "uuid-v4",
  "projectPath": "C:\\Users\\arman\\projects\\my-app"
}
```

**Response 201:**
```json
{
  "executionId": "uuid-v4",
  "status": "running"
}
```

**Errors:**
- `400` — projectId or projectPath missing
- `404` — workflowId not found

---

### `POST /api/v1/swarm/:executionId/pause`

Send Ctrl-C (`\x03`) to all currently running agent PTY sessions in the execution, then set each running agent's status to `"paused"` and broadcast `agent_status` WS events for each.

**Server actions:**
1. For each agent with `status === "running"`: writes `\x03` to its PTY session.
2. Calls `SwarmEngine.pauseExecution()` to set agent states to `"paused"` and broadcast `agent_status` WS events.

**Response 200:** `{ "ok": true }`

**Errors:** `404`

---

### `POST /api/v1/swarm/:executionId/resume`

Resume all paused agents. Sets each agent with `status === "paused"` back to `"running"` and broadcasts `agent_status` WS events for each.

**Server actions:**
1. Calls `SwarmEngine.resumeExecution()` to update agent states from `"paused"` to `"running"`.
2. Broadcasts `agent_status` WS event for each resumed agent.

**Note:** Does not re-inject prompts or re-spawn PTY sessions — agents continue from where they were interrupted.

**Response 200:** `{ "ok": true }`

**Errors:** `404`

---

### `DELETE /api/v1/swarm/:executionId`

Stop an execution. Kills all agent PTY sessions and clears execution state.

**Response 204:** No body.

---

### `GET /api/v1/swarm/:executionId/status`

Get full execution status snapshot.

**Response 200:**
```json
{
  "executionId": "uuid-v4",
  "status": "running",
  "agentStates": {
    "node-1": {
      "status": "done",
      "sessionId": "uuid-v4",
      "handoffCount": 2,
      "lastOutputSnippet": "Task complete."
    },
    "node-2": {
      "status": "running",
      "sessionId": "uuid-v4",
      "handoffCount": 0,
      "lastOutputSnippet": "Analyzing code..."
    }
  },
  "edgeCounters": {
    "edge-1": 2
  },
  "budget": {
    "estimatedTokensUsed": 1500,
    "limitTokens": 0
  }
}
```

`budget.estimatedTokensUsed` is derived from `BudgetTracker.getTotal(executionId)` — the sum of all output characters across all agent sessions for this execution (characters used as a proxy for tokens). `limitTokens` is drawn from the workflow definition's `settings.budgetTokens` field; `0` means no limit configured.

**Errors:** `404`

---

### `GET /api/v1/swarm/:executionId/agent/:nodeId/output`

Get the full ring buffer contents for an agent's PTY session.

**Response 200:** `{ "output": "...raw terminal output..." }`

**Errors:** `404` — execution not found, agent not in execution, or session not found.

---

### `POST /api/v1/swarm/:executionId/broadcast`

Send text to running agent PTY sessions filtered by scope.

**Request body:**
```json
{
  "text": "Please wrap up your current task and summarize findings.",
  "scope": "all",
  "mode": "soft"
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `text` | string | Text to send to agents (required) |
| `scope` | `"all"` \| `"department"` \| `"agent"` | Broadcast target mode |
| `mode` | `"soft"` \| `"hard"` | Soft: append text + ESC + newline. Hard: Ctrl-C → 300ms → text + ESC → 100ms → newline |

**Response 200:** `{ "sent": 3, "scope": "department", "targetId": "dept-1", "recipientNodeIds": ["agent-1", "agent-2"] }`

**Errors:** `400` — text missing or not a string; `404` — execution not found.

---

## HITL Inbox (V3)

### `GET /api/v1/swarm/:executionId/inbox`

List pending HITL items for an execution.

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid-v4",
      "nodeId": "node-2",
      "question": "Should I proceed with deleting the legacy auth module?",
      "createdAt": "2026-03-28T10:00:00.000Z"
    }
  ]
}
```

**Errors:** `404`

---

### `POST /api/v1/swarm/:executionId/inbox/:itemId/approve`

Approve a HITL item. Optionally provide resume text to send to the agent's PTY.

**Request body:**
```json
{
  "resumeText": "Yes, proceed with deletion. Ensure you commit first."
}
```

**Validation:** `resumeText` must be <= 8192 bytes (400 if exceeded).

**Server actions:**
1. Removes item from `inboxItems`.
2. If `resumeText` provided, writes it + newline to the agent's PTY session.
3. Resumes the frozen agent via `SwarmEngine.unfreezeAgent()`.
4. Broadcasts `hitl_resolved` WS event with `decision: "approved"`.

**Response 200:** `{ "ok": true }`

**Errors:** `400` (resumeText too large), `404` (execution or item not found)

---

### `POST /api/v1/swarm/:executionId/inbox/:itemId/reject`

Reject a HITL item. The server injects explicit rejection guidance into the PTY, resumes the agent via `SwarmEngine.unfreezeAgent()`, and broadcasts `hitl_resolved` with `decision: "rejected"`.

**Request body:** None required.

**Response 200:** `{ "ok": true }`

**Errors:** `404`

---

## Triggers (V3)

### `POST /api/v1/triggers/webhooks/:path`

Webhook receiver endpoint. Called by external systems to trigger a workflow.

**Headers:** No CSRF header required — this endpoint is designed for external callers.

**Rate limit:** 10 requests per minute per IP.

**Body size limit:** 32 KB.

**Request body:** Any JSON payload (passed to TriggerManager as-is).

**Response 200:** `{ "received": true }` — always, regardless of whether a matching workflow was found. This prevents external callers from discovering internal workflow structure.

**Example:**
```bash
curl -X POST http://127.0.0.1:3000/api/v1/triggers/webhooks/github-push \
  -H "Content-Type: application/json" \
  -d '{"ref": "refs/heads/main", "repository": {"name": "my-app"}}'
```

---

### `GET /api/v1/triggers`

List all currently registered triggers (webhooks + RSS pollers).

**Response 200:**
```json
{
  "triggers": {
    "webhooks": [
      { "path": "github-push", "workflowId": "uuid-v4" }
    ],
    "rssPollers": [
      { "url": "https://example.com/feed.xml", "workflowId": "uuid-v4", "intervalMs": 60000 }
    ]
  }
}
```

---

## Execution History (V5)

### `GET /api/v1/swarm/history/:workflowId`

List all execution history entries for a workflow. Returns up to 100 entries (oldest trimmed), ordered oldest-first.

**Response 200:**
```json
{
  "executions": [
    {
      "executionId": "uuid-v4",
      "workflowId": "uuid-v4",
      "status": "completed",
      "startedAt": "2026-04-06T10:00:00.000Z",
      "endedAt": "2026-04-06T10:05:30.000Z",
      "durationMs": 330000,
      "nodesRun": 3,
      "outcome": "All agents completed successfully.",
      "nodeSnapshots": {}
    }
  ]
}
```

**Errors:** `500` — internal server error.

---

### `GET /api/v1/swarm/history/:workflowId/:executionId`

Get a single execution history entry.

**Response 200:**
```json
{
  "execution": {
    "executionId": "uuid-v4",
    "workflowId": "uuid-v4",
    "status": "completed",
    "startedAt": "2026-04-06T10:00:00.000Z",
    "endedAt": "2026-04-06T10:05:30.000Z",
    "durationMs": 330000,
    "nodesRun": 3,
    "outcome": "All agents completed successfully.",
    "nodeSnapshots": {}
  }
}
```

**Errors:**
- `404` — execution history entry not found.
- `500` — internal server error.

---

## Workflow Templates (V5)

### `GET /api/v1/workflows/templates`

List all built-in workflow templates. Returns summary metadata (no full node/edge definitions).

**Response 200:**
```json
{
  "templates": [
    {
      "id": "content-agency",
      "name": "Content Agency",
      "description": "A three-agent pipeline: writer drafts content, editor refines it, publisher formats and delivers.",
      "nodeCount": 3,
      "edgeCount": 2
    }
  ]
}
```

Available templates: `content-agency`, `code-review-chain`, `research-loop`, `customer-support-triage`, `data-pipeline`.

---

### `POST /api/v1/workflows/templates/:templateId/instantiate`

Create a new workflow from a built-in template. Deep-clones the template's nodes, edges, and settings into a new workflow via `WorkflowStore.create()`.

**Request body:** `{}` (empty object — no fields required)

**Response 201:**
```json
{
  "workflow": {
    "id": "uuid-v4",
    "name": "Content Agency",
    "description": "A three-agent pipeline: ...",
    "nodes": [ ... ],
    "edges": [ ... ],
    "settings": { "maxConcurrentAgents": 1, "circuitBreakerThreshold": 10 },
    "createdAt": "2026-04-06T10:00:00.000Z",
    "updatedAt": "2026-04-06T10:00:00.000Z"
  }
}
```

**Errors:**
- `404` — template not found (`{ "error": "Template not found", "templateId": "..." }`).
- `503` — WorkflowStore unavailable.

---

## Workflow Versions (V5)

### `GET /api/v1/workflows/:id/versions`

List version history metadata for a workflow. Versions are created automatically on each `PUT /api/v1/workflows/:id` (save). Maximum 50 versions per workflow; oldest are trimmed.

**Response 200:**
```json
{
  "versions": [
    {
      "timestamp": "2026-04-06T10-00-00-000Z",
      "name": "My Workflow",
      "nodeCount": 4,
      "savedAt": "2026-04-06T10-00-00-000Z"
    }
  ]
}
```

**Errors:**
- `404` — workflow not found.

---

### `POST /api/v1/workflows/:id/versions/:timestamp/restore`

Restore a previous version as the current workflow. The current workflow is saved as a new version before restoring (so no data is lost). Returns the restored workflow definition.

**Request body:** `{}` (empty object)

**Response 200:**
```json
{
  "workflow": {
    "id": "uuid-v4",
    "name": "My Workflow",
    "nodes": [ ... ],
    "edges": [ ... ],
    "settings": { ... },
    "updatedAt": "2026-04-06T10:05:00.000Z"
  }
}
```

**Errors:**
- `404` — version not found (`"Version not found: <id>@<timestamp>"`).

---

## WebSocket Channels

### Terminal Channel

**URL:** `ws://127.0.0.1:PORT/ws?sessionId=<uuid>`

**Required header on upgrade:** `X-Requested-With: ClaudeCodeManager`

**Client → Server messages (JSON):**
```json
{ "type": "input", "data": "ls -la\r" }
{ "type": "resize", "cols": 120, "rows": 40 }
```

**Server → Client:** Raw binary PTY bytes (not JSON-wrapped). Pass directly to `xterm.js Terminal.write()`.

**Close codes:** `4001` (unauthorized), `4004` (session not found)

---

### Swarm Channel (V3)

**URL:** `ws://127.0.0.1:PORT/ws/swarm?executionId=<uuid>`

Server-push only — no client-to-server messages. Control commands use the REST API.

**Server → Client events (JSON):**

| `type` | Key payload fields | When sent |
|--------|--------------------|-----------|
| `execution_status` | `executionId`, `status`, `agentStates` | On connect (initial snapshot) + on status change |
| `agent_status` | `executionId`, `nodeId`, `status`, `sessionId`, `lastOutputSnippet`, `spawnMode` | When a single agent's status changes or live PTY output updates its snippet |
| `chat_message` | `nodeId`, `role`, `text`, `timestamp`, `isCanonical` (optional), `spawnMode` (optional) | Each `text_delta` during a stream-json turn (incremental text). When `isCanonical: true`, the `text` field contains the authoritative result text from the Claude CLI `result` event, replacing all previously streamed fragments (fixes token-boundary spacing). |
| `agent_tool_use` | `nodeId`, `toolName`, `toolUseId` | When a stream-json agent starts a tool call |
| `agent_tool_delta` | `nodeId`, `toolUseId`, `partialJson` | Partial tool input JSON during a stream-json tool call |
| `agent_thinking` | `nodeId`, `active` | When a stream-json agent enters (`active: true`) or exits (`active: false`) a thinking block |
| `agent_cost` | `nodeId`, `inputTokens`, `outputTokens`, `costUsd`, `durationMs`, `cacheReadTokens`, `cacheWriteTokens`, `totalInputTokens`, `totalOutputTokens`, `totalCostUsd` | After each stream-json turn completes (result event) |
| `handoff_started` | `executionId`, `sourceNodeId`, `targetNodeId`, `edgeId`, `counter`, `payload` | When a HANDOFF token is parsed |
| `handoff_completed` | `executionId`, `sourceNodeId`, `targetNodeId` | When the handoff target agent has been spawned |
| `circuit_breaker` | `executionId`, `edgeId`, `counter` | When edge crossing threshold is reached (advisory) |
| `budget_update` | `executionId`, `estimatedTokensUsed`, `limitTokens` | When budget estimate is updated |
| `hitl_required` | `executionId`, `nodeId`, `itemId`, `question` | When an agent requests human approval |
| `hitl_resolved` | `executionId`, `itemId`, `nodeId`, `decision` | After approve/reject API call |
| `runtime_provider_switch` | `fromProvider`, `toProvider`, `reason`, `nodeId` | When AUTO mode falls back to a different provider |
| `trigger_fired` | `triggerId`, `nodeId`, `firedAt` | When a trigger node fires |
| `trigger_status` | `triggerId`, `nodeId`, `status` | When a trigger's lifecycle status changes |
| `rss_item` | `url`, `title`, `link`, `pubDate` | When RSS poller finds a new item |

**Example client subscription:**
```javascript
const ws = new WebSocket(`ws://127.0.0.1:3000/ws/swarm?executionId=${executionId}`);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'agent_status') {
    // update UI for msg.nodeId
  }
};
```
