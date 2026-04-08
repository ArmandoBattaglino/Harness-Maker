// server/services/StreamJsonParser.js
// Stateless NDJSON line parser for Claude CLI --output-format stream-json output.
// Transforms raw JSON lines into typed application events.
// See DEC-027, DEC-029, PRD Section 11 — StreamJsonParser.
//
// Interface: new StreamJsonParser(), parseLine(rawLine) -> { type, ...fields }
// Internal state: only tracks activeBlockType for content_block_stop dispatch.
// Never throws — all errors return error-type events.

const MAX_LINE_BYTES = 1_048_576; // 1 MB cap (SEC-SJ-03)

export default class StreamJsonParser {
  constructor() {
    /** @type {'text'|'tool_use'|'thinking'|null} */
    this._activeBlockType = null;

    /** @type {string|null} tool use ID for the active tool_use block */
    this._activeToolUseId = null;
  }

  /**
   * Parse a single NDJSON line from Claude CLI stream-json output.
   * @param {string} rawLine — one line of NDJSON text
   * @returns {{ type: string, [key: string]: unknown }}
   */
  parseLine(rawLine) {
    // --- Guard: empty/whitespace-only lines ---
    if (!rawLine || !rawLine.trim()) {
      return { type: 'ignore' };
    }

    // --- SEC-SJ-03: reject lines exceeding 1 MB ---
    if (Buffer.byteLength(rawLine, 'utf8') > MAX_LINE_BYTES) {
      return { type: 'error', message: 'Line exceeds 1MB cap' };
    }

    // --- Parse JSON (never throw) ---
    let obj;
    try {
      obj = JSON.parse(rawLine);
    } catch {
      return { type: 'error', message: 'Malformed JSON line' };
    }

    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') {
      return { type: 'error', message: 'Malformed JSON line' };
    }

    // --- Dispatch on top-level type ---
    switch (obj.type) {
      case 'system':
        return this._parseSystem(obj);

      case 'stream_event':
        return this._parseStreamEvent(obj);

      case 'result':
        return this._parseResult(obj);

      case 'assistant':
        return this._parseAssistant(obj);

      default:
        // Pass through unknown top-level types (e.g. 'user', 'rate_limit_event')
        return { type: 'unknown', rawType: obj.type };
    }
  }

  // ---------------------------------------------------------------------------
  // System events
  // ---------------------------------------------------------------------------

  _parseSystem(obj) {
    if (obj.subtype === 'api_retry') {
      return {
        type: 'api_retry',
        attempt: obj.attempt ?? 0,
        delay: obj.retry_delay_ms ?? 0,
        errorCode: obj.error_status != null ? String(obj.error_status) : (obj.error ?? 'unknown'),
      };
    }
    // Other system subtypes — pass through
    return { type: 'system', subtype: obj.subtype ?? 'unknown' };
  }

  // ---------------------------------------------------------------------------
  // Stream events (wraps raw Anthropic API streaming events)
  // ---------------------------------------------------------------------------

  _parseStreamEvent(obj) {
    const event = obj.event;
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
      return { type: 'unknown', rawType: 'stream_event' };
    }

    switch (event.type) {
      case 'content_block_start':
        return this._parseContentBlockStart(event);

      case 'content_block_delta':
        return this._parseContentBlockDelta(event);

      case 'content_block_stop':
        return this._parseContentBlockStop(event);

      case 'message_start':
        return { type: 'message_start' };

      case 'message_delta':
        return this._parseMessageDelta(event);

      case 'message_stop':
        return { type: 'message_stop' };

      default:
        return { type: 'unknown', rawType: event.type };
    }
  }

  _parseContentBlockStart(event) {
    const block = event.content_block;
    if (!block || typeof block !== 'object') {
      return { type: 'unknown', rawType: 'content_block_start' };
    }

    const blockType = block.type;

    if (blockType === 'tool_use' || blockType === 'server_tool_use') {
      this._activeBlockType = 'tool_use';
      this._activeToolUseId = block.id ?? null;
      return {
        type: 'tool_start',
        toolName: block.name ?? 'unknown',
        toolUseId: block.id ?? '',
      };
    }

    if (blockType === 'thinking') {
      this._activeBlockType = 'thinking';
      this._activeToolUseId = null;
      return { type: 'thinking_start' };
    }

    // Default: text block (or any other block type we treat as text)
    this._activeBlockType = 'text';
    this._activeToolUseId = null;
    return { type: 'text_start' };
  }

  _parseContentBlockDelta(event) {
    const delta = event.delta;
    if (!delta || typeof delta !== 'object') {
      return { type: 'unknown', rawType: 'content_block_delta' };
    }

    switch (delta.type) {
      case 'text_delta':
        return { type: 'text_delta', text: delta.text ?? '' };

      case 'input_json_delta':
        return { type: 'tool_delta', partialJson: delta.partial_json ?? '' };

      case 'thinking_delta':
        return { type: 'thinking', text: delta.thinking ?? '' };

      case 'signature_delta':
        // Signature deltas are internal — pass through as unknown
        return { type: 'unknown', rawType: 'signature_delta' };

      default:
        return { type: 'unknown', rawType: delta.type ?? 'content_block_delta' };
    }
  }

  _parseContentBlockStop(_event) {
    const blockType = this._activeBlockType;
    const toolUseId = this._activeToolUseId;

    // Reset active tracking
    this._activeBlockType = null;
    this._activeToolUseId = null;

    if (blockType === 'tool_use') {
      return { type: 'tool_stop', toolUseId: toolUseId ?? '' };
    }

    if (blockType === 'thinking') {
      return { type: 'thinking_stop' };
    }

    // Default: text_stop (covers 'text' and null/unknown)
    return { type: 'text_stop' };
  }

  _parseMessageDelta(event) {
    const delta = event.delta ?? {};
    const usage = event.usage ?? {};
    return {
      type: 'message_delta',
      stopReason: delta.stop_reason ?? null,
      usage: {
        output: usage.output_tokens ?? 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Result event (final NDJSON line — DEC-029)
  // ---------------------------------------------------------------------------

  _parseResult(obj) {
    const usage = obj.usage ?? {};
    return {
      type: 'result',
      sessionId: obj.session_id ?? null,
      costUsd: obj.total_cost_usd ?? 0,
      durationMs: obj.duration_ms ?? 0,
      usage: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
      },
      isError: obj.is_error === true || obj.subtype === 'error',
      errorMessage: obj.is_error || obj.subtype === 'error'
        ? (obj.error ?? obj.result ?? null)
        : null,
      // Canonical complete text from Claude CLI result (replaces streamed text_delta accumulation)
      resultText: typeof obj.result === 'string' ? obj.result : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Assistant message (complete message, not streaming)
  // ---------------------------------------------------------------------------

  _parseAssistant(obj) {
    const content = obj.message?.content ?? null;
    return { type: 'message', content };
  }

  /**
   * Reset internal state (active block tracking).
   * Call between turns if reusing the same parser instance.
   */
  reset() {
    this._activeBlockType = null;
    this._activeToolUseId = null;
  }
}
