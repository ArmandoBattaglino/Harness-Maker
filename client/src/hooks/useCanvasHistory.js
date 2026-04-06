// useCanvasHistory.js — Undo/Redo history stack for SwarmCanvas nodes & edges.
// FR-V5-16 through FR-V5-20: canvas-only history (does NOT affect Zustand execution state — DEC-011).
import { useRef, useState, useCallback } from 'react';

const MAX_HISTORY = 50;

/**
 * Deep-clone nodes/edges to avoid React Flow mutation side-effects.
 * structuredClone is available in all modern browsers and Node 17+.
 */
function cloneState(nodes, edges) {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
  };
}

/**
 * Custom hook providing undo/redo for React Flow canvas state.
 *
 * Usage:
 *   const { pushHistory, undo, redo, canUndo, canRedo } = useCanvasHistory();
 *
 * - pushHistory(nodes, edges) — snapshot current canvas state (call AFTER the change)
 * - undo(currentNodes, currentEdges, setNodes, setEdges) — revert to previous snapshot
 * - redo(currentNodes, currentEdges, setNodes, setEdges) — re-apply undone snapshot
 * - canUndo / canRedo — booleans for toolbar button state
 *
 * Stacks are stored in refs to avoid re-renders on every push.
 * A version counter (useState) is bumped only when canUndo/canRedo *changes*,
 * keeping re-renders minimal.
 */
export function useCanvasHistory() {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // version counter — bumped when stack emptiness changes so canUndo/canRedo re-evaluate
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  /**
   * Push a snapshot onto the undo stack. Clears the redo stack.
   * Call this AFTER the canvas mutation with the NEW nodes/edges.
   * The snapshot stored is the state BEFORE the mutation (passed as prevNodes/prevEdges).
   */
  const pushHistory = useCallback(
    (prevNodes, prevEdges) => {
      const snapshot = cloneState(prevNodes, prevEdges);
      const stack = undoStackRef.current;
      stack.push(snapshot);
      // Cap at MAX_HISTORY — drop oldest
      if (stack.length > MAX_HISTORY) {
        stack.shift();
      }
      // Any new action invalidates the redo stack
      redoStackRef.current = [];
      bump();
    },
    [bump]
  );

  /**
   * Undo: pop the last snapshot from undo stack, push current state to redo, apply snapshot.
   */
  const undo = useCallback(
    (currentNodes, currentEdges, setNodes, setEdges) => {
      const stack = undoStackRef.current;
      if (stack.length === 0) return;

      const snapshot = stack.pop();
      // Save current state to redo stack
      redoStackRef.current.push(cloneState(currentNodes, currentEdges));

      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      bump();
    },
    [bump]
  );

  /**
   * Redo: pop from redo stack, push current state to undo, apply snapshot.
   */
  const redo = useCallback(
    (currentNodes, currentEdges, setNodes, setEdges) => {
      const redoStack = redoStackRef.current;
      if (redoStack.length === 0) return;

      const snapshot = redoStack.pop();
      // Save current state to undo stack
      undoStackRef.current.push(cloneState(currentNodes, currentEdges));

      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      bump();
    },
    [bump]
  );

  return {
    pushHistory,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}
