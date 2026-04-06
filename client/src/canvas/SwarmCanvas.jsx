// client/src/canvas/SwarmCanvas.jsx
// Main React Flow canvas for swarm visualization with drill-down filtering.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AgentNode from './nodes/AgentNode';
import DepartmentNode from './nodes/DepartmentNode';
import TriggerNode from './nodes/TriggerNode';
import HandoffEdge from './edges/HandoffEdge';
import AgentInspector from './AgentInspector';
import BreadcrumbBar from './BreadcrumbBar';
import InterAgentFeed from './InterAgentFeed';
import { useSwarmStore } from '../store/SwarmContext';
import { useCanvasHistory } from '../hooks/useCanvasHistory';

// Register custom node and edge types — defined OUTSIDE component to prevent re-registration
const nodeTypes = {
  agent: AgentNode,
  department: DepartmentNode,
  trigger: TriggerNode,
};

const edgeTypes = {
  handoff: HandoffEdge,
};

export default function SwarmCanvas({ workflowDef }) {
  const { fitView } = useReactFlow();
  const focusedDepartmentId = useSwarmStore((s) => s.focusedDepartmentId);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  // Side panels only visible during active or paused execution (not idle/stopped)
  const showSidePanels = executionStatus === 'running' || executionStatus === 'paused';

  // Initial nodes/edges from workflowDef (or empty)
  const initialNodes = workflowDef?.nodes ?? [];
  const initialEdges = workflowDef?.edges ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Undo/redo history — canvas state only, never touches execution/Zustand (DEC-011)
  const { pushHistory, undo, redo, canUndo, canRedo } = useCanvasHistory();

  // Debounce timer ref for node data edits (FR-V5-18 — batch rapid edits into one history entry)
  const updateNodeDebounceRef = useRef(null);

  // React to workflowDef changes: when scaffold generates a new workflow or workflowDef is updated,
  // update the canvas nodes and edges immediately
  useEffect(() => {
    if (workflowDef) {
      setNodes(workflowDef.nodes ?? []);
      setEdges(workflowDef.edges ?? []);
      // Give React Flow a tick to measure nodes before calling fitView
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    }
  }, [workflowDef, setNodes, setEdges, fitView]);

  // Drill-down filtering: when focusedDepartmentId is set, show only nodes
  // that are children of that department (parentId === focusedDepartmentId) + the dept itself
  const visibleNodes = useMemo(() => {
    if (!focusedDepartmentId) return nodes;
    return nodes.filter(
      (n) => n.id === focusedDepartmentId || n.parentId === focusedDepartmentId
    );
  }, [nodes, focusedDepartmentId]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [edges, visibleNodeIds]
  );

  const onConnect = useCallback(
    (params) => {
      pushHistory(nodes, edges);
      setEdges((eds) => addEdge({ ...params, type: 'handoff' }, eds));
    },
    [setEdges, pushHistory, nodes, edges]
  );

  const onNodeClick = useCallback(
    (event, node) => setSelectedNode(node.id),
    [setSelectedNode]
  );

  const onPaneClick = useCallback(
    () => setSelectedNode(null),
    [setSelectedNode]
  );

  // FR-V5-18: record history on node drag end (position change), NOT during drag
  const onNodeDragStop = useCallback(
    () => {
      pushHistory(nodes, edges);
    },
    [pushHistory, nodes, edges]
  );

  // FR-V5-11/13: record history + cascade-delete department children
  const onNodesDelete = useCallback(
    (deletedNodes) => {
      pushHistory(nodes, edges);
      // When a department node is deleted, also remove its child nodes
      const deletedIds = new Set(deletedNodes.map((n) => n.id));
      const childIds = nodes
        .filter((n) => n.parentId && deletedIds.has(n.parentId))
        .map((n) => n.id);
      if (childIds.length > 0) {
        const allRemoved = new Set([...deletedIds, ...childIds]);
        setNodes((nds) => nds.filter((n) => !allRemoved.has(n.id)));
        setEdges((eds) =>
          eds.filter((e) => !allRemoved.has(e.source) && !allRemoved.has(e.target))
        );
      }
    },
    [pushHistory, nodes, edges, setNodes, setEdges]
  );

  const onEdgesDelete = useCallback(
    () => {
      pushHistory(nodes, edges);
    },
    [pushHistory, nodes, edges]
  );

  const handleUpdateNode = useCallback(
    (nodeId, patch) => {
      // FR-V5-18: debounce rapid data edits — batch into one history entry (500ms)
      if (updateNodeDebounceRef.current) {
        clearTimeout(updateNodeDebounceRef.current);
      } else {
        // First edit in this burst — capture state BEFORE the edit
        updateNodeDebounceRef.current = 'pending';
        // We snapshot immediately before the first edit
        pushHistory(nodes, edges);
      }
      updateNodeDebounceRef.current = setTimeout(() => {
        updateNodeDebounceRef.current = null;
      }, 500);

      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [setNodes, pushHistory, nodes, edges]
  );

  // FR-V5-17: Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept when typing in inputs/textareas
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement?.isContentEditable) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo(nodes, edges, setNodes, setEdges);
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo(nodes, edges, setNodes, setEdges);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, setNodes, setEdges, undo, redo]);

  return (
    <div className="flex flex-col w-full h-full">
      <BreadcrumbBar nodes={nodes} />
      <div className="flex flex-1 overflow-hidden">
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Delete', 'Backspace']}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          className="flex-1"
        >
          <Background />
          <Controls
            style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
            showInteractive={false}
          />
          <MiniMap
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: '6px' }}
            maskColor="rgba(0,0,0,0.4)"
            nodeColor="#6366f1"
          />
        </ReactFlow>
        {showSidePanels && <InterAgentFeed />}
        <AgentInspector nodes={nodes} onUpdateNode={handleUpdateNode} />
      </div>
    </div>
  );
}
