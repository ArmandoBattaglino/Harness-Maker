import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NodeValidationCard from './NodeValidationCard.jsx';

const sampleIssues = [
  {
    id: 'agent:node-a:empty-system-prompt',
    severity: 'warning',
    summary: 'Empty system prompt',
    detail: 'Agent A has an empty system prompt. Add guidance so the agent knows what to do.',
  },
];

describe('NodeValidationCard interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the floating card and scroll area as nowheel so React Flow does not zoom on wheel', () => {
    render(
      <NodeValidationCard
        nodeId="node-a"
        nodeLabel="Agent A"
        issues={sampleIssues}
        onClose={vi.fn()}
      />
    );

    const card = screen.getByText('Agent A').closest('div.nowheel.nodrag.nopan');
    expect(card).toBeInTheDocument();

    const scrollArea = card.querySelector('.validation-card-scrollbar');
    expect(scrollArea).toHaveClass('nowheel');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();

    render(
      <NodeValidationCard
        nodeId="node-a"
        nodeLabel="Agent A"
        issues={sampleIssues}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on outside click after the delayed listener attaches', () => {
    const onClose = vi.fn();

    render(
      <div>
        <NodeValidationCard
          nodeId="node-a"
          nodeLabel="Agent A"
          issues={sampleIssues}
          onClose={onClose}
        />
        <button type="button">Outside</button>
      </div>
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
