// useHandoff.js — Edge animation hook for reacting to handoff counter changes.
// HandoffEdge.jsx handles the CSS animation — this hook provides
// a callback-based API for components that need to react to new handoffs.
import { useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/SwarmContext';

/**
 * Calls onHandoff(edgeId, counter) whenever an edge counter increases.
 * @param {Function} onHandoff - called with (edgeId, newCounter) on each handoff
 */
export function useHandoff(onHandoff) {
  const edgeCounters = useSwarmStore((s) => s.edgeCounters);
  const prevCountersRef = useRef({});

  useEffect(() => {
    const prev = prevCountersRef.current;
    for (const [edgeId, counter] of Object.entries(edgeCounters)) {
      const prevCount = prev[edgeId] ?? 0;
      if (counter > prevCount && onHandoff) {
        onHandoff(edgeId, counter);
      }
    }
    prevCountersRef.current = { ...edgeCounters };
  }, [edgeCounters, onHandoff]);
}

/**
 * Returns a set of edgeIds that had a handoff in the last `durationMs` milliseconds.
 * Useful for briefly highlighting a just-activated edge.
 */
export function useRecentHandoffs(durationMs = 2000) {
  const edgeCounters = useSwarmStore((s) => s.edgeCounters);
  const prevCountersRef = useRef({});
  const recentRef = useRef(new Set());

  useEffect(() => {
    const prev = prevCountersRef.current;
    for (const [edgeId, counter] of Object.entries(edgeCounters)) {
      if ((counter ?? 0) > (prev[edgeId] ?? 0)) {
        recentRef.current.add(edgeId);
        setTimeout(() => recentRef.current.delete(edgeId), durationMs);
      }
    }
    prevCountersRef.current = { ...edgeCounters };
  }, [edgeCounters, durationMs]);

  return recentRef.current;
}
