// client/src/canvas/SwarmCanvas.jsx
// Main React Flow canvas for swarm visualization with drill-down filtering.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import ConditionalNode from './nodes/ConditionalNode';
import MergeNode from './nodes/MergeNode';
import DelayNode from './nodes/DelayNode';
import LoopNode from './nodes/LoopNode';
import ErrorHandlerNode from './nodes/ErrorHandlerNode';
import SubWorkflowNode from './nodes/SubWorkflowNode';
import HandoffEdge from './edges/HandoffEdge';
import AgentInspector from './AgentInspector';
import BreadcrumbBar from './BreadcrumbBar';
import InterAgentFeed from './InterAgentFeed';
import ChatPanel from './ChatPanel';
import ContextMenu from './ContextMenu';
import NodePalette from './NodePalette';
import { useSwarmStore } from '../store/SwarmContext';
import { useCanvasHistory } from '../hooks/useCanvasHistory';
import { generateNodeId } from '../utils/nodeIdGenerator';

// Register custom node and edge types — defined OUTSIDE component to prevent re-registration
const nodeTypes = {
  agent: AgentNode,
  department: DepartmentNode,
  trigger: TriggerNode,
  conditional: ConditionalNode,
  merge: MergeNode,
  delay: DelayNode,
  loop: LoopNode,
  errorHandler: ErrorHandlerNode,
  subWorkflow: SubWorkflowNode,
};

const edgeTypes = {
  handoff: HandoffEdge,
};

export default function SwarmCanvas({ workflowDef, markDirty, onCanvasChange }) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const focusedDepartmentId = useSwarmStore((s) => s.focusedDepartmentId);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const sidePanelMode = useSwarmStore((s) => s.sidePanelMode);
  const setSidePanelMode = useSwarmStore((s) => s.setSidePanelMode);
  // Side panels visible during execution and after completion (so user can read chat history)
  const chatMessages = useSwarmStore((s) => s.chatMessages);
  const showSidePanels = executionStatus === 'running' || executionStatus === 'paused'
    || executionStatus === 'completed' || executionStatus === 'stopped'
    || chatMessages.length > 0;

  // Initial nodes/edges from workflowDef (or empty)
  const initialNodes = workflowDef?.nodes ?? [];
  const initialEdges = workflowDef?.edges ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Undo/redo history — canvas state only, never touches execution/Zustand (DEC-011)
  const { pushHistory, undo, redo, canUndo, canRedo } = useCanvasHistory();

  // Debounce timer ref for node data edits (FR-V5-18 — batch rapid edits into one history entry)
  const updateNodeDebounceRef = useRef(null);

  // Context menu state (FR-V5-21 through FR-V5-24)
  const [contextMenu, setContextMenu] = useState(null);
  // Clipboard for copy/paste
  const clipboardRef = useRef(null);

  // Capture pre-drag state so onNodeDragStop records the correct pre-move snapshot
  const preDragSnapshotRef = useRef(null);

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

  // Report canvas state changes to parent for save (FR-V5-01)
  const canvasChangeRef = useRef(onCanvasChange);
  canvasChangeRef.current = onCanvasChange;
  const markDirtyRef = useRef(markDirty);
  markDirtyRef.current = markDirty;

  useEffect(() => {
    if (canvasChangeRef.current) {
      canvasChangeRef.current(nodes, edges);
    }
  }, [nodes, edges]);

  // Wraps onNodesChange to also mark dirty
  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Mark dirty for meaningful changes (position, add, remove, replace)
      const meaningful = changes.some((c) => c.type !== 'select' && c.type !== 'dimensions');
      if (meaningful && markDirtyRef.current) markDirtyRef.current();
    },
    [onNodesChange]
  );

  // Wraps onEdgesChange to also mark dirty
  const handleEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      const meaningful = changes.some((c) => c.type !== 'select');
      if (meaningful && markDirtyRef.current) markDirtyRef.current();
    },
    [onEdgesChange]
  );

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
      if (markDirtyRef.current) markDirtyRef.current();
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

  // FR-V5-18: capture pre-drag snapshot at drag start, push it at drag stop
  const onNodeDragStart = useCallback(
    () => {
      preDragSnapshotRef.current = { nodes, edges };
    },
    [nodes, edges]
  );

  const onNodeDragStop = useCallback(
    () => {
      if (preDragSnapshotRef.current) {
        pushHistory(preDragSnapshotRef.current.nodes, preDragSnapshotRef.current.edges);
        preDragSnapshotRef.current = null;
      }
    },
    [pushHistory]
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

  // ---- Drag-and-drop from NodePalette (FR-V5-25 through FR-V5-29) ----
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow-type');
      if (!type) return;
      const subType = event.dataTransfer.getData('application/reactflow-subtype');
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = generateNodeId(type);

      let data;
      if (type === 'agent') {
        data = { label: 'New Agent', systemPrompt: '', model: '', tools: [], isTriageNode: false, maxTurns: 0 };
      } else if (type === 'department') {
        data = { label: 'New Department' };
      } else if (type === 'trigger') {
        if (subType === 'rss') {
          data = { label: 'RSS Trigger', triggerType: 'rss', feedUrl: '', pollIntervalSeconds: 300 };
        } else {
          data = { label: 'Webhook Trigger', triggerType: 'webhook', webhookPath: '' };
        }
      } else if (type === 'conditional') {
        data = { label: 'Conditional', rules: [], defaultTargetNodeId: '' };
      } else if (type === 'merge') {
        data = { label: 'Merge', waitFor: 'all' };
      } else if (type === 'delay') {
        data = { label: 'Delay', delaySeconds: 30 };
      } else if (type === 'loop') {
        data = { label: 'Loop', maxIterations: 10, exitCondition: '', exitTargetNodeId: '' };
      } else if (type === 'errorHandler') {
        data = { label: 'Error Handler', watchedNodes: [] };
      } else if (type === 'subWorkflow') {
        data = { label: 'Sub-Workflow', workflowId: '' };
      } else {
        data = { label: `New ${type}` };
      }

      const newNode = { id, type, position, data };
      pushHistory(nodes, edges);
      setNodes((nds) => [...nds, newNode]);
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [screenToFlowPosition, pushHistory, nodes, edges, setNodes]
  );

  // ---- Context menu handlers (FR-V5-21 through FR-V5-24) ----
  const handlePaneContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'canvas', screenX: event.clientX, screenY: event.clientY });
    },
    []
  );

  const handleNodeContextMenu = useCallback(
    (event, node) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'node', nodeId: node.id });
    },
    []
  );

  const handleEdgeContextMenu = useCallback(
    (event, edge) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, type: 'edge', edgeId: edge.id });
    },
    []
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Context menu action: add a new agent node at click position
  const addNodeAtPosition = useCallback(
    (type, screenX, screenY) => {
      const position = screenToFlowPosition({ x: screenX, y: screenY });
      const id = `${type}-${Date.now()}`;
      const newNode = {
        id,
        type,
        position,
        data: { label: type === 'agent' ? 'New Agent' : type === 'department' ? 'New Department' : 'New Trigger' },
      };
      pushHistory(nodes, edges);
      setNodes((nds) => [...nds, newNode]);
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [screenToFlowPosition, pushHistory, nodes, edges, setNodes]
  );

  // Context menu action: duplicate a node
  const duplicateNode = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const newId = `${node.type}-${Date.now()}`;
      const duplicated = {
        ...node,
        id: newId,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        data: { ...node.data },
        selected: false,
      };
      pushHistory(nodes, edges);
      setNodes((nds) => [...nds, duplicated]);
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [nodes, edges, pushHistory, setNodes]
  );

  // Context menu action: delete a node
  const deleteNode = useCallback(
    (nodeId) => {
      pushHistory(nodes, edges);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId && n.parentId !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [nodes, edges, pushHistory, setNodes, setEdges]
  );

  // Context menu action: delete an edge
  const deleteEdge = useCallback(
    (edgeId) => {
      pushHistory(nodes, edges);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [nodes, edges, pushHistory, setEdges]
  );

  // Context menu action: copy node to clipboard
  const copyNode = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) clipboardRef.current = structuredClone(node);
    },
    [nodes]
  );

  // Context menu action: paste from clipboard
  const pasteNode = useCallback(
    (screenX, screenY) => {
      if (!clipboardRef.current) return;
      const position = screenToFlowPosition({ x: screenX, y: screenY });
      const newId = `${clipboardRef.current.type}-${Date.now()}`;
      const pasted = {
        ...clipboardRef.current,
        id: newId,
        position,
        selected: false,
      };
      pushHistory(nodes, edges);
      setNodes((nds) => [...nds, pasted]);
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [screenToFlowPosition, nodes, edges, pushHistory, setNodes]
  );

  // Build context menu actions based on type
  const contextMenuActions = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.type === 'canvas') {
      return [
        { label: 'Add Agent Node', icon: '\uD83E\uDD16', onClick: () => addNodeAtPosition('agent', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Add Department', icon: '\uD83C\uDFE2', onClick: () => addNodeAtPosition('department', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Add Trigger', icon: '\u26A1', onClick: () => addNodeAtPosition('trigger', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Select All', icon: '\u2610', onClick: () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))) },
        { label: 'Paste', icon: '\uD83D\uDCCB', onClick: () => pasteNode(contextMenu.x, contextMenu.y), disabled: !clipboardRef.current },
      ];
    }
    if (contextMenu.type === 'node') {
      return [
        { label: 'Edit', icon: '\u270F\uFE0F', onClick: () => setSelectedNode(contextMenu.nodeId) },
        { label: 'Duplicate', icon: '\uD83D\uDCC4', onClick: () => duplicateNode(contextMenu.nodeId) },
        { label: 'Copy', icon: '\uD83D\uDCCB', onClick: () => copyNode(contextMenu.nodeId) },
        { label: 'Delete', icon: '\uD83D\uDDD1\uFE0F', onClick: () => deleteNode(contextMenu.nodeId) },
      ];
    }
    if (contextMenu.type === 'edge') {
      return [
        { label: 'Delete', icon: '\uD83D\uDDD1\uFE0F', onClick: () => deleteEdge(contextMenu.edgeId) },
      ];
    }
    return [];
  }, [contextMenu, addNodeAtPosition, pasteNode, setSelectedNode, duplicateNode, copyNode, deleteNode, deleteEdge, setNodes]);

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
      if (markDirtyRef.current) markDirtyRef.current();
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
        <NodePalette />
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
          deleteKeyCode={['Delete', 'Backspace']}
          snapToGrid
          snapGrid={[20, 20]}
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
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={contextMenuActions}
            onClose={closeContextMenu}
          />
        )}
        {showSidePanels && (
          <div className="flex flex-col h-full shrink-0">
            <div className="flex bg-gray-900 border-l border-b border-gray-700">
              <button
                onClick={() => setSidePanelMode('feed')}
                className={`flex-1 text-[10px] py-1.5 transition-colors ${
                  sidePanelMode === 'feed'
                    ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Feed
              </button>
              <button
                onClick={() => setSidePanelMode('chat')}
                className={`flex-1 text-[10px] py-1.5 transition-colors ${
                  sidePanelMode === 'chat'
                    ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Chat
              </button>
            </div>
            {sidePanelMode === 'feed' ? <InterAgentFeed /> : <ChatPanel />}
          </div>
        )}
        <AgentInspector nodes={nodes} onUpdateNode={handleUpdateNode} />
      </div>
    </div>
  );
}
