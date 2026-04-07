import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatExtractor } from '../services/ChatExtractor.js';

describe('ChatExtractor', () => {
  let onMessage;

  beforeEach(() => {
    vi.useFakeTimers();
    onMessage = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves real whitespace between chunks instead of injecting artificial line breaks', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', 'Hello ');
    extractor.feed('exec-1', 'node-a', 'world from agent');
    vi.advanceTimersByTime(11);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0]).toMatchObject({
      executionId: 'exec-1',
      nodeId: 'node-a',
      role: 'assistant',
      text: 'Hello world from agent',
    });
  });

  it('keeps mid-word chunk splits contiguous instead of inserting spaces', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', 'Ill');
    extractor.feed('exec-1', 'node-a', 'uminating result for the user');
    vi.advanceTimersByTime(11);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].text).toBe('Illuminating result for the user');
  });

  it('can reuse an external sanitizer for the final emitted chat text', () => {
    const sanitizeMessage = vi.fn().mockReturnValue('Clean summary from sanitizer');
    const extractor = new ChatExtractor({
      onMessage,
      silenceTimeoutMs: 10,
      sanitizeMessage,
    });

    extractor.feed('exec-1', 'node-a', 'Noisy raw message that should be normalized');
    vi.advanceTimersByTime(11);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].text).toBe('Clean summary from sanitizer');
    expect(sanitizeMessage).toHaveBeenCalledWith(
      'Noisy raw message that should be normalized',
      expect.objectContaining({
        executionId: 'exec-1',
        nodeId: 'node-a',
        rawText: 'Noisy raw message that should be normalized',
      })
    );
  });

  it('drops the message when the sanitizer suppresses pure runtime chrome', () => {
    const sanitizeMessage = vi.fn().mockReturnValue('');
    const extractor = new ChatExtractor({
      onMessage,
      silenceTimeoutMs: 10,
      sanitizeMessage,
    });

    extractor.feed('exec-1', 'node-a', 'Opus4.6withmediumeffortClaudeMax');
    vi.advanceTimersByTime(11);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('does not emit intermediate periodic messages when periodic flushing is disabled', () => {
    const extractor = new ChatExtractor({
      onMessage,
      silenceTimeoutMs: 100,
      periodicFlushMs: 0,
    });

    extractor.feed('exec-1', 'node-a', 'A substantial message from the agent');
    vi.advanceTimersByTime(90);
    expect(onMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(11);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps short but meaningful greetings instead of dropping them as noise', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', 'Ciao e benvenuto!__DONE__');

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0]).toMatchObject({
      executionId: 'exec-1',
      nodeId: 'node-a',
      role: 'assistant',
      text: 'Ciao e benvenuto!',
    });
  });
});
