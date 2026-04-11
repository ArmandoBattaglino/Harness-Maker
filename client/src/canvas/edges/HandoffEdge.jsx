import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  Position,
  getBezierPath,
  useInternalNode,
} from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';
import { getFloatingEdgeParams } from './floatingEdgeUtils';

const ROUTE_RADIUS = 16;
const SLOT_SIDE_PADDING = 34;
const SLOT_MAX_SPAN = 124;
const CORRIDOR_OFFSET = 22;
const CORRIDOR_LANE_GAP = 12;
const FEEDBACK_ROUTE_OFFSET = 64;

function getSlotOffset(index, count, nodeWidth) {
  if (!count || count <= 1 || !nodeWidth) {
    return 0;
  }

  const usableSpan = Math.max(
    0,
    Math.min(nodeWidth - SLOT_SIDE_PADDING * 2, SLOT_MAX_SPAN)
  );

  if (!usableSpan) {
    return 0;
  }

  const step = usableSpan / (count - 1);
  return -usableSpan / 2 + step * index;
}

function getLaneOffset(index, count, gap = CORRIDOR_LANE_GAP) {
  if (!count || count <= 1) {
    return 0;
  }

  return (index - (count - 1) / 2) * gap;
}

function buildRoundedPath(points, radius = ROUTE_RADIUS) {
  const cleanPoints = points.filter((point, index) => {
    if (!index) return true;
    const prev = points[index - 1];
    return prev.x !== point.x || prev.y !== point.y;
  });

  if (cleanPoints.length < 2) {
    return '';
  }

  let path = `M ${cleanPoints[0].x} ${cleanPoints[0].y}`;

  for (let i = 1; i < cleanPoints.length - 1; i += 1) {
    const prev = cleanPoints[i - 1];
    const current = cleanPoints[i];
    const next = cleanPoints[i + 1];

    const vectorIn = { x: current.x - prev.x, y: current.y - prev.y };
    const vectorOut = { x: next.x - current.x, y: next.y - current.y };
    const lengthIn = Math.hypot(vectorIn.x, vectorIn.y);
    const lengthOut = Math.hypot(vectorOut.x, vectorOut.y);

    if (!lengthIn || !lengthOut) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const localRadius = Math.min(radius, lengthIn / 2, lengthOut / 2);
    const cornerStart = {
      x: current.x - (vectorIn.x / lengthIn) * localRadius,
      y: current.y - (vectorIn.y / lengthIn) * localRadius,
    };
    const cornerEnd = {
      x: current.x + (vectorOut.x / lengthOut) * localRadius,
      y: current.y + (vectorOut.y / lengthOut) * localRadius,
    };

    path += ` L ${cornerStart.x} ${cornerStart.y}`;
    path += ` Q ${current.x} ${current.y} ${cornerEnd.x} ${cornerEnd.y}`;
  }

  const lastPoint = cleanPoints[cleanPoints.length - 1];
  path += ` L ${lastPoint.x} ${lastPoint.y}`;
  return path;
}

function getCorridorPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceOffsetX,
  targetOffsetX,
  corridorLift = 0,
  sourceLaneOffsetY = 0,
  targetLaneOffsetY = 0,
}) {
  const sourceSlotX = sourceX + sourceOffsetX;
  const targetSlotX = targetX + targetOffsetX;
  const sourceCorridorY = sourceY + CORRIDOR_OFFSET + corridorLift + sourceLaneOffsetY;
  const targetEntryY = Math.max(
    sourceCorridorY + ROUTE_RADIUS * 1.5,
    targetY - CORRIDOR_OFFSET - Math.max(0, corridorLift * 0.25) + targetLaneOffsetY
  );
  const cornerRadius = Math.min(
    28,
    ROUTE_RADIUS + 10 + Math.min(6, corridorLift * 0.15)
  );
  const points = [
    { x: sourceSlotX, y: sourceY },
    { x: sourceSlotX, y: sourceCorridorY },
    { x: targetSlotX, y: sourceCorridorY },
    { x: targetSlotX, y: targetEntryY },
    { x: targetSlotX, y: targetY },
  ];

  return [
    buildRoundedPath(points, cornerRadius),
    sourceSlotX + (targetSlotX - sourceSlotX) * 0.5,
    sourceCorridorY - 18,
  ];
}

function getFeedbackPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceOffsetX,
  targetOffsetX,
  sourceLaneIndex = 0,
  sourceLaneCount = 1,
}) {
  const sourceSlotX = sourceX + sourceOffsetX;
  const targetSlotX = targetX + targetOffsetX;
  const laneOffset = getLaneOffset(sourceLaneIndex, sourceLaneCount, 18);
  const routesToRight = sourceSlotX >= targetSlotX;
  const escapeX = routesToRight
    ? Math.max(sourceSlotX, targetSlotX) + FEEDBACK_ROUTE_OFFSET + laneOffset
    : Math.min(sourceSlotX, targetSlotX) - FEEDBACK_ROUTE_OFFSET + laneOffset;
  const travelY = Math.min(sourceY, targetY) - (54 + Math.abs(laneOffset) * 0.6);

  const points = [
    { x: sourceSlotX, y: sourceY },
    { x: sourceSlotX, y: sourceY + 18 },
    { x: escapeX, y: sourceY + 18 },
    { x: escapeX, y: travelY },
    { x: targetSlotX, y: travelY },
    { x: targetSlotX, y: targetY },
  ];

  return [
    buildRoundedPath(points, 14),
    escapeX,
    travelY - 16,
  ];
}

// type: "handoff"
export default function HandoffEdge({
  id,
  source,
  target,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  markerEnd,
  data,
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const counter = useSwarmStore((s) => s.edgeCounters[id] ?? 0);
  const isActive = counter > 0;
  const isSelected = Boolean(data?.selected);
  const selectionActive = Boolean(data?.selectionActive);
  const nodeSelectionActive = Boolean(data?.nodeSelectionActive);
  const relatedToSelectedNode = Boolean(data?.relatedToSelectedNode);
  const hasFocusedSelection = Boolean(data?.hasFocusedSelection);
  const sourceOffsetX = getSlotOffset(
    data?.sourceSlotIndex ?? 0,
    data?.sourceSlotCount ?? 1,
    data?.sourceNodeWidth ?? 0
  );
  const targetOffsetX = getSlotOffset(
    data?.targetSlotIndex ?? 0,
    data?.targetSlotCount ?? 1,
    data?.targetNodeWidth ?? 0
  );
  const corridorLift = data?.corridorLift ?? 0;
  const edgeRole = data?.edgeRole ?? 'direct';
  const isFeedbackEdge = edgeRole === 'feedback';
  const isContextHighlighted = isSelected || relatedToSelectedNode;
  const sourceLaneOffsetY = getLaneOffset(
    data?.sourceLaneIndex ?? 0,
    data?.sourceLaneCount ?? 1
  );
  const targetLaneOffsetY = getLaneOffset(
    data?.targetLaneIndex ?? 0,
    data?.targetLaneCount ?? 1,
    10
  );
  const usesCorridorRouting =
    !isFeedbackEdge
    && edgeRole === 'primary'
    && sourcePosition === Position.Bottom
    && targetPosition === Position.Top
    && targetY > sourceY
    && Boolean(data?.preferCorridorRouting);

  const strokeColor = isFeedbackEdge
    ? (isSelected ? '#cbd5e1' : isActive ? '#93c5fd' : '#64748b')
    : isSelected
      ? '#f8fafc'
      : isActive
        ? '#60a5fa'
        : '#93c5fd';
  const passiveOpacity = isFeedbackEdge ? 0.35 : 1;
  const contextOpacity = isFeedbackEdge
    ? (isContextHighlighted ? 0.85 : nodeSelectionActive ? 0.18 : passiveOpacity)
    : (isContextHighlighted ? 1 : nodeSelectionActive ? 0.3 : passiveOpacity);
  const dimmedOpacity = selectionActive && !isSelected
    ? 0.25
    : hasFocusedSelection
      ? contextOpacity
      : passiveOpacity;
  const showFeedbackRail = !isFeedbackEdge || isContextHighlighted || isActive;
  const resolvedMarkerEnd = markerEnd ?? {
    type: MarkerType.Arrow,
    width: isSelected ? 16 : isFeedbackEdge ? 12 : 15,
    height: isSelected ? 16 : isFeedbackEdge ? 12 : 15,
    color: strokeColor,
  };

  let edgePath;
  let labelX;
  let labelY;

  if (isFeedbackEdge) {
    [edgePath, labelX, labelY] = getFeedbackPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceOffsetX,
      targetOffsetX,
      sourceLaneIndex: data?.sourceLaneIndex ?? 0,
      sourceLaneCount: data?.sourceLaneCount ?? 1,
    });
  } else if (sourceNode && targetNode) {
    const fp = getFloatingEdgeParams(sourceNode, targetNode);
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX: fp.sx,
      sourceY: fp.sy,
      sourcePosition: fp.sourcePos,
      targetX: fp.tx,
      targetY: fp.ty,
      targetPosition: fp.targetPos,
    });
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX: sourceX + sourceOffsetX,
      sourceY,
      sourcePosition,
      targetX: targetX + targetOffsetX,
      targetY,
      targetPosition,
    });
  }

  return (
    <>
      {isSelected && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: isFeedbackEdge ? 'rgba(148, 163, 184, 0.12)' : 'rgba(96, 165, 250, 0.18)',
            strokeWidth: isFeedbackEdge ? 8 : 12,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
        />
      )}
      {showFeedbackRail && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: selectionActive && !isSelected
              ? 'rgba(15, 23, 42, 0.35)'
              : isFeedbackEdge
                ? 'rgba(30, 41, 59, 0.5)'
                : 'rgba(30, 41, 59, 0.95)',
            strokeWidth: isFeedbackEdge ? (isSelected ? 5 : 3.5) : isSelected ? 10 : isActive ? 9 : 7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            opacity: hasFocusedSelection
              ? (isContextHighlighted ? 0.8 : 0.2)
              : isFeedbackEdge ? 0.35 : 1,
          }}
        />
      )}
      <BaseEdge
        path={edgePath}
        markerEnd={resolvedMarkerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth: isFeedbackEdge ? (isSelected ? 2.4 : 1.6) : isSelected ? 4 : isActive ? 3.2 : 2.5,
          opacity: isSelected ? 1 : dimmedOpacity,
          strokeDasharray: isFeedbackEdge && !isActive ? '6 8' : undefined,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
      {isActive && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: isSelected ? '#ffffff' : '#dbeafe',
            strokeWidth: 1.4,
            strokeDasharray: '9 10',
            animation: 'dashdraw 0.9s linear infinite',
            opacity: isSelected ? 1 : dimmedOpacity,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
        />
      )}
      {isActive && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`${isSelected ? 'bg-blue-950/95 text-white border-blue-300' : 'bg-slate-950/95 text-blue-100 border-blue-400/80'} text-[11px] font-semibold rounded-full
                       min-w-[34px] h-6 flex items-center justify-center px-2
                       shadow-[0_0_0_1px_rgba(15,23,42,0.6)]
                       nodrag nopan`}
          >
            {counter} {'->'}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
