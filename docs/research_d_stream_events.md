# Research D: Stream-JSON Event Structure Details

## Question

What is the exact JSON structure of: (1) content_block_start with type=tool_use, (2) content_block_delta with input_json_delta, (3) thinking blocks in streaming, (4) the result event with usage/cost fields, (5) message_delta usage fields? What is the CLI stream-json wrapper format vs raw API events?

## Findings

### 1. CLI Stream-JSON Wrapper Format

Claude CLI `--output-format stream-json` emits NDJSON (one JSON object per line). Each streaming event is wrapped in a `stream_event` envelope:

```json
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}
```

The top-level object has `type: "stream_event"` and the raw API event lives inside the `event` field. Non-streaming lines use different top-level types: `"assistant"` for complete assistant messages, `"result"` for the final result, and `"system"` for system events like API retries.

### 2. Tool Use Event Lifecycle (content_block_start -> deltas -> stop)

**content_block_start (tool_use):**
```json
{
  "type": "content_block_start",
  "index": 1,
  "content_block": {
    "type": "tool_use",
    "id": "toolu_01T1x1fJ34qAmk2tNTrN7Up6",
    "name": "get_weather",
    "input": {}
  }
}
```
Key fields: `content_block.type` is `"tool_use"`, `content_block.id` is the tool use ID (prefixed `toolu_`), `content_block.name` is the tool name, `content_block.input` is always `{}` (empty placeholder -- real input comes via deltas).

**content_block_delta (input_json_delta):**
```json
{
  "type": "content_block_delta",
  "index": 1,
  "delta": {
    "type": "input_json_delta",
    "partial_json": "{\"location\": \"San Fra"
  }
}
```
The `delta.partial_json` field contains a string fragment. You MUST concatenate all `partial_json` strings and parse the result on `content_block_stop`. The first delta often has `partial_json: ""` (empty string). Current models emit one complete key-value pair at a time, so there may be pauses between deltas.

**content_block_stop:**
```json
{"type": "content_block_stop", "index": 1}
```

**Accumulation contract:**
1. On `content_block_start` with `content_block.type === "tool_use"`, initialize `inputJson = ""`
2. On each `content_block_delta` with `delta.type === "input_json_delta"`, append `inputJson += delta.partial_json`
3. On `content_block_stop`, parse `JSON.parse(inputJson)` to get the complete tool input object

### 3. Thinking Blocks (Extended Thinking)

**CRITICAL LIMITATION: Extended thinking DISABLES StreamEvent emission in the Claude Agent SDK / CLI.** When `max_thinking_tokens` is set, you only receive complete messages, not streaming deltas. This means our chat UI will NOT receive thinking_delta events from `claude -p --output-format stream-json` if extended thinking is enabled.

However, at the raw API level, thinking blocks DO stream. The format is:

**content_block_start (thinking):**
```json
{
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "thinking",
    "thinking": "",
    "signature": ""
  }
}
```

**content_block_delta (thinking_delta):**
```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "thinking_delta",
    "thinking": "I need to find the GCD using the Euclidean algorithm.\n\n1071 = 2 x 462 + 147"
  }
}
```

**signature_delta (just before content_block_stop):**
```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "signature_delta",
    "signature": "EqQBCgIYAhIM1gbcDa9GJwZA2b3h..."
  }
}
```

Thinking blocks always come BEFORE text blocks (index 0). The signature is an encrypted version of the thinking for multi-turn continuity.

### 4. message_start Event (Initial Usage)

```json
{
  "type": "message_start",
  "message": {
    "id": "msg_014p7gG3wDgGV9EUtLvnow3U",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-4-6",
    "content": [],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": 472,
      "output_tokens": 2,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0
    }
  }
}
```

The `usage` in `message_start` shows initial token counts (input_tokens reflects prompt size, output_tokens starts at 1-3).

### 5. message_delta Event (Final Usage + Stop Reason)

```json
{
  "type": "message_delta",
  "delta": {
    "stop_reason": "end_turn",
    "stop_sequence": null
  },
  "usage": {
    "output_tokens": 15
  }
}
```

For tool use, `stop_reason` is `"tool_use"` instead of `"end_turn"`. The `usage.output_tokens` here is **cumulative** (total output tokens for the entire message, not incremental).

### 6. CLI Result Event (Final -- with Cost)

The final NDJSON line from `--output-format stream-json` (or the only line from `--output-format json`) is:

```json
{
  "type": "result",
  "subtype": "success",
  "result": "The answer is 21.",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_cost_usd": 0.01,
  "duration_ms": 1234,
  "structured_output": null
}
```

Key fields: `result` is the final text output, `total_cost_usd` is the cumulative cost, `session_id` for resumption, `duration_ms` for timing.

### 7. System Events (API Retry)

```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 1,
  "max_retries": 5,
  "retry_delay_ms": 1000,
  "error_status": 529,
  "error": "rate_limit",
  "uuid": "...",
  "session_id": "..."
}
```

### 8. Server Tool Use (web_search etc.)

Some tools are server-side (Anthropic-hosted). They use `type: "server_tool_use"` instead of `"tool_use"`:

```json
{
  "type": "content_block_start",
  "index": 1,
  "content_block": {
    "type": "server_tool_use",
    "id": "srvtoolu_014hJH82Qum7Td6UV8gDXThB",
    "name": "web_search",
    "input": {}
  }
}
```

Their results come as `web_search_tool_result` content blocks with encrypted content.

### 9. Complete Event Type Reference (all delta.type values)

| delta.type | Parent content_block.type | Key field | Description |
|---|---|---|---|
| `text_delta` | `text` | `delta.text` | Streaming text chunk |
| `input_json_delta` | `tool_use` or `server_tool_use` | `delta.partial_json` | Partial JSON string for tool input |
| `thinking_delta` | `thinking` | `delta.thinking` | Thinking text chunk (API only, not CLI) |
| `signature_delta` | `thinking` | `delta.signature` | Encrypted thinking signature |

### 10. Complete CLI NDJSON Line Types (top-level `type` field)

| type | When emitted | Key fields |
|---|---|---|
| `stream_event` | During streaming (with --verbose --include-partial-messages) | `.event` contains raw API event |
| `assistant` | Complete assistant message | `.message.content[]` array of content blocks |
| `result` | Final line | `.result`, `.total_cost_usd`, `.session_id`, `.duration_ms` |
| `system` | API retry, errors | `.subtype`, `.error`, `.attempt` |

## Key Takeaways

1. **CLI wraps API events**: Each NDJSON line from `stream-json` has `type: "stream_event"` with the raw API event in `.event`. Your parser must unwrap: `line.event.type`, `line.event.delta`, etc.

2. **Tool use lifecycle is 3 phases**: `content_block_start` (name + id) -> N x `content_block_delta` (partial_json strings) -> `content_block_stop`. Accumulate partial_json as strings, parse on stop.

3. **Thinking is NOT available in CLI stream-json mode**: Extended thinking disables StreamEvent emission in the Agent SDK. This is a hard limitation. If thinking is needed, use the raw API directly (not the CLI).

4. **Usage/cost comes in 3 places**: (a) `message_start.message.usage` has input_tokens, (b) `message_delta.usage` has cumulative output_tokens, (c) `result` event has `total_cost_usd` and `session_id`.

5. **Tool name is in content_block_start, NOT in deltas**: The `content_block.name` field only appears once at the start. Deltas only carry `partial_json`.

6. **Server tools exist**: `server_tool_use` type for Anthropic-hosted tools (web_search). Same streaming pattern but different type string.

## Implications for This Project

1. **Chat UI event parser** must handle two layers: unwrap `stream_event` envelope first, then dispatch on the inner `event.type` (content_block_start, content_block_delta, content_block_stop, message_start, message_delta, message_stop).

2. **Tool call rendering**: On `content_block_start` with `tool_use`/`server_tool_use`, show tool name + spinner. Accumulate `partial_json` for live argument preview. On `content_block_stop`, show complete parsed input.

3. **Thinking indicator**: Since thinking events are NOT emitted in CLI stream-json mode, we CANNOT show live thinking text. We can only show a generic "thinking..." indicator based on timing gaps between events, or detect thinking from complete `assistant` messages that contain thinking blocks.

4. **Cost tracking**: Extract `total_cost_usd` from the `result` event (last NDJSON line). For per-turn cost, track `message_start.message.usage.input_tokens` and `message_delta.usage.output_tokens`.

5. **Tool result display**: Tool results are NOT in the streaming events -- they come as complete `assistant` messages between streaming turns (the agent loop executes the tool and sends the result back). The chat UI should show tool results from the `assistant` message type events, not from stream events.

6. **The existing JobRunner.js** already handles the NDJSON parsing correctly (readline + JSON.parse per line). The new chat UI can reuse this pattern but needs to dispatch on the inner event types rather than just forwarding raw events.

## Sources

- [Streaming Messages - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/streaming) -- Full event type reference with exact JSON examples
- [Fine-grained tool streaming - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) -- Tool use accumulation contract
- [Extended thinking - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) -- Thinking block streaming format
- [Stream responses in real-time - Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) -- StreamEvent wrapper, known limitations (thinking disables streaming)
- [Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless) -- CLI stream-json flags and system/api_retry event format
- [How to Extract Text from Claude Code JSON Stream Output](https://www.ytyng.com/en/blog/claude-stream-json-jq) -- Confirmed CLI stream_event wrapper format
- [Blake Crosley's Claude Code CLI Guide](https://blakecrosley.com/guides/claude-code) -- Result event fields (total_cost_usd, session_id, duration_ms)
