import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import ChatMessage from './ChatMessage.jsx';

describe('ChatMessage client rendering contracts', () => {
  it('renders structured metadata blocks and the cost footer', async () => {
    const user = userEvent.setup();
    render(
      <ChatMessage
        agentLabel="Writer"
        message={{
          role: 'assistant',
          text: 'Structured **answer**',
          timestamp: Date.UTC(2026, 3, 9, 12, 0, 0),
          nodeId: 'node-a',
          spawnMode: 'stream-json',
          toolUse: [
            {
              toolName: 'Read',
              partialArgs: '{"file":"notes.md"}',
              toolUseId: 'tool-1',
            },
          ],
          thinking: 'Need to compare two sources first.',
          cost: {
            inputTokens: 12,
            outputTokens: 3,
            cacheReadTokens: 4,
            cacheWriteTokens: 1,
            costUsd: 0.01,
            durationMs: 2500,
          },
        }}
      />,
    );

    expect(screen.getByText('Structured')).toBeInTheDocument();
    expect(screen.getByText('answer')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('$0.0100')).toBeInTheDocument();
    expect(screen.getByText('2.5s')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Read/i }));
    expect(screen.getByText(/"file": "notes.md"/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Thinking/i }));
    expect(screen.getByText('Need to compare two sources first.')).toBeInTheDocument();
  });

  it('sanitizes unsafe markdown links in structured messages', () => {
    const { container } = render(
      <ChatMessage
        agentLabel="Researcher"
        message={{
          role: 'assistant',
          text: '[click me](javascript:alert(1)) and **safe text**',
          timestamp: Date.UTC(2026, 3, 9, 12, 1, 0),
          nodeId: 'node-b',
          spawnMode: 'stream-json',
        }}
      />,
    );

    expect(screen.getByText('click me')).toBeInTheDocument();
    expect(screen.getByText('safe text')).toBeInTheDocument();
    const link = container.querySelector('a');
    if (link) {
      expect(link.getAttribute('href') || '').not.toMatch(/^javascript:/i);
    }
  });

  it('shows the structured fallback text when the structured message body is empty', () => {
    render(
      <ChatMessage
        agentLabel="Formatter"
        message={{
          role: 'assistant',
          text: '',
          timestamp: Date.UTC(2026, 3, 9, 12, 2, 0),
          nodeId: 'node-c',
          spawnMode: 'stream-json',
        }}
      />,
    );

    expect(screen.getByText('Structured handoff sent.')).toBeInTheDocument();
  });
});
