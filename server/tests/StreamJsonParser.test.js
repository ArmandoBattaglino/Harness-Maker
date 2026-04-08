// tests/StreamJsonParser.test.js
// Unit tests for StreamJsonParser — NDJSON line parser for Claude CLI stream-json output.
// Covers all 9+ event types, error cases, and content_block_stop dispatch.

import { describe, it, expect, beforeEach } from 'vitest';
import StreamJsonParser from '../services/StreamJsonParser.js';

/** Helper: wrap a raw API event in the CLI stream_event envelope */
function streamEvent(event) {
  return JSON.stringify({ type: 'stream_event', event });
}

describe('StreamJsonParser', () => {
  let parser;

  beforeEach(() => {
    parser = new StreamJsonParser();
  });

  // =========================================================================
  // content_block_start
  // =========================================================================

  describe('content_block_start — tool_use', () => {
    it('should return tool_start with toolName and toolUseId', () => {
      const line = streamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'toolu_01T1x1fJ34qAmk2tNTrN7Up6',
          name: 'get_weather',
          input: {},
        },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({
        type: 'tool_start',
        toolName: 'get_weather',
        toolUseId: 'toolu_01T1x1fJ34qAmk2tNTrN7Up6',
      });
    });

    it('should handle server_tool_use the same as tool_use', () => {
      const line = streamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'server_tool_use',
          id: 'srvtoolu_014hJH82Qum7Td6UV8gDXThB',
          name: 'web_search',
          input: {},
        },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({
        type: 'tool_start',
        toolName: 'web_search',
        toolUseId: 'srvtoolu_014hJH82Qum7Td6UV8gDXThB',
      });
    });
  });

  describe('content_block_start — text', () => {
    it('should return text_start', () => {
      const line = streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'text_start' });
    });
  });

  describe('content_block_start — thinking', () => {
    it('should return thinking_start', () => {
      const line = streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'thinking_start' });
    });
  });

  // =========================================================================
  // content_block_delta
  // =========================================================================

  describe('content_block_delta — text_delta', () => {
    it('should return text_delta with text', () => {
      const line = streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello world' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'text_delta', text: 'Hello world' });
    });

    it('should handle empty text', () => {
      const line = streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: '' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'text_delta', text: '' });
    });
  });

  describe('content_block_delta — input_json_delta', () => {
    it('should return tool_delta with partialJson', () => {
      const line = streamEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"location": "San Fra' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'tool_delta', partialJson: '{"location": "San Fra' });
    });

    it('should handle empty partial_json (first delta)', () => {
      const line = streamEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'tool_delta', partialJson: '' });
    });
  });

  describe('content_block_delta — thinking_delta', () => {
    it('should return thinking with text', () => {
      const line = streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'I need to calculate the GCD...' },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'thinking', text: 'I need to calculate the GCD...' });
    });
  });

  // =========================================================================
  // content_block_stop — dispatch based on active block type
  // =========================================================================

  describe('content_block_stop dispatch', () => {
    it('should return tool_stop after a tool_use block', () => {
      // Start a tool_use block
      parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_abc', name: 'Bash', input: {} },
      }));

      // Stop it
      const result = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 1,
      }));

      expect(result).toEqual({ type: 'tool_stop', toolUseId: 'toolu_abc' });
    });

    it('should return text_stop after a text block', () => {
      // Start a text block
      parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }));

      // Stop it
      const result = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 0,
      }));

      expect(result).toEqual({ type: 'text_stop' });
    });

    it('should return thinking_stop after a thinking block', () => {
      parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }));

      const result = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 0,
      }));

      expect(result).toEqual({ type: 'thinking_stop' });
    });

    it('should return text_stop when no active block is tracked', () => {
      const result = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 0,
      }));

      expect(result).toEqual({ type: 'text_stop' });
    });
  });

  // =========================================================================
  // message_start / message_delta / message_stop
  // =========================================================================

  describe('message_start', () => {
    it('should return message_start', () => {
      const line = streamEvent({
        type: 'message_start',
        message: {
          id: 'msg_014p7gG3wDgGV9EUtLvnow3U',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-4-6',
          content: [],
          usage: { input_tokens: 472, output_tokens: 2 },
        },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'message_start' });
    });
  });

  describe('message_delta', () => {
    it('should return message_delta with stopReason and usage', () => {
      const line = streamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 150 },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({
        type: 'message_delta',
        stopReason: 'end_turn',
        usage: { output: 150 },
      });
    });

    it('should handle tool_use stop_reason', () => {
      const line = streamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 42 },
      });

      const result = parser.parseLine(line);
      expect(result.stopReason).toBe('tool_use');
    });
  });

  describe('message_stop', () => {
    it('should return message_stop', () => {
      const line = streamEvent({ type: 'message_stop' });
      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'message_stop' });
    });
  });

  // =========================================================================
  // Result event (top-level, DEC-029)
  // =========================================================================

  describe('result event', () => {
    it('should map all cost/usage/session fields', () => {
      const line = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'The answer is 42.',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        total_cost_usd: 0.0134,
        duration_ms: 2345,
        is_error: false,
        usage: {
          input_tokens: 1024,
          output_tokens: 256,
          cache_read_input_tokens: 512,
          cache_creation_input_tokens: 128,
        },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({
        type: 'result',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        costUsd: 0.0134,
        durationMs: 2345,
        usage: {
          input: 1024,
          output: 256,
          cacheRead: 512,
          cacheWrite: 128,
        },
        isError: false,
        errorMessage: null,
      });
    });

    it('should detect error results via is_error', () => {
      const line = JSON.stringify({
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: 'Tool execution failed',
        session_id: 'sess-err',
        total_cost_usd: 0.001,
        duration_ms: 100,
        usage: {},
      });

      const result = parser.parseLine(line);
      expect(result.isError).toBe(true);
      expect(result.errorMessage).toBe('Tool execution failed');
    });

    it('should detect error results via subtype "error"', () => {
      const line = JSON.stringify({
        type: 'result',
        subtype: 'error',
        error: 'Something went wrong',
        session_id: 'sess-err2',
        total_cost_usd: 0,
        duration_ms: 50,
        usage: {},
      });

      const result = parser.parseLine(line);
      expect(result.isError).toBe(true);
      expect(result.errorMessage).toBe('Something went wrong');
    });

    it('should handle missing usage fields gracefully', () => {
      const line = JSON.stringify({
        type: 'result',
        session_id: 'sess-minimal',
        total_cost_usd: 0.005,
        duration_ms: 500,
      });

      const result = parser.parseLine(line);
      expect(result.usage).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
    });
  });

  // =========================================================================
  // System events
  // =========================================================================

  describe('system — api_retry', () => {
    it('should return api_retry with attempt, delay, errorCode', () => {
      const line = JSON.stringify({
        type: 'system',
        subtype: 'api_retry',
        attempt: 2,
        max_retries: 5,
        retry_delay_ms: 1500,
        error_status: 529,
        error: 'rate_limit',
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({
        type: 'api_retry',
        attempt: 2,
        delay: 1500,
        errorCode: '529',
      });
    });

    it('should fall back to error string when error_status is absent', () => {
      const line = JSON.stringify({
        type: 'system',
        subtype: 'api_retry',
        attempt: 1,
        retry_delay_ms: 1000,
        error: 'overloaded',
      });

      const result = parser.parseLine(line);
      expect(result.errorCode).toBe('overloaded');
    });
  });

  describe('system — other subtypes', () => {
    it('should pass through non-api_retry system events', () => {
      const line = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'abc',
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'system', subtype: 'init' });
    });
  });

  // =========================================================================
  // Assistant message (complete, not streaming)
  // =========================================================================

  describe('assistant -> message', () => {
    it('should return message with content array', () => {
      const content = [
        { type: 'text', text: 'Hello! Here is the answer.' },
        { type: 'tool_use', id: 'toolu_xyz', name: 'Bash', input: { command: 'ls' } },
      ];

      const line = JSON.stringify({
        type: 'assistant',
        message: { content },
      });

      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'message', content });
    });

    it('should handle missing message.content gracefully', () => {
      const line = JSON.stringify({ type: 'assistant' });
      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'message', content: null });
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error: malformed JSON line', () => {
    it('should return error event for invalid JSON', () => {
      const result = parser.parseLine('this is not json {{{');
      expect(result).toEqual({ type: 'error', message: 'Malformed JSON line' });
    });

    it('should NOT throw', () => {
      expect(() => parser.parseLine('not json')).not.toThrow();
    });

    it('should return error for truncated JSON', () => {
      const result = parser.parseLine('{"type":"result","session_id":');
      expect(result.type).toBe('error');
    });
  });

  describe('error: line exceeds 1MB cap (SEC-SJ-03)', () => {
    it('should return error event for oversized line', () => {
      const bigLine = 'x'.repeat(1_048_577); // 1 MB + 1 byte
      const result = parser.parseLine(bigLine);
      expect(result).toEqual({ type: 'error', message: 'Line exceeds 1MB cap' });
    });

    it('should NOT throw for oversized line', () => {
      const bigLine = 'y'.repeat(1_048_577);
      expect(() => parser.parseLine(bigLine)).not.toThrow();
    });
  });

  describe('empty and whitespace lines', () => {
    it('should return ignore for empty string', () => {
      expect(parser.parseLine('')).toEqual({ type: 'ignore' });
    });

    it('should return ignore for whitespace-only string', () => {
      expect(parser.parseLine('   \n  ')).toEqual({ type: 'ignore' });
    });

    it('should return ignore for null/undefined', () => {
      expect(parser.parseLine(null)).toEqual({ type: 'ignore' });
      expect(parser.parseLine(undefined)).toEqual({ type: 'ignore' });
    });
  });

  // =========================================================================
  // Unknown event types
  // =========================================================================

  describe('unknown top-level types', () => {
    it('should return unknown for unrecognized types', () => {
      const line = JSON.stringify({ type: 'rate_limit_event', data: {} });
      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'unknown', rawType: 'rate_limit_event' });
    });

    it('should return unknown for user type', () => {
      const line = JSON.stringify({ type: 'user', message: { content: 'hello' } });
      const result = parser.parseLine(line);
      expect(result).toEqual({ type: 'unknown', rawType: 'user' });
    });
  });

  // =========================================================================
  // Reset
  // =========================================================================

  describe('reset()', () => {
    it('should clear active block tracking', () => {
      // Start a tool_use block
      parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_reset', name: 'Read', input: {} },
      }));

      // Reset
      parser.reset();

      // content_block_stop should now return text_stop (no active block)
      const result = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 0,
      }));
      expect(result).toEqual({ type: 'text_stop' });
    });
  });

  // =========================================================================
  // Full sequence simulation
  // =========================================================================

  describe('full tool use lifecycle', () => {
    it('should track start -> deltas -> stop for a tool call', () => {
      const r1 = parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_full', name: 'Bash', input: {} },
      }));
      expect(r1.type).toBe('tool_start');
      expect(r1.toolName).toBe('Bash');

      const r2 = parser.parseLine(streamEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"command":' },
      }));
      expect(r2.type).toBe('tool_delta');
      expect(r2.partialJson).toBe('{"command":');

      const r3 = parser.parseLine(streamEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: ' "ls -la"}' },
      }));
      expect(r3.type).toBe('tool_delta');

      const r4 = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 1,
      }));
      expect(r4).toEqual({ type: 'tool_stop', toolUseId: 'toolu_full' });
    });
  });

  describe('text block followed by tool block', () => {
    it('should dispatch stop events correctly for mixed blocks', () => {
      // Text block
      parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }));
      const stopText = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 0,
      }));
      expect(stopText.type).toBe('text_stop');

      // Tool block
      parser.parseLine(streamEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_mixed', name: 'Edit', input: {} },
      }));
      const stopTool = parser.parseLine(streamEvent({
        type: 'content_block_stop',
        index: 1,
      }));
      expect(stopTool.type).toBe('tool_stop');
      expect(stopTool.toolUseId).toBe('toolu_mixed');
    });
  });
});
