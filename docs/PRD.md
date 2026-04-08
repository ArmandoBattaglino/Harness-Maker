# PRD: Stream-JSON Agent Migration for Swarm Engine
**Version:** 6.0
**Date:** 2026-04-08
**Status:** Draft

---

## 1. Problem Statement

The current Swarm Engine spawns all Claude provider agents via PTY (node-pty), routing their raw terminal output through a complex pipeline: ANSI stripping, ConPTY artifact removal (120+ noise regexes), HandoffParser rolling byte accumulator, ChatExtractor, chatTextNormalization, and replay-noise filtering. This pipeline exists solely because PTY output is unstructured terminal bytes. Claude CLI now supports `--output-format stream-json`, which emits structured NDJSON events with clean text, tool usage, cost data, and session continuity via `--session-id` and `--resume`. Migrating Claude provider agents to stream-json eliminates the entire ConPTY artifact handling pipeline, provides real-time tool-use visibility, per-turn cost tracking, and reliable session persistence — none of which are possible with PTY scraping.

**Who has this problem:** Users running multi-agent Swarm workflows with Claude provider agents who experience ConPTY parsing artifacts (word fusion, dropped handoff tokens, echo gate timing issues) and lack visibility into tool usage and cost.

**Why it matters:** Stream-json output is deterministic and structured. It eliminates the #1 class of runtime bugs in the current system (ConPTY text parsing failures) and unlocks features (thinking indicators, live tool streaming, per-turn cost) that are impossible with PTY scraping.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Eliminate ConPTY parsing artifacts for Claude agents | ConPTY-related bug reports for Claude agents | 0 |
| Real-time tool visibility | Tool name + streaming args visible in chat UI within 200ms of CLI emission | 100% of tool_use events |
| Per-turn cost tracking | Cost displayed after each agent turn | Accurate to values reported by `result` event |
| Session continuity across turns | Agent resumes conversation context after graceful stop | Verified via `--resume` round-trip |
| Backward compatibility | Codex and Gemini agents continue working via PTY | 0 regressions in existing PTY tests |
| Old code preservation | All replaced code commented with markers, not deleted | 100% of replaced blocks marked |

---

## 3. User Stories

- As a user, I want to see a "Thinking..." indicator when a Claude agent is processing, so that I know the agent is active before any text appears.
- As a user, I want to see tool names and their arguments streaming in real-time in the chat view, so that I can observe exactly what the agent is doing.
- As a user, I want to see token count and cost after each agent turn, so that I can track spending per agent.
- As a user, I want specific error messages when a Claude agent fails (rate limit, authentication, tool error), so that I can take targeted action instead of guessing.
- As a user, I want to gracefully stop an agent (wait for its current turn to finish) and resume it later, so that I do not lose conversation context.
- As a user, I want to reset an agent (kill it, archive its history, start fresh), so that I can restart an agent from scratch when needed.
- As a user, I want to configure which tools each agent can use via a UI panel, so that I can restrict agents to safe operations.
- As a user, I want the tool whitelist to persist across sessions, so that I do not have to reconfigure it every time.

---

## 4. Functional Requirements

### Must Have (MVP)

**StreamJsonParser**
- FR-SJ-01: The system must provide a `StreamJsonParser` class that accepts raw NDJSON lines (one JSON object per line) and emits typed events: `text_delta`, `tool_start`, `tool_delta`, `tool_stop`, `thinking`, `result`, `api_retry`, `error`.
- FR-SJ-02: StreamJsonParser must handle malformed lines by skipping them and logging a warning. A per-line size cap of 1 MB must be enforced; lines exceeding this cap must be dropped with a warning log. (SEC-SJ-03)
- FR-SJ-03: StreamJsonParser must map Claude CLI stream-json events as follows:
  - `system` with subtype `api_retry` maps to `api_retry` event
  - `content_block_start` with type `text` maps to `text_start`
  - `content_block_start` with type `tool_use` maps to `tool_start` (includes tool name and id)
  - `content_block_delta` with type `text_delta` maps to `text_delta` (includes text string)
  - `content_block_delta` with type `input_json_delta` maps to `tool_delta` (includes partial JSON string)
  - `content_block_stop` maps to `tool_stop` or `text_stop` (based on active block type)
  - `result` maps to `result` (includes session_id, cost_usd, duration_ms, usage, is_error)
  - `assistant` type with `message.content` maps to `message` (complete assistant message for non-streaming path)

**SwarmEngine Stream-JSON Spawner**
- FR-SJ-04: SwarmEngine must add a `_spawnAgentStreamJson(executionId, nodeId, prompt, sessionId)` method that spawns `claude` via `child_process.spawn` with arguments: `['--output-format', 'stream-json', '--dangerously-skip-permissions', '--session-id', sessionId, '-p', prompt, '--tools', toolList, '--model', model]`. On subsequent turns for the same session, replace `--session-id` with `--resume` and the same UUID.
- FR-SJ-05: SwarmEngine must use `shell: false` for all stream-json spawns. (SEC-SJ-07, SEC-02)
- FR-SJ-06: SwarmEngine must call `child.stdin.end()` immediately after spawn. (DEC-005)
- FR-SJ-07: SwarmEngine must read stdout via `readline.createInterface({ input: child.stdout })` and pass each line to StreamJsonParser.
- FR-SJ-08: SwarmEngine must use `--tools` (NOT `--allowedTools`) for tool restriction under `--dangerously-skip-permissions`. (SEC-SJ-01, confirmed bug #12232)

**Provider Routing**
- FR-SJ-09: SwarmEngine must add a `_spawnAgent(executionId, nodeId, prompt)` dispatcher method that routes to `_spawnAgentStreamJson()` for Claude provider agents and to the existing `_spawnAgentPty()` for Codex and Gemini provider agents.
- FR-SJ-10: The provider is determined by the agent node's `model` field. Models matching `SUPPORTED_RUNTIME_MODELS.claude` (opus, sonnet, haiku, and their full identifiers) route to stream-json. All other models route to PTY.
- FR-SJ-11: Stream-json agents must NOT create PTY sessions via SessionManager. SwarmEngine manages the child process directly. No ring buffer, no replay, no terminal view for these agents. (DEC-028)

**Session Management**
- FR-SJ-12: SwarmEngine must generate a UUID v4 session ID for each Claude agent on first spawn and store it in the execution's agent state as `streamJsonSessionId`. Subsequent turns for the same agent within the same execution must use `--resume <sessionId>` instead of `--session-id`.
- FR-SJ-13: Session IDs must be server-generated and never exposed to the client via REST or WS responses. (SEC-SJ-02, SEC-SJ-06)
- FR-SJ-14: The `result` event is the canonical turn-completion signal. When received, SwarmEngine must: extract cost/token data, check text blocks for `__HANDOFF__` or `__DONE__` tokens, and proceed with handoff/done logic. If neither token is found, treat as implicit `__DONE__`. (DEC-029)
- FR-SJ-15: On process exit without a `result` event (crash), SwarmEngine must mark the agent as `error` status and emit an `agent_status` WS event with the error details.

**Two-Tier Stop**
- FR-SJ-16: Graceful stop must set a `doNotSpawnNextTurn` flag on the agent. The current turn's process continues until it emits a `result` event and exits naturally. A 30-second timeout applies; if the process has not exited after 30 seconds, escalate to forced stop.
- FR-SJ-17: Forced stop must call `tree-kill(child.pid)` and mark the session as `needsRepair: true`. Before the next `--resume`, the system must truncate the session JSONL file to the last complete assistant turn (remove any trailing orphaned `tool_use` blocks).
- FR-SJ-18: Reset must: (1) kill the process via tree-kill, (2) archive conversation history by reading the session JSONL file, (3) delete the session files from `~/.claude/projects/<encoded-path>/`, (4) generate a new session UUID for the agent.

**WebSocket Events**
- FR-SJ-19: SwarmEngine must emit a new `agent_thinking` WS event when a Claude stream-json agent enters a thinking state: `{ type: 'agent_thinking', nodeId, active: boolean }`.
- FR-SJ-20: SwarmEngine must emit a new `agent_tool_use` WS event when a tool_start is detected: `{ type: 'agent_tool_use', nodeId, toolName, toolUseId }`.
- FR-SJ-21: SwarmEngine must emit a new `agent_tool_delta` WS event for streaming tool arguments: `{ type: 'agent_tool_delta', nodeId, toolUseId, partialJson }`.
- FR-SJ-22: SwarmEngine must emit a new `agent_cost` WS event after each turn's `result`: `{ type: 'agent_cost', nodeId, inputTokens, outputTokens, costUsd, cacheReadTokens, cacheWriteTokens, durationMs }`.
- FR-SJ-23: The existing `agent_status` WS event must gain a `spawnMode` field: `'stream-json'` or `'pty'`, so the client can differentiate rendering behavior.

**Per-Agent Tool Configuration**
- FR-SJ-24: Each agent node in the WorkflowDefinition must support a `tools` array field. Default value: `["Bash", "Read", "Edit", "Write", "Grep", "Glob", "LS"]`.
- FR-SJ-25: The tools array must be persisted in the workflow JSON file and survive save/load cycles.
- FR-SJ-26: SwarmEngine must pass the agent's tools array as `--tools "Tool1,Tool2,..."` on every stream-json spawn.

**Old Code Preservation**
- FR-SJ-27: All code paths replaced by stream-json must be preserved as comments with the marker `// [STREAM-JSON-MIGRATION] Original PTY path — kept as fallback`. The comment block must include the original code verbatim.

### Should Have (v1.1)

- FR-SJ-30: Session repair on forced-stop: automatic JSONL truncation to last clean turn before `--resume`.
- FR-SJ-31: `SessionArchiver` that reads JSONL session files and extracts structured conversation history for display in an "Agent History" panel.
- FR-SJ-32: Thinking block content display (when extended thinking is enabled, show the full thinking text in a collapsible block).
- FR-SJ-33: API retry indicator in agent node badge (show retry count and delay from `api_retry` events).

### Won't Have (explicitly out of scope)

- `--input-format stream-json` bidirectional mode -- reason: undocumented and unstable; would allow persistent process but risk is too high.
- `--fork-session` session branching -- reason: not needed for MVP; adds complexity to session tracking.
- Multi-model fallback within stream-json mode -- reason: only Claude CLI supports stream-json; fallback to Codex/Gemini already uses PTY.
- Agent SDK integration -- reason: separate feature track; stream-json migration is CLI-only.
- Session list/delete REST API -- reason: no CLI commands exist; filesystem operations are internal-only.

---

## 5. Non-Functional Requirements

- **Performance:** Stream-json text_delta events must be forwarded to WS clients within 50ms of receipt from CLI stdout. Tool_delta events within 100ms.
- **Security:** Session IDs never exposed to client (SEC-SJ-02, SEC-SJ-06). All spawns use `shell: false` (SEC-02, SEC-SJ-07). `--tools` used instead of `--allowedTools` (SEC-SJ-01). StreamJsonParser enforces 1 MB per-line cap (SEC-SJ-03). Prompts passed via `-p` (acceptable for localhost, SEC-SJ-04).
- **Compatibility:** Node.js 20 LTS. Windows 11 (primary), macOS, Linux. Claude CLI with `--output-format stream-json` support required.
- **Scalability:** Same as existing: designed for single-user localhost. Up to 5 concurrent agent processes per execution.
- **Reliability:** Post-result hang (issue #25629) mitigated by 30-second timeout after `result` event before force-killing the process.

---

## 6. Technical Constraints

- Must use existing Claude CLI binary (auto-detected via BinaryDiscovery). No new API keys.
- `--allowedTools` is IGNORED under `--dangerously-skip-permissions` (bug #12232). Must use `--tools` instead.
- Extended thinking mode disables streaming deltas (only complete messages). StreamJsonParser must handle both modes.
- Kill during a turn corrupts the session JSONL (orphaned tool_use). Kill between turns is clean. Graceful stop must wait for `result` event.
- Session files are at `~/.claude/projects/<encoded-path>/<uuid>.jsonl`. No CLI commands for list/delete; must use filesystem operations directly.
- `write-file-atomic` (not `write-atomic`) is the correct npm package. (DEC-001 errata)
- PTY onData handler must NEVER be removed for Codex/Gemini agents. (DEC-009)

---

## 7. Architecture Overview

```
+-----------------------------------------------------------+
|                     SwarmEngine                            |
|                                                            |
|  _spawnAgent() -- dispatcher                               |
|    |                                                       |
|    +-- Claude model? --> _spawnAgentStreamJson()            |
|    |     |                                                 |
|    |     +-- child_process.spawn(claude, [stream-json])    |
|    |     +-- readline(stdout) --> StreamJsonParser          |
|    |     +-- typed events --> WS broadcast                 |
|    |     +-- result event --> handoff/done/cost logic       |
|    |                                                       |
|    +-- Codex/Gemini? --> _spawnAgentPty() [existing]       |
|          |                                                 |
|          +-- node-pty --> HandoffParser [existing]          |
|                                                            |
+-----------------------------------------------------------+
        |                        |
   WS broadcast             Session tracking
   (swarmHandler)           (per-agent UUID)
        |                        |
+-----------------------------------------------------------+
|                     Client                                 |
|                                                            |
|  useSwarm.js -- handles new WS events:                     |
|    agent_thinking, agent_tool_use, agent_tool_delta,       |
|    agent_cost                                              |
|                                                            |
|  AgentNode.jsx -- thinking indicator, tool name, cost      |
|  ChatMessage.jsx -- tool_use blocks, thinking blocks       |
|  AgentInspector.jsx -- tool whitelist config UI             |
|                                                            |
+-----------------------------------------------------------+
```

---

## 8. Data Model

### StreamJsonParser Event Types (internal)

| Event | Fields | Source |
|-------|--------|--------|
| `text_delta` | `text: string` | content_block_delta (text_delta) |
| `tool_start` | `toolName: string, toolUseId: string` | content_block_start (tool_use) |
| `tool_delta` | `toolUseId: string, partialJson: string` | content_block_delta (input_json_delta) |
| `tool_stop` | `toolUseId: string` | content_block_stop |
| `text_stop` | (none) | content_block_stop |
| `thinking` | `text: string` | content_block_delta (thinking type) |
| `result` | `sessionId: string, costUsd: number, durationMs: number, usage: {input: number, output: number, cacheRead: number, cacheWrite: number}, isError: boolean, errorMessage?: string` | result top-level event |
| `api_retry` | `attempt: number, delay: number, errorCode: string` | system (api_retry subtype) |
| `error` | `message: string` | malformed line or parse error |

### Agent State Extension (in execution Map)

| Field | Type | Description |
|-------|------|-------------|
| `streamJsonSessionId` | `string (UUID)` | Session ID for `--session-id` / `--resume`. Server-only, never sent to client. |
| `spawnMode` | `'stream-json' \| 'pty'` | How this agent was spawned. Sent to client via `agent_status`. |
| `turnCount` | `number` | Number of completed turns (incremented on each `result` event). |
| `totalCostUsd` | `number` | Accumulated cost across all turns. |
| `totalInputTokens` | `number` | Accumulated input tokens. |
| `totalOutputTokens` | `number` | Accumulated output tokens. |
| `doNotSpawnNextTurn` | `boolean` | Set by graceful stop. Prevents next turn spawn. |
| `needsRepair` | `boolean` | Set by forced stop. Requires JSONL truncation before resume. |
| `currentToolUse` | `{ toolName: string, toolUseId: string, partialArgs: string } \| null` | Currently active tool use for UI display. |
| `isThinking` | `boolean` | Whether the agent is in thinking state. |

### Agent Node Extension (in WorkflowDefinition)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tools` | `string[]` | `["Bash","Read","Edit","Write","Grep","Glob","LS"]` | Allowed tools for this agent |

### SwarmStore Extensions (client Zustand)

| Field | Type | Description |
|-------|------|-------------|
| `agentStates[nodeId].spawnMode` | `'stream-json' \| 'pty' \| undefined` | Spawn mode for conditional UI rendering |
| `agentStates[nodeId].isThinking` | `boolean` | Thinking indicator state |
| `agentStates[nodeId].currentTool` | `{ toolName: string, toolUseId: string, partialArgs: string } \| null` | Active tool for live display |
| `agentStates[nodeId].turnCost` | `{ inputTokens: number, outputTokens: number, costUsd: number, durationMs: number } \| null` | Last turn cost |
| `agentStates[nodeId].totalCost` | `{ inputTokens: number, outputTokens: number, costUsd: number } \| null` | Accumulated cost |

---

## 9. API Surface

### New WebSocket Events (server to client)

**`agent_thinking`**
```json
{
  "type": "agent_thinking",
  "nodeId": "string",
  "active": true
}
```

**`agent_tool_use`**
```json
{
  "type": "agent_tool_use",
  "nodeId": "string",
  "toolName": "string",
  "toolUseId": "string"
}
```

**`agent_tool_delta`**
```json
{
  "type": "agent_tool_delta",
  "nodeId": "string",
  "toolUseId": "string",
  "partialJson": "string"
}
```

**`agent_cost`**
```json
{
  "type": "agent_cost",
  "nodeId": "string",
  "inputTokens": 1234,
  "outputTokens": 567,
  "costUsd": 0.0234,
  "cacheReadTokens": 100,
  "cacheWriteTokens": 50,
  "durationMs": 4500
}
```

### Modified WebSocket Events

**`agent_status` (extended)**
```json
{
  "type": "agent_status",
  "nodeId": "string",
  "status": "running",
  "spawnMode": "stream-json",
  "lastOutputSnippet": "string"
}
```

### No New REST Endpoints

All stream-json functionality is internal to SwarmEngine and communicated via existing WS channels. Tool configuration persists through the existing `PUT /api/v1/workflows/:id` endpoint (tools array is part of the node definition in the workflow JSON).

---

## 10. UX Flow

### Main Flow: Stream-JSON Agent Execution

1. User opens a workflow in the Swarm canvas.
2. User selects a Claude model for an agent node (opus, sonnet, haiku).
3. User optionally configures the agent's tool whitelist in the AgentInspector panel.
4. User clicks "Start Execution".
5. SwarmEngine detects Claude model, spawns via `_spawnAgentStreamJson()`.
6. AgentNode shows blue pulsing border ("running") with "Thinking..." indicator.
7. As the agent uses tools, AgentNode shows the current tool name. ChatMessage renders tool_use blocks with streaming arguments.
8. When text output arrives, ChatMessage renders it in real-time (same as existing chat flow).
9. When the turn completes (`result` event), AgentNode shows a cost badge. If a `__HANDOFF__` token was in the text, the handoff proceeds to the target agent.
10. If user clicks "Stop", the graceful stop flag is set. The current turn finishes, then the agent pauses. The agent can be resumed later (session is preserved).
11. If user clicks "Reset", the agent is killed, history archived, session deleted, and a new UUID assigned.

### Tool Configuration Flow

1. User clicks an agent node to open the AgentInspector panel.
2. The "Tools" section shows checkboxes for all 16 built-in Claude tools.
3. User checks/unchecks tools. Changes are debounced (300ms) and saved to the workflow JSON.
4. On next spawn, the updated tools list is passed via `--tools`.

---

## 11. Component Specifications

---

### StreamJsonParser
**File:** `server/services/StreamJsonParser.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Stateless NDJSON line parser that transforms raw Claude CLI stream-json output lines into typed application events for SwarmEngine consumption.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| line | string | yes | A single line from Claude CLI stdout (NDJSON format) |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| event | `{ type: string, ...fields }` | Typed event object. Types: `text_delta`, `text_stop`, `tool_start`, `tool_delta`, `tool_stop`, `thinking`, `result`, `api_retry`, `error` |

**Behavior (step by step):**
1. Receive a raw string line from readline.
2. Check line byte length against 1 MB cap. If exceeded, emit `error` event with message "Line exceeds 1MB cap" and return.
3. Attempt `JSON.parse(line)`. If parse fails, emit `error` event with message "Malformed JSON line" and return.
4. Read the top-level `type` field of the parsed object.
5. If `type === 'system'`: check for `subtype === 'api_retry'`. Emit `{ type: 'api_retry', attempt, delay, errorCode }`.
6. If `type === 'stream_event'`: read `event.type` to dispatch:
   - `content_block_start`: if `event.content_block.type === 'tool_use'`, emit `{ type: 'tool_start', toolName: event.content_block.name, toolUseId: event.content_block.id }`. If `text`, emit `{ type: 'text_start' }`. If `thinking`, emit `{ type: 'thinking_start' }`.
   - `content_block_delta`: if `event.delta.type === 'text_delta'`, emit `{ type: 'text_delta', text: event.delta.text }`. If `input_json_delta`, emit `{ type: 'tool_delta', partialJson: event.delta.partial_json }`. If `thinking_delta`, emit `{ type: 'thinking', text: event.delta.thinking }`.
   - `content_block_stop`: emit `tool_stop` or `text_stop` based on tracked active block type.
   - `message_delta`: extract usage if present.
   - `message_stop`: no-op (result event is the canonical completion signal).
7. If `type === 'result'`: emit `{ type: 'result', sessionId: obj.session_id, costUsd: obj.cost_usd, durationMs: obj.duration_ms, usage: { input: obj.usage.input_tokens, output: obj.usage.output_tokens, cacheRead: obj.usage.cache_read_input_tokens, cacheWrite: obj.usage.cache_creation_input_tokens }, isError: obj.is_error, errorMessage: obj.error }`.
8. If `type === 'assistant'`: emit `{ type: 'message', content: obj.message.content }` (for non-streaming / extended thinking mode).

**Contracts with other components:**
- **Calls:** None (stateless parser, no external dependencies)
- **Called by:** `SwarmEngine._spawnAgentStreamJson()` — one call per stdout line
- **WS events EMITTED:** None directly (SwarmEngine translates parser events to WS events)
- **WS events CONSUMED:** None
- **Store reads:** None
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] Given a valid `content_block_start` line with `type: "tool_use"`, `parseLine()` returns `{ type: 'tool_start', toolName: '<name>', toolUseId: '<id>' }`
- [ ] Given a valid `content_block_delta` line with `type: "text_delta"`, `parseLine()` returns `{ type: 'text_delta', text: '<text>' }`
- [ ] Given a valid `content_block_delta` line with `type: "input_json_delta"`, `parseLine()` returns `{ type: 'tool_delta', partialJson: '<partial>' }`
- [ ] Given a valid `result` line, `parseLine()` returns all cost/usage/session fields correctly mapped
- [ ] Given a line exceeding 1 MB, `parseLine()` returns `{ type: 'error' }` and does not throw
- [ ] Given a malformed JSON string, `parseLine()` returns `{ type: 'error' }` and does not throw
- [ ] Given a `system` line with `subtype: "api_retry"`, `parseLine()` returns `{ type: 'api_retry', attempt, delay, errorCode }`
- [ ] Given an `assistant` line (non-streaming mode), `parseLine()` returns `{ type: 'message', content }` with the full message content array

---

### SwarmEngine._spawnAgentStreamJson()
**File:** `server/services/SwarmEngine.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Spawns a Claude CLI process in stream-json mode for a single agent turn, reads structured NDJSON output, translates parser events into WS broadcasts and internal state updates, and manages the process lifecycle including graceful/forced stop.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| executionId | string (UUID) | yes | Active execution identifier |
| nodeId | string | yes | Agent node ID within the workflow |
| prompt | string | yes | The prompt text for this turn (system prompt + context + task) |
| sessionId | string (UUID) | yes | Session ID for `--session-id` or `--resume` |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| WS: agent_status | object | Agent status changes (running, done, error) with spawnMode field |
| WS: agent_thinking | object | Thinking state toggle |
| WS: agent_tool_use | object | Tool use started |
| WS: agent_tool_delta | object | Tool argument streaming |
| WS: agent_cost | object | Per-turn cost after result |
| WS: chat_message | object | Text content for unified chat view |
| WS: handoff_event | object | When __HANDOFF__ detected in text output |

**Behavior (step by step):**
1. Look up execution record by executionId. Look up agent state by nodeId.
2. Determine if this is the first turn (`turnCount === 0`). If first turn, use `--session-id <sessionId>`. If subsequent turn, use `--resume <sessionId>`.
3. Build spawn arguments array: `['--output-format', 'stream-json', '--dangerously-skip-permissions', sessionFlag, sessionId, '-p', prompt, '--model', model]`. If agent has a `tools` array, append `['--tools', tools.join(',')]`.
4. Spawn child process via `child_process.spawn(claudeBin, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })`.
5. Call `child.stdin.end()` immediately. (DEC-005)
6. Create readline interface on `child.stdout`. Create a StreamJsonParser instance.
7. Broadcast `{ type: 'agent_status', nodeId, status: 'running', spawnMode: 'stream-json' }`.
8. For each stdout line: call `parser.parseLine(line)`. Handle the returned event:
   - `text_delta`: Accumulate text into a turn buffer. Broadcast `chat_message` with the text delta. Update agent's `lastOutputSnippet`.
   - `tool_start`: Set `currentToolUse` on agent state. Broadcast `agent_tool_use`.
   - `tool_delta`: Append to `currentToolUse.partialArgs`. Broadcast `agent_tool_delta`.
   - `tool_stop`: Clear `currentToolUse`. (Tool completion is implicit.)
   - `thinking`: Set `isThinking: true`. Broadcast `agent_thinking { active: true }`.
   - `text_start`: Set `isThinking: false`. Broadcast `agent_thinking { active: false }` (if was thinking).
   - `api_retry`: Broadcast `agent_status { status: 'running', retrying: true, attempt, delay }`.
   - `result`: Process turn completion (step 9).
   - `error`: Log warning. Continue processing.
9. On `result` event:
   a. Increment `turnCount`. Update cost accumulators (`totalCostUsd`, `totalInputTokens`, `totalOutputTokens`).
   b. Broadcast `agent_cost` with per-turn and accumulated cost data.
   c. Scan accumulated turn text for `__HANDOFF__:<targetId>:<payload>` or `__DONE__` tokens.
   d. If `__HANDOFF__` found: parse payload (JSON first, base64 fallback per DEC-020), shallow-merge into workflowContext, call `_onHandoff()`.
   e. If `__DONE__` found (or no token): call `_onDone()` with reinject logic (DEC-021).
   f. If `doNotSpawnNextTurn` is set: mark agent as `paused`, broadcast status. Do not spawn next turn. Session is preserved for later `--resume`.
10. On child process `exit` event: if no `result` was received, mark as `error`. Clean up readline and parser.
11. On child process `error` event: mark agent as `error`, broadcast status with error details.
12. Start a 30-second post-result timeout. If process has not exited 30 seconds after `result` event, force-kill via tree-kill. (Issue #25629 mitigation.)

**Contracts with other components:**
- **Calls:** `StreamJsonParser.parseLine(line)` -- parse each stdout line. `broadcast(executionId, event)` from swarmHandler.js -- send WS events. `_onHandoff(executionId, sourceNodeId, targetNodeId, contextUpdate)` -- existing handoff routing. `_onDone(executionId, nodeId)` -- existing done handling. `BinaryDiscovery.claudeBin` -- get binary path. `tree-kill(pid)` -- force kill.
- **Called by:** `SwarmEngine._spawnAgent()` -- the dispatcher routes here for Claude models.
- **WS events EMITTED:** `agent_status { type, nodeId, status, spawnMode, lastOutputSnippet }`, `agent_thinking { type, nodeId, active }`, `agent_tool_use { type, nodeId, toolName, toolUseId }`, `agent_tool_delta { type, nodeId, toolUseId, partialJson }`, `agent_cost { type, nodeId, inputTokens, outputTokens, costUsd, cacheReadTokens, cacheWriteTokens, durationMs }`, `chat_message { type, nodeId, role, text, timestamp }`
- **WS events CONSUMED:** None
- **Store reads:** None (server-side)
- **Store writes:** None (server-side)

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] Given a Claude model agent, `_spawnAgent()` routes to `_spawnAgentStreamJson()` (not `_spawnAgentPty()`)
- [ ] Given a Codex model agent, `_spawnAgent()` routes to `_spawnAgentPty()`
- [ ] The spawn arguments array contains `--output-format stream-json` and `--dangerously-skip-permissions`
- [ ] The spawn arguments array uses `--tools` (not `--allowedTools`) when the agent has a tools array
- [ ] On first turn (turnCount === 0), the arguments contain `--session-id <uuid>`
- [ ] On subsequent turns (turnCount > 0), the arguments contain `--resume <uuid>` (same uuid)
- [ ] `child.stdin.end()` is called immediately after spawn
- [ ] `shell: false` is used in the spawn options
- [ ] When a `text_delta` event is received, a `chat_message` WS event is broadcast within 50ms
- [ ] When a `tool_start` event is received, an `agent_tool_use` WS event is broadcast with `toolName` and `toolUseId`
- [ ] When a `result` event is received, an `agent_cost` WS event is broadcast with all cost fields
- [ ] When `__HANDOFF__` is found in accumulated text after `result`, `_onHandoff()` is called with correct target and context
- [ ] When graceful stop is requested, the process is allowed to finish the current turn before stopping
- [ ] When 30 seconds elapse after `result` without process exit, tree-kill is called
- [ ] When the process crashes (exit without result), agent status is set to `error`

---

### SwarmEngine._spawnAgent() (dispatcher)
**File:** `server/services/SwarmEngine.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Routes agent spawning to the correct method based on the agent's model (provider). Claude models use stream-json; Codex and Gemini use PTY.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| executionId | string (UUID) | yes | Active execution identifier |
| nodeId | string | yes | Agent node ID |
| prompt | string | yes | The prompt for this turn |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| (delegates to sub-methods) | - | All outputs come from the dispatched method |

**Behavior (step by step):**
1. Look up the agent node's `model` field from the workflow definition.
2. Check if model is in `SUPPORTED_RUNTIME_MODELS.claude` list.
3. If Claude: look up or generate `streamJsonSessionId` for this agent. Call `_spawnAgentStreamJson(executionId, nodeId, prompt, sessionId)`.
4. If not Claude: call `_spawnAgentPty(executionId, nodeId, prompt)` (existing path).

**Contracts with other components:**
- **Calls:** `_spawnAgentStreamJson()`, `_spawnAgentPty()`
- **Called by:** `startExecution()`, `_onHandoff()`, `_onDone()` (reinject path)
- **WS events EMITTED:** None directly
- **WS events CONSUMED:** None
- **Store reads:** None
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] Model "opus" routes to `_spawnAgentStreamJson()`
- [ ] Model "claude-opus-4-6" routes to `_spawnAgentStreamJson()`
- [ ] Model "sonnet" routes to `_spawnAgentStreamJson()`
- [ ] Model "haiku" routes to `_spawnAgentStreamJson()`
- [ ] Model "gpt-5.4" routes to `_spawnAgentPty()`
- [ ] Model "gemini-2.5-pro" routes to `_spawnAgentPty()`
- [ ] A new streamJsonSessionId (UUID v4) is generated on first dispatch for a Claude agent
- [ ] The same streamJsonSessionId is reused on subsequent dispatches for the same agent in the same execution

---

### SwarmEngine Session Lifecycle (graceful stop / forced stop / reset)
**File:** `server/services/SwarmEngine.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Manages the three stop modes for stream-json agents: graceful stop (pause after current turn), forced stop (kill immediately), and reset (kill + archive + fresh session).

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| executionId | string (UUID) | yes | Active execution identifier |
| nodeId | string | yes | Agent node ID |
| mode | `'graceful' \| 'forced' \| 'reset'` | yes | Stop mode |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| WS: agent_status | object | Status change to paused/stopped/idle |
| WS: execution_status | object | If all agents stopped |

**Behavior (step by step):**
1. **Graceful stop:** Set `doNotSpawnNextTurn = true` on the agent state. The running process continues. When the `result` event fires and the process exits, the agent transitions to `paused` status. If the process does not exit within 30 seconds after `result`, escalate to forced stop.
2. **Forced stop:** Call `tree-kill(child.pid)`. Set `needsRepair = true` on the agent state. Mark agent status as `stopped`. Broadcast `agent_status`.
3. **Reset:** Call `tree-kill(child.pid)`. Read the session JSONL file from `~/.claude/projects/<encoded-path>/<sessionId>.jsonl`. Archive the conversation (store in execution metadata or emit as WS event). Delete the session JSONL file. Generate a new UUID for `streamJsonSessionId`. Reset `turnCount` to 0. Mark agent as `idle`. Broadcast `agent_status`.

**Contracts with other components:**
- **Calls:** `tree-kill(pid)` -- process killing. `fs.readFile / fs.unlink` -- session file operations. `broadcast()` from swarmHandler.js.
- **Called by:** Swarm REST routes (`DELETE /api/v1/swarm/:workflowId` for stop, new endpoint or extended for reset).
- **WS events EMITTED:** `agent_status { type, nodeId, status, spawnMode }`, `execution_status { type, executionId, status }`
- **WS events CONSUMED:** None
- **Store reads:** None
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] Graceful stop: agent completes current turn (result event received) before transitioning to `paused`
- [ ] Graceful stop: after pausing, `--resume <sessionId>` on next start successfully continues the conversation
- [ ] Forced stop: `tree-kill` is called on the process PID
- [ ] Forced stop: `needsRepair` flag is set to true on the agent state
- [ ] Reset: session JSONL file is deleted from disk
- [ ] Reset: a new UUID is generated for the session
- [ ] Reset: turnCount resets to 0 and agent status becomes `idle`
- [ ] 30-second timeout escalation: if process hangs after result, forced stop is triggered automatically

---

### useSwarm.js (WS event handler extensions)
**File:** `client/src/hooks/useSwarm.js`
**Type:** `hook`
**Layer:** `client`
**Purpose:** Extend the existing useSwarm WebSocket hook to handle the four new stream-json WS events (agent_thinking, agent_tool_use, agent_tool_delta, agent_cost) and update the Zustand store accordingly.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| workflowId | string | yes | The workflow ID to subscribe to (existing) |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| Store mutations | - | Updates agentStates with thinking, tool, and cost data |

**Behavior (step by step):**
1. (Existing) Connect to WS and handle existing events.
2. On `agent_thinking` event: call `updateAgentState(nodeId, { isThinking: active })`.
3. On `agent_tool_use` event: call `updateAgentState(nodeId, { currentTool: { toolName, toolUseId, partialArgs: '' } })`.
4. On `agent_tool_delta` event: read current agent state, append `partialJson` to `currentTool.partialArgs`. Call `updateAgentState(nodeId, { currentTool: { ...currentTool, partialArgs: currentTool.partialArgs + partialJson } })`.
5. On `agent_cost` event: call `updateAgentState(nodeId, { turnCost: { inputTokens, outputTokens, costUsd, durationMs }, totalCost: { inputTokens: prev + inputTokens, outputTokens: prev + outputTokens, costUsd: prev + costUsd } })`.
6. On `agent_status` event with `spawnMode` field: call `updateAgentState(nodeId, { spawnMode })`.
7. When `agent_status` has `status === 'done'` or `status === 'idle'`: clear `currentTool` and `isThinking`.

**Contracts with other components:**
- **Calls:** `useSwarmStore.updateAgentState(nodeId, patch)` -- existing store action
- **Called by:** SwarmView.jsx (mounts the hook)
- **WS events EMITTED:** None
- **WS events CONSUMED:** `agent_thinking { type, nodeId, active }`, `agent_tool_use { type, nodeId, toolName, toolUseId }`, `agent_tool_delta { type, nodeId, toolUseId, partialJson }`, `agent_cost { type, nodeId, inputTokens, outputTokens, costUsd, cacheReadTokens, cacheWriteTokens, durationMs }`, `agent_status { type, nodeId, status, spawnMode, lastOutputSnippet }`
- **Store reads:** `agentStates[nodeId].currentTool` (for delta accumulation), `agentStates[nodeId].totalCost` (for accumulation)
- **Store writes:** `updateAgentState(nodeId, { isThinking, currentTool, turnCost, totalCost, spawnMode })`

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] When `agent_thinking { active: true }` arrives, `agentStates[nodeId].isThinking` becomes `true`
- [ ] When `agent_thinking { active: false }` arrives, `agentStates[nodeId].isThinking` becomes `false`
- [ ] When `agent_tool_use` arrives, `agentStates[nodeId].currentTool` is set with `toolName` and `toolUseId`
- [ ] When `agent_tool_delta` arrives, `partialArgs` in `currentTool` is appended (not replaced)
- [ ] When `agent_cost` arrives, `turnCost` is set and `totalCost` is accumulated across turns
- [ ] When `agent_status` with `spawnMode` arrives, `agentStates[nodeId].spawnMode` is set
- [ ] When agent status becomes `done`, `currentTool` is cleared to `null` and `isThinking` is `false`

---

### AgentNode.jsx (stream-json rendering extensions)
**File:** `client/src/canvas/nodes/AgentNode.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Extend the existing AgentNode to display thinking indicator, current tool name, and cost badge for stream-json agents. Hide the "Open Terminal" button for stream-json agents (no PTY exists).

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | yes | Node ID (from React Flow) |
| data | object | yes | Node data (label, systemPrompt, model, tools) |
| selected | boolean | yes | Whether the node is selected |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| (rendered JSX) | React element | Visual representation of agent state |

**Behavior (step by step):**
1. Read `agentState` from `useSwarmStore(s => s.agentStates[id])` (existing).
2. Check `agentState.spawnMode`. If `'stream-json'`:
   a. If `agentState.isThinking === true` and status is `running`: show "Thinking..." text with animated ellipsis below the agent name.
   b. If `agentState.currentTool` is not null: show tool name (e.g., "Using: Edit") below the thinking indicator or agent name.
   c. If `agentState.totalCost` exists: show a small cost badge (e.g., "$0.023") in the bottom-right corner of the node.
   d. Hide the "Open Terminal" button (no PTY session exists for stream-json agents).
3. If `spawnMode` is `'pty'` or undefined: render existing PTY-based UI (unchanged).

**Contracts with other components:**
- **Calls:** None
- **Called by:** React Flow canvas renderer (via nodeTypes registration in SwarmCanvas.jsx)
- **WS events EMITTED:** None
- **WS events CONSUMED:** None (reads from store, which is updated by useSwarm.js)
- **Store reads:** `agentStates[id]` (status, isThinking, currentTool, totalCost, spawnMode)
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] When `agentStates[id].isThinking === true` and `spawnMode === 'stream-json'`, the node displays "Thinking..." with animated ellipsis
- [ ] When `agentStates[id].currentTool` is `{ toolName: "Edit" }`, the node displays "Using: Edit"
- [ ] When `agentStates[id].totalCost.costUsd === 0.023`, the node displays "$0.02" (2 decimal places)
- [ ] When `spawnMode === 'stream-json'`, the "Open Terminal" button is NOT rendered
- [ ] When `spawnMode === 'pty'` or undefined, existing rendering behavior is unchanged
- [ ] When agent status transitions from `running` to `done`, thinking indicator and tool name disappear

---

### ChatMessage.jsx (stream-json message types)
**File:** `client/src/canvas/ChatMessage.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Extend ChatMessage to render tool_use blocks (tool name + streaming arguments), thinking blocks, and per-turn cost info for messages originating from stream-json agents.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| message | object | yes | `{ role, text, nodeId, timestamp, toolUse?, thinking?, cost?, spawnMode? }` |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| (rendered JSX) | React element | Formatted message bubble with tool/thinking/cost blocks |

**Behavior (step by step):**
1. Check `message.spawnMode`. If not `'stream-json'`, render existing formatting (unchanged).
2. If `message.toolUse` array is present: for each tool use entry `{ toolName, args }`, render a collapsible block with the tool name as header and pretty-printed JSON args as body. Use monospace font for args. Apply syntax highlighting (JSON keys in one color, values in another).
3. If `message.thinking` is present: render a collapsible "Thinking" block with muted styling (gray text, italic). Default collapsed.
4. If `message.cost` is present: render a small footer below the message text showing "Tokens: {input}in / {output}out | Cost: ${costUsd} | {durationMs}ms". Use muted gray text, 10px font.
5. The `text` field is rendered as before (with existing `formatChatText` for PTY messages, or raw for stream-json since text is already clean).

**Contracts with other components:**
- **Calls:** `stripAnsi()` (existing utility, only for PTY messages)
- **Called by:** `ChatPanel.jsx` (iterates chatMessages and renders one ChatMessage per entry)
- **WS events EMITTED:** None
- **WS events CONSUMED:** None (receives data as props)
- **Store reads:** None directly (receives message via props from ChatPanel)
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] Given a message with `toolUse: [{ toolName: "Read", args: '{"file": "test.js"}' }]`, a collapsible block renders with header "Read" and formatted JSON body
- [ ] Given a message with `thinking: "I need to..."`, a collapsible "Thinking" block renders with muted gray text
- [ ] Given a message with `cost: { inputTokens: 100, outputTokens: 50, costUsd: 0.01, durationMs: 3000 }`, a footer displays "Tokens: 100in / 50out | Cost: $0.01 | 3000ms"
- [ ] Given a message without `spawnMode: 'stream-json'`, existing PTY message rendering is unchanged
- [ ] Tool use blocks are collapsed by default and expand on click
- [ ] Thinking blocks are collapsed by default

---

### AgentInspector.jsx (Tool Whitelist Configuration)
**File:** `client/src/canvas/AgentInspector.jsx`
**Type:** `frontend-component`
**Layer:** `client`
**Purpose:** Extend the existing AgentInspector panel to include a "Tools" section that displays checkboxes for all 16 built-in Claude tools, allowing per-agent tool whitelist configuration. Changes persist to the workflow JSON via the existing node update mechanism.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| nodeId | string | yes | Selected agent node ID |
| nodeData | object | yes | Agent node data including `tools` array |
| onUpdateNode | function | yes | Callback to update node data in the canvas |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| onUpdateNode call | function call | `onUpdateNode(nodeId, { tools: [...] })` when checkboxes change |

**Behavior (step by step):**
1. Read the agent's current `tools` array from `nodeData.tools`. If undefined, use the default: `["Bash", "Read", "Edit", "Write", "Grep", "Glob", "LS"]`.
2. Render a collapsible "Tools" section (using existing `CollapsibleSection` component).
3. Display a checkbox for each of the 16 built-in tools: Bash, Read, Edit, MultiEdit, Write, Glob, Grep, LS, WebFetch, WebSearch, NotebookRead, NotebookEdit, TodoRead, TodoWrite, Agent, exit_plan_mode.
4. Each checkbox is checked if the tool name is in the agent's `tools` array.
5. On checkbox toggle: update the local tools array (add or remove the tool name). Debounce the change (300ms) before calling `onUpdateNode(nodeId, { tools: newToolsArray })`.
6. Display a "Select All" / "Deselect All" toggle button above the checkboxes.
7. Only show the Tools section for Claude model agents (check if model is in the Claude models list). For Codex/Gemini agents, hide the section (tool restriction is not supported via their CLIs).

**Contracts with other components:**
- **Calls:** `onUpdateNode(nodeId, { tools })` -- propagates to SwarmCanvas which updates the workflow node data
- **Called by:** `SwarmCanvas.jsx` or `SwarmView.jsx` (renders inspector panel for selected node)
- **WS events EMITTED:** None
- **WS events CONSUMED:** None
- **Store reads:** None directly (receives nodeData as prop)
- **Store writes:** None directly (changes propagate via onUpdateNode to workflow state)

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] When an agent node with model "opus" is selected, the Tools section is visible with 16 checkboxes
- [ ] When an agent node with model "gpt-5.4" is selected, the Tools section is NOT visible
- [ ] The default tools array `["Bash","Read","Edit","Write","Grep","Glob","LS"]` is shown as checked when `nodeData.tools` is undefined
- [ ] Unchecking "Bash" calls `onUpdateNode` with a tools array that does not include "Bash"
- [ ] Checking "WebFetch" calls `onUpdateNode` with a tools array that includes "WebFetch"
- [ ] "Select All" sets all 16 tools; "Deselect All" clears the array
- [ ] Changes are debounced at 300ms (no callback within 300ms of the last change)
- [ ] The tools array persists in the workflow JSON after save (verified via `GET /api/v1/workflows/:id`)

---

### SwarmContext.jsx (Zustand store extensions)
**File:** `client/src/store/SwarmContext.jsx`
**Type:** `store-action`
**Layer:** `client`
**Purpose:** Extend the existing useSwarmStore Zustand store to include new state fields for stream-json agent data (thinking, tool use, cost) and ensure the `updateAgentState` action correctly handles these fields.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| (store actions receive patches) | - | - | Actions are called by useSwarm.js hook |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| State mutations | - | Updates to agentStates entries |

**Behavior (step by step):**
1. The existing `updateAgentState(nodeId, patch)` action already shallow-merges patches into `agentStates[nodeId]`. No structural change needed — the new fields (`isThinking`, `currentTool`, `turnCost`, `totalCost`, `spawnMode`) are added to agent state entries by the hook when the corresponding WS events arrive.
2. The existing `clearExecutionState()` action must also clear the new fields when execution ends.
3. Add type documentation (JSDoc) for the new agent state shape to make it discoverable.

**Contracts with other components:**
- **Calls:** None
- **Called by:** `useSwarm.js` (via store actions), `AgentNode.jsx` (via store selectors), `ChatPanel.jsx` (via store selectors)
- **WS events EMITTED:** None
- **WS events CONSUMED:** None
- **Store reads:** Components read: `agentStates[nodeId].isThinking`, `agentStates[nodeId].currentTool`, `agentStates[nodeId].turnCost`, `agentStates[nodeId].totalCost`, `agentStates[nodeId].spawnMode`
- **Store writes:** `updateAgentState(nodeId, patch)` with new fields

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] `updateAgentState('node-a', { isThinking: true })` sets `agentStates['node-a'].isThinking` to `true` without losing other fields
- [ ] `updateAgentState('node-a', { currentTool: { toolName: 'Edit', toolUseId: 'tu_1', partialArgs: '' } })` sets the currentTool correctly
- [ ] `updateAgentState('node-a', { totalCost: { inputTokens: 200, outputTokens: 100, costUsd: 0.05 } })` sets totalCost
- [ ] `clearExecutionState()` resets all agentStates including the new fields
- [ ] Existing agent state fields (status, lastOutputSnippet, handoffCount, timestamps) are NOT affected by the new fields

---

### ChatExtractor.js (stream-json bypass)
**File:** `server/services/ChatExtractor.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Document that ChatExtractor is bypassed for stream-json agents. Stream-json provides clean structured text that does not need PTY noise extraction. ChatExtractor continues to function for Codex/Gemini PTY agents.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| (no changes to interface) | - | - | Existing interface unchanged |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| (no changes) | - | Existing behavior unchanged for PTY agents |

**Behavior (step by step):**
1. No code changes to ChatExtractor itself.
2. SwarmEngine's `_spawnAgentStreamJson()` does NOT instantiate or call ChatExtractor. Instead, it directly broadcasts `chat_message` WS events from the clean `text_delta` events.
3. SwarmEngine's existing `_spawnAgentPty()` continues to use ChatExtractor as before.
4. A comment is added at the top of ChatExtractor.js: `// [STREAM-JSON-MIGRATION] This module is bypassed for Claude stream-json agents. Used only for Codex/Gemini PTY agents.`

**Contracts with other components:**
- **Calls:** `normalizeChatDisplayText()` from chatTextNormalization.js (existing, unchanged)
- **Called by:** `SwarmEngine._spawnAgentPty()` only (no longer called by stream-json path)
- **WS events EMITTED:** None directly
- **WS events CONSUMED:** None
- **Store reads:** None
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] ChatExtractor is NOT instantiated in `_spawnAgentStreamJson()`
- [ ] ChatExtractor continues to be instantiated in `_spawnAgentPty()` for Codex/Gemini agents
- [ ] Existing PTY chat extraction tests pass without modification
- [ ] A `[STREAM-JSON-MIGRATION]` comment is present at the top of ChatExtractor.js

---

### SessionManager.js (stream-json skip)
**File:** `server/services/SessionManager.js`
**Type:** `backend-service`
**Layer:** `server`
**Purpose:** Document that SessionManager is not used for stream-json agents. No PTY allocation, no ring buffer, no replay, no terminal view. SessionManager continues to function for Codex/Gemini PTY agents.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| (no changes to interface) | - | - | Existing interface unchanged |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| (no changes) | - | Existing behavior unchanged for PTY agents |

**Behavior (step by step):**
1. No code changes to SessionManager itself.
2. SwarmEngine's `_spawnAgentStreamJson()` does NOT call `sessionManager.createSession()` or `sessionManager.addSwarmListener()`.
3. SwarmEngine's existing `_spawnAgentPty()` continues to use SessionManager as before.
4. A comment is added: `// [STREAM-JSON-MIGRATION] Stream-json agents bypass SessionManager entirely (DEC-028). PTY sessions are only created for Codex/Gemini agents.`

**Contracts with other components:**
- **Calls:** (existing, unchanged)
- **Called by:** `SwarmEngine._spawnAgentPty()` only
- **WS events EMITTED:** None
- **WS events CONSUMED:** None
- **Store reads:** None
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] `_spawnAgentStreamJson()` does NOT call any SessionManager methods
- [ ] `_spawnAgentPty()` continues to call `sessionManager.createSession()` for Codex/Gemini agents
- [ ] Existing PTY session tests pass without modification
- [ ] DEC-009 is not violated: the permanent onData handler is not touched

---

### swarmHandler.js (WS event routing)
**File:** `server/ws/swarmHandler.js`
**Type:** `ws-event`
**Layer:** `server`
**Purpose:** No structural changes needed. The existing `broadcast(executionId, event)` function already handles arbitrary event objects. New event types (agent_thinking, agent_tool_use, agent_tool_delta, agent_cost) are broadcast by SwarmEngine through the existing `broadcast()` function.

**Inputs:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| (no changes to interface) | - | - | Existing interface unchanged |

**Outputs / Emits:**
| Name | Type | Description |
|------|------|-------------|
| (no changes) | - | broadcast() already forwards any JSON event object |

**Behavior (step by step):**
1. No code changes required. `broadcast()` is event-type agnostic.
2. Document the new event types in a comment block listing all supported WS event types.

**Contracts with other components:**
- **Calls:** `ws.send(JSON.stringify(event))` for each subscriber
- **Called by:** `SwarmEngine._spawnAgentStreamJson()` (new), `SwarmEngine._spawnAgentPty()` (existing)
- **WS events EMITTED:** All events passed to `broadcast()` — now includes `agent_thinking`, `agent_tool_use`, `agent_tool_delta`, `agent_cost` in addition to existing types
- **WS events CONSUMED:** None
- **Store reads:** None
- **Store writes:** None

**Acceptance Criteria (used verbatim in TEST GATE tasks):**
- [ ] `broadcast(executionId, { type: 'agent_thinking', nodeId: 'a', active: true })` sends the event to all subscribers for that executionId
- [ ] `broadcast()` does not filter or transform events by type (remains type-agnostic)
- [ ] Existing WS event types continue to function without modification

---

## 12. Open Questions

1. **Session file path encoding:** How does Claude CLI encode the project path in `~/.claude/projects/<encoded-path>/`? URL encoding? Base64? Need to verify to locate session JSONL files for reset/archive. (Assigned to: researcher)
2. **Extended thinking interaction:** When extended thinking is enabled, streaming deltas are disabled. Does the `assistant` event contain full thinking content, or is it omitted? Need to test. (Assigned to: researcher)
3. **Post-result hang frequency:** Issue #25629 — how common is the hang in practice? Should the 30-second timeout be configurable? (Assigned to: backend-dev during spike)
4. **JSONL truncation safety:** For forced-stop session repair, is truncating to the last `assistant` message sufficient, or does the Claude CLI require a specific structure at end-of-file? (Assigned to: researcher)

---

## 13. Out of Scope

- **`--input-format stream-json` bidirectional mode:** Undocumented, unstable. Would allow persistent process but too risky for MVP.
- **`--fork-session` session branching:** Not needed for current workflow patterns.
- **Multi-model fallback within stream-json:** Only Claude supports stream-json. Cross-provider fallback uses the existing PTY path.
- **Agent SDK integration:** Separate feature track entirely.
- **Session browser/manager UI:** No CLI commands for session list/delete. Internal filesystem operations only.
- **Tool restriction for Codex/Gemini:** Their CLIs do not support equivalent tool restriction flags.
- **Stream-json for Job mode:** Job mode already uses stream-json via JobRunner. This migration is specifically for Swarm agent spawning.

---

## Appendix A: Security Requirements (Stream-JSON Specific)

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-SJ-01 | Use `--tools` (not `--allowedTools`) for tool restriction under `--dangerously-skip-permissions` | FR-SJ-08 |
| SEC-SJ-02 | Session IDs are server-generated, never exposed to client | FR-SJ-13 |
| SEC-SJ-03 | StreamJsonParser handles malformed lines (skip + log), 1 MB per-line cap | FR-SJ-02 |
| SEC-SJ-04 | `-p` exposes prompt in OS process list (acceptable for localhost) | Documented risk, no mitigation needed |
| SEC-SJ-05 | Delete session files on reset (execution terminal state) | FR-SJ-18 |
| SEC-SJ-06 | Never expose raw session-id in REST/WS responses | FR-SJ-13 |
| SEC-SJ-07 | All spawns use `shell: false` | FR-SJ-05 |

---

## Appendix B: Phase Plan

### Phase 1: Spike (1 task)
Validate `--resume -p --output-format stream-json` multi-turn in a standalone test script. Confirm session continuity, tool restriction, and cost reporting.

### Phase 2: Backend Core (4-5 tasks)
1. StreamJsonParser implementation + unit tests
2. `_spawnAgentStreamJson()` in SwarmEngine
3. `_spawnAgent()` dispatcher (provider routing)
4. Session lifecycle (graceful stop, forced stop, reset)
5. Per-agent tool configuration (tools array in workflow definition)

### Phase 3: Frontend (4-5 tasks)
1. useSwarm.js WS event handlers for new events
2. SwarmContext.jsx store extensions (JSDoc + clearExecutionState)
3. AgentNode.jsx stream-json rendering (thinking, tool, cost)
4. ChatMessage.jsx tool_use and thinking block rendering
5. AgentInspector.jsx tool whitelist configuration UI

### Phase 4: Integration + Polish (2-3 tasks)
1. Full pipeline E2E testing (spawn -> stream -> WS -> UI)
2. Old code commenting with `[STREAM-JSON-MIGRATION]` markers
3. ChatExtractor/SessionManager/chatTextNormalization bypass documentation
