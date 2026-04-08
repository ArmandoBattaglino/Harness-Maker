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

  it('salvages the remaining semantic sentence from a noisy Codex fallback payload', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', [
      'No extra text after that last handoff line. > Improve documentation in @filename gpt-5.4 high . 100% left . ~\\\\Downloads\\\\Test workflows - Copia',
      'Tip: New Use /fast to enable our fastest inference at 2X plan usage.',
      '> You are the triage node. Route the incoming request to both Agent-A and Agent-B in parallel for greeting generation.',
      'Routing the greeting-generation request to two parallel subagents now, then I will collect both outputs and emit a single handoff token.',
      '. Working (16s > Improve documentation in @filename gpt-5.4 high . 97% left . ~\\\\Downloads\\\\Test workflows - Copia . Main [default]',
      '. Spawned Ohm [default] (gpt-5.4-mini low)',
      '| You are Agent-A. Generate one short greeting only. Keep it to a single sentence.',
      'Both greeting workers are running. I am waiting on their responses so the handoff summarizes completed work rather than intent.',
    ].join('\n'));
    vi.advanceTimersByTime(11);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].text).toBe(
      'Both greeting workers are running. I am waiting on their responses so the handoff summarizes completed work rather than intent.'
    );
  });

  it('drops garbled Codex working-meter fragments that survive chunk-level filtering', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', 'Wo W    ng 1 Wo    g 2 W    ng 3 Wo    g 4 W    ng 5 Wo    g');
    vi.advanceTimersByTime(11);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('drops inline prompt-echo payloads when the remaining text is still mostly orchestration chrome', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', [
      '. Working (20s > Find and fix a bug in @filename',
      "Routing the greeting request to two parallel agents now, then I'll emit a single downstream handoff token with the combined result.",
      '97% left . ~\\\\Downloads\\\\Test workflows - Copia',
      'When your work is complete, emit one valid handoff token using any connectedtarget ID: node-2, node-3.',
      'The runtime will fan out that handoff to every connected downstream node foryou. Last line only:',
    ].join(' '));
    vi.advanceTimersByTime(11);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('drops usage-limit blocker chrome when the remaining payload is only prompt echo and runtime banners', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed('exec-1', 'node-a', [
      '›Run /review on my current changes',
      'Tip: New Try the Codex App, now available on Windows, with 2x rate limits until April 2nd.',
      "Run 'codex app' or visit https://chatgpt.com/codex?app-landing-page=true",
      "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or tryagain at 7:13 AM.",
    ].join(' '));
    vi.advanceTimersByTime(11);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('normalizes compressed chat prose before emitting the message', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed(
      'exec-1',
      'node-a',
      'Ibeneficidellavororemotoincludonoflessibilitaemeno pendolarismo.'
    );
    vi.advanceTimersByTime(11);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].text).toBe(
      'I benefici del lavoro remoto includono flessibilita e meno pendolarismo.'
    );
  });

  it('strips corrupted short-token leaders when readable prose follows', () => {
    const extractor = new ChatExtractor({ onMessage, silenceTimeoutMs: 10 });

    extractor.feed(
      'exec-1',
      'node-a',
      'g i u y u3 I benefici del lavoro remoto migliorano equilibrio e produttivita.'
    );
    vi.advanceTimersByTime(11);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].text).toBe(
      'I benefici del lavoro remoto migliorano equilibrio e produttivita.'
    );
  });
});
