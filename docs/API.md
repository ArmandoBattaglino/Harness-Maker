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
- `400` — missing/invalid fields, non-absolute path, path traversal attempt
- `404` — path does not exist on the filesystem
- `409` — path already registered

---

### `POST /api/v1/projects/scaffold`

Create a new project directory with a starter `.claude/` structure.

**Request body:** Same as `POST /api/v1/projects`.

**Server actions:** Creates directory, `.claude/agents/`, `.claude/commands/`, and a starter `CLAUDE.md`.

**Response 201:** Same shape as `POST /api/v1/projects`.

**Errors:** `400`, `409` (same as above).

---

### `GET /api/v1/projects/:id`

Get a single project. Returns `pathExists: true|false` to indicate whether the directory still exists.

**Response 200:**
```json
{
  "id": "uuid-v4",
  "name": "my-app",
  "path": "C:\\Users\\arman\\projects\\my-app",
  "createdAt": "2026-03-18T10:00:00.000Z",
  "pathExists": true
}
```

**Errors:** `404`

---

### `DELETE /api/v1/projects/:id`

Remove a project from the registry. Does NOT touch the filesystem.

**Response 204:** No body.

**Errors:** `404`

---

## Sessions

### `GET /api/v1/sessions`

List all active PTY sessions.

**Response 200:**
```json
[
  {
    "id": "uuid-v4",
    "projectId": "uuid-v4",
    "status": "running",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "lastActivityAt": "2026-03-18T10:01:00.000Z"
  }
]
```

---

### `POST /api/v1/sessions`

Start a new PTY session for a project.

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
  "id": "uuid-v4",
  "projectId": "uuid-v4",
  "status": "running"
}
```

**Errors:** `400` — missing projectId or projectPath.

---

### `DELETE /api/v1/sessions/:id`

Kill a PTY session. The PTY process is terminated immediately.

**Response 204:** No body.

**Errors:** `404`

---

## Jobs

### `POST /api/v1/jobs`

Submit a background job (non-interactive Claude Code invocation).

**Request body:**
```json
{
  "projectId": "uuid-v4",
  "projectPath": "C:\\Users\\arman\\projects\\my-app",
  "prompt": "Refactor the auth module to use JWT"
}
```

**Response 201:**
```json
{ "jobId": "uuid-v4" }
```

**Errors:** `400` — missing required fields.

---

### `GET /api/v1/jobs/:id/stream`

Stream job output as Server-Sent Events. Connect with `EventSource`.

**Event types:**
| Event | Data | Description |
|-------|------|-------------|
| `progress` | `{ text: "..." }` | Incremental stdout chunk |
| `done` | `{ result: "..." }` | Job finished — full Markdown result |
| `error` | `{ error: "..." }` | Job failed |

---

### `DELETE /api/v1/jobs/:id`

Cancel a running job. Uses `tree-kill` to terminate the full process tree.

**Response 204:** No body.

---

## Agents

### `GET /api/v1/agents`

List all agents across all four scan locations.

**Response 200:**
```json
{
  "agents": [
    {
      "name": "backend-dev",
      "path": "C:\\Users\\arman\\.claude\\agents\\backend-dev.md",
      "scope": "user",
      "frontmatter": { "description": "...", "model": "..." },
      "body": "You are a backend developer..."
    }
  ]
}
```

---

### `POST /api/v1/agents`

Create a new agent. Name must match `^[a-z][a-z0-9-]*$`.

**Request body:**
```json
{
  "name": "my-agent",
  "scope": "user",
  "frontmatter": { "description": "My agent", "model": "claude-opus-4-5" },
  "body": "You are a specialist in..."
}
```

**Response 201:** The created agent record.

**Errors:** `400` — invalid name or missing fields.

---

### `PUT /api/v1/agents/:name`

Update an existing agent's content or frontmatter.

**Response 200:** Updated agent record.

**Errors:** `400`, `404`

---

### `DELETE /api/v1/agents/:name`

Delete an agent file.

**Response 204:** No body.

**Errors:** `404`

---

## Skills

### `GET /api/v1/skills`

List all skills from all four scan locations.

**Response 200:**
```json
{
  "skills": [
    {
      "name": "commit",
      "scope": "user",
      "path": "C:\\Users\\arman\\.claude\\skills\\commit\\SKILL.md",
      "frontmatter": {},
      "body": "..."
    }
  ]
}
```

---

### `POST /api/v1/skills`, `PUT /api/v1/skills/:name`, `DELETE /api/v1/skills/:name`

Same pattern as agents. Name validation same as agents.

---

## CLAUDE.md

### `GET /api/v1/claudemd`

Retrieve a CLAUDE.md file.

**Query params:** `scope` (`user` | `project`), `projectId` (required when scope=project)

**Response 200:**
```json
{
  "content": "# Project: my-app\n...",
  "path": "C:\\Users\\arman\\.claude\\CLAUDE.md"
}
```

---

### `PUT /api/v1/claudemd`

Save a CLAUDE.md file.

**Request body:** `{ "scope": "user"|"project", "projectId": "...", "content": "..." }`

**Response 200:** `{ "ok": true }`

**Errors:** `400`, `404`

---

## Workflows (V3)

Workflow definitions are persisted to disk and survive server restarts. Execution state is in-memory only.

### `GET /api/v1/workflows`

List all workflow definitions.

**Response 200:**
```json
{
  "workflows": [
    {
      "id": "uuid-v4",
      "name": "Code Review Pipeline",
      "description": "...",
      "nodes": [...],
      "edges": [...],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

### `POST /api/v1/workflows`

Create a workflow definition manually (as opposed to AI-generated via scaffold).

**Request body:** WorkflowDefinition without `id`, `createdAt`, `updatedAt` — server generates those.

**Response 201:** `{ "workflow": { ...WorkflowDefinition } }`

**Errors:**
- `400` — validation failure (details array returned)
- `503` — WorkflowStore unavailable

---

### `GET /api/v1/workflows/:id`

Get a single workflow definition.

**Response 200:** `{ "workflow": { ...WorkflowDefinition } }`

**Errors:** `404`

---

### `PUT /api/v1/workflows/:id`

Full update of a workflow definition.

**Response 200:** `{ "workflow": { ...WorkflowDefinition } }`

**Errors:** `400`, `404`

---

### `DELETE /api/v1/workflows/:id`

Delete a workflow definition. Does not affect running executions.

**Response 204:** No body.

**Errors:** `404`

---

## Swarm Execution (V3)

Swarm executions are in-memory. A server restart clears all running executions.

### `POST /api/v1/swarm/scaffold`

Generate a workflow definition from a natural-language description using the Claude API.

**Request body:**
```json
{
  "prompt": "A pipeline that reviews code, writes tests, then summarizes findings",
  "projectId": "uuid-v4"
}
```

**Response 201:**
```json
{
  "workflowId": "uuid-v4",
  "workflowDef": { ...WorkflowDefinition }
}
```

**Errors:**
- `400` — prompt missing, empty, or exceeds 2000 characters
- `500` — Claude API failure or JSON parse error
- `503` — WorkflowStore unavailable

**Note:** Requires `ANTHROPIC_API_KEY` in the server environment. Uses `claude-haiku-4-5-20251001`.

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
| `scope` | `"all"` \| nodeId | `"all"` targets every running agent; a nodeId targets one agent |
| `mode` | `"soft"` \| `"hard"` | Soft: append text + ESC + newline. Hard: Ctrl-C → 300ms → text + ESC → 100ms → newline |

**Response 200:** `{ "sent": 3 }` (number of agents that received the message)

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
3. Sets agent status to `"running"`.
4. Broadcasts `hitl_resolved` WS event with `decision: "approved"`.

**Response 200:** `{ "ok": true }`

**Errors:** `400` (resumeText too large), `404` (execution or item not found)

---

### `POST /api/v1/swarm/:executionId/inbox/:itemId/reject`

Reject a HITL item. Agent remains paused. Broadcasts `hitl_resolved` with `decision: "rejected"`.

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
| `agent_status` | `executionId`, `nodeId`, `status`, `handoffCount?` | When a single agent's status changes |
| `handoff_started` | `executionId`, `sourceNodeId`, `targetNodeId`, `edgeId`, `counter` | When a HANDOFF token is parsed |
| `circuit_breaker` | `executionId`, `edgeId`, `counter` | When edge crossing threshold is reached (advisory) |
| `budget_update` | `executionId`, `estimatedTokensUsed`, `limitTokens` | When budget estimate is updated |
| `hitl_required` | `executionId`, `nodeId`, `itemId`, `question` | When an agent requests human approval |
| `hitl_resolved` | `executionId`, `itemId`, `nodeId`, `decision` | After approve/reject API call |
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
