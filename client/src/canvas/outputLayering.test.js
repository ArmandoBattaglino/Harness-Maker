import { describe, expect, it } from 'vitest';
import { applyExpandedOutputLayering } from './outputLayering';

describe('applyExpandedOutputLayering', () => {
  it('returns the original nodes when no output card is open', () => {
    const nodes = [
      { id: 'agent-a', type: 'agent' },
      { id: 'agent-b', type: 'agent', zIndex: 12 },
    ];

    expect(applyExpandedOutputLayering(nodes, null)).toBe(nodes);
  });

  it('elevates the node with the open output above every other canvas node', () => {
    const nodes = [
      { id: 'agent-a', type: 'agent', zIndex: 25 },
      { id: 'agent-b', type: 'agent' },
      { id: 'agent-c', type: 'agent', zIndex: 800 },
    ];

    const layered = applyExpandedOutputLayering(nodes, 'agent-b');

    expect(layered).not.toBe(nodes);
    expect(layered.find((node) => node.id === 'agent-b')?.zIndex).toBe(2800);
    expect(layered.find((node) => node.id === 'agent-a')?.zIndex).toBe(25);
    expect(layered.find((node) => node.id === 'agent-c')?.zIndex).toBe(800);
  });

  it('does not lower a node that is already above the computed elevated layer', () => {
    const nodes = [
      { id: 'agent-a', type: 'agent', zIndex: 4000 },
      { id: 'agent-b', type: 'agent', zIndex: 1500 },
    ];

    const layered = applyExpandedOutputLayering(nodes, 'agent-a');

    expect(layered).toBe(nodes);
    expect(layered[0].zIndex).toBe(4000);
  });
});
