// chat-snippet-option-b.test.js
// Verifies Option B: AgentNode snippets come from clean chat messages
// instead of raw PTY output. The ChatExtractor pipeline produces clean text,
// which the WS handler sends as chat_message events; the client then uses
// that text as the node snippet (lastChatSnippet) instead of the noisy
// lastOutputSnippet from raw PTY.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatExtractor } from '../services/ChatExtractor.js';

describe('Option B — chat messages as node snippets', () => {
  let onMessage;

  beforeEach(() => {
    vi.useFakeTimers();
    onMessage = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should emit a clean chat message that can replace the raw PTY snippet', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 50 });

    // Simulate raw PTY output with typical noise
    const noisyPty = [
      '\x1b[32m⠋\x1b[0m Working (2.3s)',
      '\n',
      'Ecco il mio report finale sulla struttura del codice.\n',
      'Il server usa Express con WebSocket per la comunicazione real-time.\n',
      '─────────────────\n',
      '__DONE__',
    ].join('');

    extractor.feed('test-exec', 'agent-writer', noisyPty);
    // ChatExtractor flushes immediately on __DONE__ boundary
    vi.advanceTimersByTime(100);

    expect(onMessage).toHaveBeenCalled();
    const chatMsg = onMessage.mock.calls[onMessage.mock.calls.length - 1][0];

    // The emitted message is what the client uses as lastChatSnippet
    expect(chatMsg.nodeId).toBe('agent-writer');
    expect(chatMsg.role).toBe('assistant');
    expect(chatMsg.text).toContain('report finale');
    expect(chatMsg.text).toContain('Express');

    // Noise should be stripped
    expect(chatMsg.text).not.toContain('⠋');
    expect(chatMsg.text).not.toContain('Working (2.3s)');
    expect(chatMsg.text).not.toContain('__DONE__');
    expect(chatMsg.text).not.toMatch(/─{3,}/);
    expect(chatMsg.text).not.toMatch(/\x1b/);

    extractor.cleanup('test-exec');
  });

  it('should produce clean snippet even with ConPTY column-wrap noise', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 50 });

    // ConPTY wraps lines at column width, splitting words mid-stream
    extractor.feed('test-exec', 'agent-reviewer', 'La documentazione descrive come il publish');
    extractor.feed('test-exec', 'agent-reviewer', 'er gestisce i messaggi tra agenti.\n');
    extractor.feed('test-exec', 'agent-reviewer', 'Ogni handoff viene loggato nel feed.\n');

    // Force flush
    extractor.flush('test-exec', 'agent-reviewer');
    vi.advanceTimersByTime(100);

    expect(onMessage).toHaveBeenCalled();
    const chatMsg = onMessage.mock.calls[onMessage.mock.calls.length - 1][0];

    // Reflowed text should join "publish" + "er" back into "publisher"
    expect(chatMsg.text).toContain('publisher');
    expect(chatMsg.text).toContain('handoff');
    expect(chatMsg.role).toBe('assistant');

    extractor.cleanup('test-exec');
  });

  it('should filter out CLI chrome lines that pollute raw PTY snippets', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 50 });

    const cliChrome = [
      'Claude Code v2.1.92\n',
      'Opus 4.6 with medium effort\n',
      'Welcome back nicolò!\n',
      '> · esc to int… · medium · /eff…\n',
      'Ho analizzato il codice e trovato 3 problemi:\n',
      '1. Manca la validazione degli input\n',
      '2. Il CSRF header non viene controllato\n',
      '3. Le route non hanno rate limiting\n',
    ].join('');

    extractor.feed('test-exec', 'agent-auditor', cliChrome);
    extractor.flush('test-exec', 'agent-auditor');
    vi.advanceTimersByTime(100);

    expect(onMessage).toHaveBeenCalled();
    const chatMsg = onMessage.mock.calls[onMessage.mock.calls.length - 1][0];

    // Meaningful content preserved
    expect(chatMsg.text).toContain('3 problemi');
    expect(chatMsg.text).toContain('validazione');

    // CLI chrome stripped
    expect(chatMsg.text).not.toContain('Claude Code v2.1.92');
    expect(chatMsg.text).not.toContain('Opus 4.6');
    expect(chatMsg.text).not.toContain('Welcome back');
    expect(chatMsg.text).not.toContain('esc to int');

    extractor.cleanup('test-exec');
  });

  it('should simulate full Option B flow: chat_message → lastChatSnippet update', () => {
    // This simulates what useSwarm.js now does when receiving a chat_message event:
    // 1. ChatExtractor emits clean text
    // 2. Server broadcasts as WS chat_message
    // 3. Client handler sets lastChatSnippet on the agent state

    // Simulate Zustand-like store
    const agentStates = {};
    const updateAgentState = (nodeId, patch) => {
      agentStates[nodeId] = { ...(agentStates[nodeId] || {}), ...patch };
    };

    // Simulate WS message handler (mirrors useSwarm.js chat_message case)
    const handleChatMessage = (msg) => {
      if ((msg.role === 'assistant' || !msg.role) && msg.nodeId && msg.text) {
        updateAgentState(msg.nodeId, { lastChatSnippet: msg.text });
      }
    };

    // Raw PTY sets lastOutputSnippet (noisy)
    updateAgentState('node-a', {
      status: 'running',
      lastOutputSnippet: '⠋ Working (1.2s)\nOpus 4.6 with medium effort\nHo trovato il bug nel codice',
    });

    // Then chat_message arrives with clean text
    handleChatMessage({
      nodeId: 'node-a',
      role: 'assistant',
      text: 'Ho trovato il bug nel codice',
    });

    // AgentNode logic: prefer lastChatSnippet over lastOutputSnippet
    const state = agentStates['node-a'];
    const displaySnippet = state.lastChatSnippet || state.lastOutputSnippet;

    expect(displaySnippet).toBe('Ho trovato il bug nel codice');
    expect(displaySnippet).not.toContain('⠋');
    expect(displaySnippet).not.toContain('Working');
    expect(displaySnippet).not.toContain('Opus');
  });

  it('should NOT set lastChatSnippet for non-assistant messages (hitl, system)', () => {
    const agentStates = {};
    const updateAgentState = (nodeId, patch) => {
      agentStates[nodeId] = { ...(agentStates[nodeId] || {}), ...patch };
    };

    const handleChatMessage = (msg) => {
      if ((msg.role === 'assistant' || !msg.role) && msg.nodeId && msg.text) {
        updateAgentState(msg.nodeId, { lastChatSnippet: msg.text });
      }
    };

    // System message should not update snippet
    handleChatMessage({ nodeId: 'node-b', role: 'system', text: 'Delay 5s started' });
    expect(agentStates['node-b']).toBeUndefined();

    // HITL message should not update snippet
    handleChatMessage({ nodeId: 'node-b', role: 'hitl', text: 'Approval required' });
    expect(agentStates['node-b']).toBeUndefined();

    // Assistant message SHOULD update snippet
    handleChatMessage({ nodeId: 'node-b', role: 'assistant', text: 'Task completed successfully' });
    expect(agentStates['node-b'].lastChatSnippet).toBe('Task completed successfully');
  });
});
