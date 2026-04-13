// client/src/canvas/SwarmCanvas.jsx
// Main React Flow canvas for swarm visualization with drill-down filtering.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionLineType,
  ConnectionMode,
  MarkerType,
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
import InputNode from './nodes/InputNode';
import OutputExtractorNode from './nodes/OutputExtractorNode';
import HandoffEdge from './edges/HandoffEdge';
import FloatingConnectionLine from './edges/FloatingConnectionLine';
import AgentInspector from './AgentInspector';
// AgentOutputPanel moved inline to NodeOutputCard (floating card on agent node)
import BreadcrumbBar from './BreadcrumbBar';
import InterAgentFeed from './InterAgentFeed';
import ChatPanel from './ChatPanel';
import ContextMenu from './ContextMenu';
import CanvasActionsContext from './CanvasActionsContext';
import NodePalette from './NodePalette';
import { applyExpandedOutputLayering } from './outputLayering';
import { useSwarmStore } from '../store/SwarmContext';
import { useCanvasHistory } from '../hooks/useCanvasHistory';
import { generateNodeId } from '../utils/nodeIdGenerator';
import {
  buildDefaultInputNodeData,
  buildDefaultOutputExtractorNodeData,
  CANONICAL_VISUAL_INPUT_NODE_TYPE,
  isVisualInputNode,
  isVisualInputNodeType,
  normalizeVisualInputNodeType,
  normalizeVisualWorkflowNode,
} from '../utils/visualIoContracts';

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
  [CANONICAL_VISUAL_INPUT_NODE_TYPE]: InputNode,
  outputExtractor: OutputExtractorNode,
};

const edgeTypes = {
  handoff: HandoffEdge,
};

const defaultEdgeOptions = {
  type: 'handoff',
  markerEnd: {
    type: MarkerType.Arrow,
    width: 14,
    height: 14,
    color: '#64748b',
  },
};

const GRID_SIZE = 20;
const DROP_PREVIEW_ID = '__palette-drop-preview__';
const DROP_PREVIEW_CLEAR_MS = 120;
const DEFAULT_NODE_DIMENSIONS = {
  agent: { width: 190, height: 180 },
  trigger: { width: 170, height: 88 },
  conditional: { width: 140, height: 140 },
  merge: { width: 150, height: 90 },
  delay: { width: 160, height: 84 },
  loop: { width: 180, height: 92 },
  errorHandler: { width: 180, height: 84 },
  subWorkflow: { width: 180, height: 88 },
  [CANONICAL_VISUAL_INPUT_NODE_TYPE]: { width: 190, height: 116 },
  outputExtractor: { width: 200, height: 110 },
  department: { width: 280, height: 180 },
};
function snapGridValue(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPosition(position) {
  return {
    x: snapGridValue(position.x),
    y: snapGridValue(position.y),
  };
}

function buildNodeData(type, subType = '') {
  if (type === 'agent') {
    return { label: 'New Agent', systemPrompt: '', model: '', tools: [], isTriageNode: false, maxTurns: 0 };
  }

  if (isVisualInputNodeType(type)) {
    return {
      label: 'Input Block',
      fields: [
        {
          key: 'brief',
          label: 'Brief',
          type: 'textarea',
          required: true,
          helpText: 'Describe what this workflow should do.',
          defaultValue: '',
          options: [],
        },
      ],
    };
  }

  if (type === 'outputExtractor') {
    return {
      label: 'Output Extractor',
      artifactKey: 'report',
      artifactName: 'Report',
      format: 'markdown',
      extractionInstruction: 'Extract the final deliverable from the upstream agent output.',
    };
  }

  if (type === 'department') {
    return { label: 'New Department' };
  }

  if (type === 'trigger') {
    if (subType === 'rss') {
      return { label: 'RSS Trigger', triggerType: 'rss', feedUrl: '', pollIntervalSeconds: 300 };
    }

    return { label: 'Webhook Trigger', triggerType: 'webhook', webhookPath: '' };
  }

  if (type === 'conditional') {
    return { label: 'Conditional', rules: [], defaultTargetNodeId: '' };
  }

  if (type === 'merge') {
    return { label: 'Merge', waitFor: 'all' };
  }

  if (type === 'delay') {
    return { label: 'Delay', delaySeconds: 30 };
  }

  if (type === 'loop') {
    return { label: 'Loop', maxIterations: 10, exitCondition: '', exitTargetNodeId: '' };
  }

  if (type === 'errorHandler') {
    return { label: 'Error Handler', watchedNodes: [] };
  }

  if (type === 'subWorkflow') {
    return { label: 'Sub-Workflow', workflowId: '' };
  }

  if (isVisualInputNodeType(type)) {
    return buildDefaultInputNodeData();
  }

  if (type === 'outputExtractor') {
    return buildDefaultOutputExtractorNodeData();
  }

  return { label: `New ${type}` };
}

function buildCanvasNode({ id, type, position, subType = '', isDropPreview = false }) {
  const normalizedType = normalizeVisualInputNodeType(type);
  const node = {
    id,
    type: normalizedType,
    position: snapPosition(position),
    data: buildNodeData(normalizedType, subType),
  };

  if (!isDropPreview) {
    return node;
  }

  return {
    ...node,
    selectable: false,
    draggable: false,
    connectable: false,
    focusable: false,
    deletable: false,
    style: {
      pointerEvents: 'none',
      opacity: 0.78,
    },
    data: {
      ...node.data,
      isDropPreview: true,
    },
  };
}

function getNodeDimensions(node) {
  const fallback = DEFAULT_NODE_DIMENSIONS[node?.type] ?? { width: 180, height: 90 };
  return {
    width: node?.measured?.width ?? node?.width ?? fallback.width,
    height: node?.measured?.height ?? node?.height ?? fallback.height,
  };
}

function getNodeRect(node, padding = 0) {
  const { width, height } = getNodeDimensions(node);
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
    width,
    height,
    centerX: node.position.x + width / 2,
    centerY: node.position.y + height / 2,
  };
}

function isForwardLayoutEdge(sourceNode, targetNode) {
  if (!sourceNode || !targetNode) {
    return true;
  }

  const sourceRect = getNodeRect(sourceNode);
  const targetRect = getNodeRect(targetNode);
  const deltaX = targetRect.centerX - sourceRect.centerX;
  const deltaY = targetRect.centerY - sourceRect.centerY;

  if (deltaY >= 56) {
    return true;
  }

  if (deltaX >= 56) {
    return true;
  }

  return deltaX >= 0 && deltaY >= 0;
}

function buildEdgeLayoutData(edges, nodes) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const layoutMap = new Map();
  const outgoingBySource = new Map();
  const incomingByTarget = new Map();

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;

    if (!outgoingBySource.has(edge.source)) outgoingBySource.set(edge.source, []);
    outgoingBySource.get(edge.source).push(edge);

    if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, []);
    incomingByTarget.get(edge.target).push(edge);
  }

  for (const [sourceId, group] of outgoingBySource.entries()) {
    const sourceNode = nodeMap.get(sourceId);
    group.sort((a, b) =>
      (nodeMap.get(a.target)?.position?.x ?? 0) - (nodeMap.get(b.target)?.position?.x ?? 0)
      || a.id.localeCompare(b.id)
    );

    group.forEach((edge, index) => {
      const current = layoutMap.get(edge.id) ?? {};
      layoutMap.set(edge.id, {
        ...current,
        sourceSlotIndex: index,
        sourceSlotCount: group.length,
        sourceLaneIndex: index,
        sourceLaneCount: group.length,
        sourceNodeWidth: getNodeDimensions(sourceNode).width,
      });
    });
  }

  for (const [targetId, group] of incomingByTarget.entries()) {
    const targetNode = nodeMap.get(targetId);
    group.sort((a, b) =>
      (nodeMap.get(a.source)?.position?.x ?? 0) - (nodeMap.get(b.source)?.position?.x ?? 0)
      || a.id.localeCompare(b.id)
    );

    group.forEach((edge, index) => {
      const current = layoutMap.get(edge.id) ?? {};
      layoutMap.set(edge.id, {
        ...current,
        targetSlotIndex: index,
        targetSlotCount: group.length,
        targetLaneIndex: index,
        targetLaneCount: group.length,
        targetNodeWidth: getNodeDimensions(targetNode).width,
      });
    });
  }

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const isForwardEdge = isForwardLayoutEdge(sourceNode, targetNode);
    const sourceOutCount = outgoingBySource.get(edge.source)?.length ?? 1;
    const targetInCount = incomingByTarget.get(edge.target)?.length ?? 1;
    const sourceRect = getNodeRect(sourceNode);
    const targetRect = getNodeRect(targetNode);
    const horizontalDistance = Math.abs(targetRect.centerX - sourceRect.centerX);
    const verticalDistance = Math.abs(targetRect.centerY - sourceRect.centerY);
    const isBundledForwardEdge = isForwardEdge && (
      sourceOutCount > 1
      || targetInCount > 1
      || (horizontalDistance > 180 && verticalDistance > 80)
    );
    const edgeRole = isForwardEdge
      ? (isBundledForwardEdge ? 'primary' : 'direct')
      : 'feedback';
    const corridorLift = Math.min(
      36,
      isBundledForwardEdge
        && Math.max(sourceOutCount, targetInCount) > 1
        ? (Math.max(sourceOutCount, targetInCount) - 1) * 10
        : horizontalDistance > 260
          ? 8
          : 0
    );

    const current = layoutMap.get(edge.id) ?? {};
    layoutMap.set(edge.id, {
      ...current,
      edgeRole,
      isForwardEdge,
      preferCorridorRouting: isBundledForwardEdge,
      corridorLift,
    });
  }

  return layoutMap;
}

function averageOrder(ids, orderMap, fallback) {
  if (!ids?.length) {
    return fallback;
  }

  const orders = ids
    .map((id) => orderMap.get(id))
    .filter((value) => Number.isFinite(value));

  if (!orders.length) {
    return fallback;
  }

  return orders.reduce((total, value) => total + value, 0) / orders.length;
}

function medianValue(values, fallback = 0) {
  if (!values?.length) {
    return fallback;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function tidyWorkflowLayout(nodes, edges) {
  const layoutableNodes = nodes.filter((node) => !node.parentId && node.type !== 'department');
  if (layoutableNodes.length <= 1) {
    return nodes;
  }

  const nodeIds = new Set(layoutableNodes.map((node) => node.id));
  const incoming = new Map(layoutableNodes.map((node) => [node.id, []]));
  const outgoing = new Map(layoutableNodes.map((node) => [node.id, []]));
  const forwardIncoming = new Map(layoutableNodes.map((node) => [node.id, []]));
  const forwardOutgoing = new Map(layoutableNodes.map((node) => [node.id, []]));
  const ranks = new Map(layoutableNodes.map((node) => [node.id, 0]));
  const nodeMap = new Map(layoutableNodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    outgoing.get(edge.source).push(edge.target);
    incoming.get(edge.target).push(edge.source);

    if (isForwardLayoutEdge(nodeMap.get(edge.source), nodeMap.get(edge.target))) {
      forwardOutgoing.get(edge.source).push(edge.target);
      forwardIncoming.get(edge.target).push(edge.source);
    }
  }

  const roots = layoutableNodes
    .filter((node) => (forwardIncoming.get(node.id)?.length ?? 0) === 0)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  const queue = roots.map((node) => node.id);
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const currentRank = ranks.get(currentId) ?? 0;
    for (const targetId of forwardOutgoing.get(currentId) ?? []) {
      const nextRank = Math.max(ranks.get(targetId) ?? 0, currentRank + 1);
      if (nextRank !== (ranks.get(targetId) ?? 0)) {
        ranks.set(targetId, nextRank);
      }
      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push(targetId);
      }
    }
  }

  const unresolvedNodes = layoutableNodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  unresolvedNodes.forEach((node, index) => {
    ranks.set(node.id, roots.length + index);
  });

  const columns = new Map();
  for (const node of layoutableNodes) {
    const rank = ranks.get(node.id) ?? 0;
    if (!columns.has(rank)) columns.set(rank, []);
    columns.get(rank).push(node);
  }

  for (const columnNodes of columns.values()) {
    columnNodes.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  }

  const orderedRanks = [...columns.keys()].sort((a, b) => a - b);
  const getOrderMap = () => {
    const orderMap = new Map();
    orderedRanks.forEach((rank) => {
      columns.get(rank)?.forEach((node, index) => {
        orderMap.set(node.id, index);
      });
    });
    return orderMap;
  };

  for (let iteration = 0; iteration < 3; iteration += 1) {
    let orderMap = getOrderMap();

    orderedRanks.slice(1).forEach((rank) => {
      columns.get(rank)?.sort((a, b) =>
        averageOrder(incoming.get(a.id), orderMap, a.position.y) - averageOrder(incoming.get(b.id), orderMap, b.position.y)
        || a.position.y - b.position.y
        || a.id.localeCompare(b.id)
      );
    });

    orderMap = getOrderMap();

    [...orderedRanks].reverse().slice(1).forEach((rank) => {
      columns.get(rank)?.sort((a, b) =>
        averageOrder(outgoing.get(a.id), orderMap, a.position.y) - averageOrder(outgoing.get(b.id), orderMap, b.position.y)
        || a.position.y - b.position.y
        || a.id.localeCompare(b.id)
      );
    });
  }

  const minX = Math.min(...layoutableNodes.map((node) => node.position.x));
  const minY = Math.min(...layoutableNodes.map((node) => node.position.y));
  const maxWidth = Math.max(...layoutableNodes.map((node) => getNodeDimensions(node).width));
  const maxHeight = Math.max(...layoutableNodes.map((node) => getNodeDimensions(node).height));
  const horizontalGap = Math.max(260, maxWidth + 90);
  const verticalGap = Math.max(220, maxHeight + 70);
  const nextPositions = new Map();
  const globalCenterY = medianValue(
    layoutableNodes.map((node) => node.position.y),
    minY
  );

  [...columns.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([rank, columnNodes]) => {
      const columnHeight = Math.max(0, (columnNodes.length - 1) * verticalGap);
      const anchorY = columnNodes.length === 1
        ? globalCenterY
        : medianValue(columnNodes.map((node) => node.position.y), minY);
      const baseY = anchorY - columnHeight / 2;
      columnNodes.forEach((node, index) => {
        nextPositions.set(node.id, {
          x: snapGridValue(minX + rank * horizontalGap),
          y: snapGridValue(baseY + index * verticalGap),
        });
      });
    });

  const MIN_NODE_GAP = 40;
  for (const [, columnNodes] of columns.entries()) {
    const sorted = [...columnNodes].sort(
      (a, b) => (nextPositions.get(a.id)?.y ?? 0) - (nextPositions.get(b.id)?.y ?? 0)
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const prevPos = nextPositions.get(sorted[i - 1].id);
      const currPos = nextPositions.get(sorted[i].id);
      if (!prevPos || !currPos) continue;
      const prevHeight = getNodeDimensions(sorted[i - 1]).height;
      const minY = prevPos.y + prevHeight + MIN_NODE_GAP;
      if (currPos.y < minY) {
        currPos.y = snapGridValue(minY);
      }
    }
  }

  return nodes.map((node) => {
    const nextPosition = nextPositions.get(node.id);
    if (!nextPosition) return node;
    return {
      ...node,
      position: nextPosition,
    };
  });
}

export default function SwarmCanvas({
  workflowDef,
  markDirty,
  onCanvasChange,
  layoutNonce = 0,
  workflowProps,
}) {
  const focusConnections = true;
  const { fitView, screenToFlowPosition } = useReactFlow();
  const focusedDepartmentId = useSwarmStore((s) => s.focusedDepartmentId);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const sidePanelMode = useSwarmStore((s) => s.sidePanelMode);
  const setSidePanelMode = useSwarmStore((s) => s.setSidePanelMode);
  const sidePanelOpen = useSwarmStore((s) => s.sidePanelOpen);
  const setSidePanelOpen = useSwarmStore((s) => s.setSidePanelOpen);
  const selectedNodeId = useSwarmStore((s) => s.selectedNodeId);
  const expandedOutputNodeId = useSwarmStore((s) => s.expandedOutputNodeId);
  // Keep the activity rail available even before the first message so the
  // chat/feed empty states remain visible across idle, reload, and reset.
  const showSidePanels = sidePanelOpen;
  const showInspector = Boolean(selectedNodeId);

  // Initial nodes/edges from workflowDef (or empty)
  const initialNodes = workflowDef?.nodes ?? [];
  const normalizedInitialNodes = useMemo(
    () => initialNodes.map((node) => normalizeVisualWorkflowNode(node)),
    [initialNodes]
  );
  const initialEdges = workflowDef?.edges ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState(normalizedInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [dropPreviewNode, setDropPreviewNode] = useState(null);

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
  const dropPreviewTimeoutRef = useRef(null);
  // React to workflowDef changes: when scaffold generates a new workflow or workflowDef is updated,
  // update the canvas nodes and edges immediately
  useEffect(() => {
    if (workflowDef) {
      setDropPreviewNode(null);
      if (dropPreviewTimeoutRef.current) {
        clearTimeout(dropPreviewTimeoutRef.current);
        dropPreviewTimeoutRef.current = null;
      }
      setNodes((workflowDef.nodes ?? []).map((node) => normalizeVisualWorkflowNode(node)));
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

  const processedLayoutNonceRef = useRef(0);
  useEffect(() => {
    if (!layoutNonce || layoutNonce === processedLayoutNonceRef.current) return;
    processedLayoutNonceRef.current = layoutNonce;
    setDropPreviewNode(null);
    setNodes((currentNodes) => tidyWorkflowLayout(currentNodes, edges));
    if (markDirtyRef.current) markDirtyRef.current();
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [layoutNonce, edges, fitView, setNodes]);

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

  const renderedNodes = useMemo(() => {
    const layeredNodes = applyExpandedOutputLayering(visibleNodes, expandedOutputNodeId);

    if (!dropPreviewNode) {
      return layeredNodes;
    }

    return [...layeredNodes, dropPreviewNode];
  }, [visibleNodes, expandedOutputNodeId, dropPreviewNode]);

  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [edges, visibleNodeIds]
  );

  const renderedEdges = useMemo(() => {
    const layoutMap = buildEdgeLayoutData(visibleEdges, visibleNodes);
    return visibleEdges.map((edge) => ({
      ...edge,
      data: {
        ...(edge.data ?? {}),
        ...(layoutMap.get(edge.id) ?? {}),
        selected: selectedEdgeId === edge.id,
        selectionActive: Boolean(selectedEdgeId),
        nodeSelectionActive: Boolean(focusConnections && selectedNodeId),
        relatedToSelectedNode: Boolean(
          focusConnections
          && selectedNodeId
          && (edge.source === selectedNodeId || edge.target === selectedNodeId)
        ),
        hasFocusedSelection: Boolean(selectedEdgeId || (focusConnections && selectedNodeId)),
      },
    }));
  }, [visibleEdges, visibleNodes, selectedEdgeId, selectedNodeId, focusConnections]);

  const clearDropPreview = useCallback(() => {
    if (dropPreviewTimeoutRef.current) {
      clearTimeout(dropPreviewTimeoutRef.current);
      dropPreviewTimeoutRef.current = null;
    }

    setDropPreviewNode(null);
  }, []);

  const scheduleDropPreviewClear = useCallback(() => {
    if (dropPreviewTimeoutRef.current) {
      clearTimeout(dropPreviewTimeoutRef.current);
    }

    dropPreviewTimeoutRef.current = setTimeout(() => {
      dropPreviewTimeoutRef.current = null;
      setDropPreviewNode(null);
    }, DROP_PREVIEW_CLEAR_MS);
  }, []);

  const updateDropPreview = useCallback(
    (type, subType, clientX, clientY) => {
      if (type !== 'agent') {
        clearDropPreview();
        return;
      }

      const nextNode = buildCanvasNode({
        id: DROP_PREVIEW_ID,
        type,
        subType,
        position: screenToFlowPosition({ x: clientX, y: clientY }),
        isDropPreview: true,
      });

      setDropPreviewNode((current) => {
        if (
          current
          && current.type === nextNode.type
          && current.position.x === nextNode.position.x
          && current.position.y === nextNode.position.y
        ) {
          return current;
        }

        return nextNode;
      });
      scheduleDropPreviewClear();
    },
    [clearDropPreview, scheduleDropPreviewClear, screenToFlowPosition]
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
    (event, node) => {
      setSelectedEdgeId(null);
      useSwarmStore.setState({ expandedOutputNodeId: null, expandedValidationNodeId: null });
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(
    () => {
      clearDropPreview();
      setSelectedEdgeId(null);
      setSelectedNode(null);
      useSwarmStore.setState({ expandedOutputNodeId: null, expandedValidationNodeId: null });
    },
    [clearDropPreview, setSelectedNode]
  );

  const onEdgeClick = useCallback(
    (event, edge) => {
      event?.stopPropagation?.();
      useSwarmStore.setState({ expandedOutputNodeId: null, expandedValidationNodeId: null });
      setSelectedNode(null);
      setSelectedEdgeId(edge.id);
    },
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
    const type = event.dataTransfer.getData('application/reactflow-type');
    if (!type) {
      clearDropPreview();
      return;
    }

    const subType = event.dataTransfer.getData('application/reactflow-subtype');
    updateDropPreview(type, subType, event.clientX, event.clientY);
  }, [clearDropPreview, updateDropPreview]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow-type');
      clearDropPreview();
      if (!type) return;
      const subType = event.dataTransfer.getData('application/reactflow-subtype');
      const newNode = buildCanvasNode({
        id: generateNodeId(type),
        type,
        subType,
        position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      });
      pushHistory(nodes, edges);
      setNodes((nds) => [...nds, newNode]);
      if (markDirtyRef.current) markDirtyRef.current();
    },
    [clearDropPreview, screenToFlowPosition, pushHistory, nodes, edges, setNodes]
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
      const newNode = buildCanvasNode({
        id: generateNodeId(type),
        type,
        position: screenToFlowPosition({ x: screenX, y: screenY }),
      });
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

  const setExpandedOutputNodeId = useSwarmStore((s) => s.setExpandedOutputNodeId);
  const setExpandedValidationNodeId = useSwarmStore((s) => s.setExpandedValidationNodeId);
  const canvasActions = useMemo(() => ({
    onViewOutput: (nodeId) => {
      setExpandedOutputNodeId(nodeId);
    },
    onEdit: (nodeId) => {
      setExpandedOutputNodeId(null);
      setExpandedValidationNodeId(null);
      setSelectedNode(nodeId);
    },
    onDuplicate: (nodeId) => duplicateNode(nodeId),
    onDelete: (nodeId) => deleteNode(nodeId),
  }), [setSelectedNode, setExpandedOutputNodeId, setExpandedValidationNodeId, duplicateNode, deleteNode]);

  // Build context menu actions based on type
  const contextMenuActions = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.type === 'canvas') {
      return [
        { label: 'Add Agent Node', icon: '\uD83E\uDD16', onClick: () => addNodeAtPosition('agent', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Add Input Block', icon: '\uD83D\uDCDD', onClick: () => addNodeAtPosition(CANONICAL_VISUAL_INPUT_NODE_TYPE, contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Add Output Extractor', icon: '\uD83D\uDCE6', onClick: () => addNodeAtPosition('outputExtractor', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Add Department', icon: '\uD83C\uDFE2', onClick: () => addNodeAtPosition('department', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Add Trigger', icon: '\u26A1', onClick: () => addNodeAtPosition('trigger', contextMenu.screenX ?? contextMenu.x, contextMenu.screenY ?? contextMenu.y) },
        { label: 'Select All', icon: '\u2610', onClick: () => setNodes((nds) => nds.map((n) => ({ ...n, selected: true }))) },
        { label: 'Paste', icon: '\uD83D\uDCCB', onClick: () => pasteNode(contextMenu.x, contextMenu.y), disabled: !clipboardRef.current },
      ];
    }
    if (contextMenu.type === 'node') {
      return [
        {
          label: 'Edit',
          icon: '\u270F\uFE0F',
          onClick: () => {
            setExpandedOutputNodeId(null);
            setExpandedValidationNodeId(null);
            setSelectedNode(contextMenu.nodeId);
          },
        },
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
  }, [contextMenu, addNodeAtPosition, pasteNode, setSelectedNode, setExpandedOutputNodeId, setExpandedValidationNodeId, duplicateNode, copyNode, deleteNode, deleteEdge, setNodes]);

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

  useEffect(() => {
    window.addEventListener('dragend', clearDropPreview);
    window.addEventListener('drop', clearDropPreview);

    return () => {
      window.removeEventListener('dragend', clearDropPreview);
      window.removeEventListener('drop', clearDropPreview);
      if (dropPreviewTimeoutRef.current) {
        clearTimeout(dropPreviewTimeoutRef.current);
      }
    };
  }, [clearDropPreview]);

  return (
    <CanvasActionsContext.Provider value={canvasActions}>
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <BreadcrumbBar nodes={nodes} />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <NodePalette workflowProps={workflowProps} />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
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
            snapGrid={[GRID_SIZE, GRID_SIZE]}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionMode={ConnectionMode.Loose}
            connectionLineComponent={FloatingConnectionLine}
            defaultMarkerColor="#64748b"
            minZoom={0.1}
            fitView
            className="h-full w-full"
          >
            <Background gap={20} size={1} color="#1f2937" />
            <Controls
              className="swarm-flow-controls"
              style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
              showInteractive={false}
            />
            <MiniMap
              className="swarm-flow-minimap"
              style={{ background: '#111827', border: '1px solid #374151', borderRadius: '6px' }}
              maskColor="rgba(0,0,0,0.4)"
              nodeColor="#6366f1"
            />
          </ReactFlow>
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={contextMenuActions}
            onClose={closeContextMenu}
          />
        )}
        {!sidePanelOpen && (
          <div className="shrink-0 border-l border-gray-700 bg-gray-900/95 p-2">
            <button
              onClick={() => setSidePanelOpen(true)}
              className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-700"
            >
              Open Activity
            </button>
          </div>
        )}
        {showSidePanels && (
          <div className="z-10 flex h-full min-h-0 w-[21rem] min-w-[21rem] shrink-0 flex-col overflow-hidden border-l border-gray-700 bg-gray-900">
            <div className="flex items-center bg-gray-900 border-b border-gray-700">
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
              <button
                onClick={() => setSidePanelOpen(false)}
                className="shrink-0 border-l border-gray-700 px-2 py-1.5 text-xs text-gray-500 hover:text-white"
                aria-label="Close activity rail"
                title="Close activity rail"
              >
                x
              </button>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {sidePanelMode === 'feed' ? <InterAgentFeed /> : <ChatPanel />}
            </div>
          </div>
        )}
        {showInspector && (
          <AgentInspector nodes={nodes} onUpdateNode={handleUpdateNode} />
        )}
      </div>
    </div>
    </CanvasActionsContext.Provider>
  );
}
