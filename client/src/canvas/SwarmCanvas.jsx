// client/src/canvas/SwarmCanvas.jsx
// Main React Flow canvas for swarm visualization with drill-down filtering.
import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AgentNode from './nodes/AgentNode';
import DepartmentNode from './nodes/DepartmentNode';
import TriggerNode from './nodes/TriggerNode';
import HandoffEdge from './edges/HandoffEdge';
import AgentInspector from './AgentInspector';
import BreadcrumbBar from './BreadcrumbBar';
import { useSwarmStore } from '../store/SwarmContext';

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
  const focusedDepartmentId = useSwarmStore((s) => s.focusedDepartmentId);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);

  // Initial nodes/edges from workflowDef (or empty)
  const initialNodes = workflowDef?.nodes ?? [];
  const initialEdges = workflowDef?.edges ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // React to workflowDef changes: when scaffold generates a new workflow or workflowDef is updated,
  // update the canvas nodes and edges immediately
  useEffect(() => {
    if (workflowDef) {
      setNodes(workflowDef.nodes ?? []);
      setEdges(workflowDef.edges ?? []);
    }
  }, [workflowDef, setNodes, setEdges]);

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
    (params) => setEdges((eds) => addEdge({ ...params, type: 'handoff' }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (event, node) => setSelectedNode(node.id),
    [setSelectedNode]
  );

  const onPaneClick = useCallback(
    () => setSelectedNode(null),
    [setSelectedNode]
  );

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
        <AgentInspector nodes={nodes} />
      </div>
    </div>
  );
}
