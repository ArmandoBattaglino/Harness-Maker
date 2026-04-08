import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  Position,
  getSmoothStepPath,
} from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';

const ROUTE_RADIUS = 16;
const ROUTE_OFFSET = 30;
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
  const targetCorridorY = Math.max(
    sourceCorridorY + ROUTE_RADIUS * 2,
    targetY - CORRIDOR_OFFSET - Math.max(0, corridorLift * 0.4) + targetLaneOffsetY
  );
  const horizontalDelta = targetSlotX - sourceSlotX;
  const horizontalDirection = horizontalDelta >= 0 ? 1 : -1;
  const exitControlY = Math.min(
    56,
    Math.max(18, CORRIDOR_OFFSET + corridorLift * 0.35 + Math.abs(sourceLaneOffsetY) * 0.45)
  );
  const entryControlY = Math.min(
    56,
    Math.max(18, CORRIDOR_OFFSET + Math.abs(targetLaneOffsetY) * 0.45)
  );
  const travelControlX = Math.min(
    110,
    Math.max(26, Math.abs(horizontalDelta) * 0.28)
  );
  const travelControlY = Math.min(
    54,
    Math.max(18, Math.abs(targetCorridorY - sourceCorridorY) * 0.4)
  );

  const edgePath = [
    `M ${sourceSlotX} ${sourceY}`,
    `C ${sourceSlotX} ${sourceY + exitControlY}, ${sourceSlotX} ${sourceCorridorY - travelControlY}, ${sourceSlotX} ${sourceCorridorY}`,
    `C ${sourceSlotX + horizontalDirection * travelControlX} ${sourceCorridorY}, ${targetSlotX - horizontalDirection * travelControlX} ${targetCorridorY}, ${targetSlotX} ${targetCorridorY}`,
    `C ${targetSlotX} ${targetCorridorY + travelControlY}, ${targetSlotX} ${targetY - entryControlY}, ${targetSlotX} ${targetY}`,
  ].join(' ');

  return [
    edgePath,
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
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  markerEnd,
  data,
}) {
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
    ? (isSelected ? '#cbd5e1' : isActive ? '#93c5fd' : '#475569')
    : isSelected
      ? '#f8fafc'
      : isActive
        ? '#60a5fa'
        : '#64748b';
  const passiveOpacity = isFeedbackEdge ? 0.18 : 0.88;
  const contextOpacity = isFeedbackEdge
    ? (isContextHighlighted ? 0.78 : nodeSelectionActive ? 0.1 : passiveOpacity)
    : (isContextHighlighted ? 0.96 : nodeSelectionActive ? 0.16 : passiveOpacity);
  const dimmedOpacity = selectionActive && !isSelected
    ? 0.16
    : hasFocusedSelection
      ? contextOpacity
      : passiveOpacity;
  const showFeedbackRail = !isFeedbackEdge || isContextHighlighted || isActive;
  const resolvedMarkerEnd = markerEnd ?? {
    type: MarkerType.Arrow,
    width: isSelected ? 15 : isFeedbackEdge ? 11 : 14,
    height: isSelected ? 15 : isFeedbackEdge ? 11 : 14,
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
  } else if (usesCorridorRouting) {
    [edgePath, labelX, labelY] = getCorridorPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceOffsetX,
      targetOffsetX,
      corridorLift,
      sourceLaneOffsetY,
      targetLaneOffsetY,
    });
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX: sourceX + sourceOffsetX,
      sourceY,
      sourcePosition,
      targetX: targetX + targetOffsetX,
      targetY,
      targetPosition,
      borderRadius: ROUTE_RADIUS,
      offset: ROUTE_OFFSET,
      stepPosition: 0.2,
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
              ? 'rgba(15, 23, 42, 0.22)'
              : isFeedbackEdge
                ? 'rgba(15, 23, 42, 0.32)'
                : 'rgba(15, 23, 42, 0.92)',
            strokeWidth: isFeedbackEdge ? (isSelected ? 4.5 : 3) : isSelected ? 9 : isActive ? 8 : 6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            opacity: hasFocusedSelection
              ? (isContextHighlighted ? 0.72 : 0.12)
              : isFeedbackEdge ? 0.22 : 1,
          }}
        />
      )}
      <BaseEdge
        path={edgePath}
        markerEnd={isFeedbackEdge && !isContextHighlighted && !isActive ? undefined : resolvedMarkerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth: isFeedbackEdge ? (isSelected ? 2.2 : 1.4) : isSelected ? 3.8 : isActive ? 3 : 2.1,
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
