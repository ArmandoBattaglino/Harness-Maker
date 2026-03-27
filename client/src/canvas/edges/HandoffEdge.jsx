import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';

// type: "handoff"
export default function HandoffEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
  markerEnd,
}) {
  const counter = useSwarmStore((s) => s.edgeCounters[id] ?? 0);
  const isActive = counter > 0;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isActive ? '#60a5fa' : '#4b5563',
          strokeWidth: isActive ? 2 : 1,
          strokeDasharray: isActive ? '6 3' : undefined,
          animation: isActive ? 'dashdraw 0.5s linear infinite' : undefined,
        }}
      />
      {/* Counter badge — only shown when counter > 0 */}
      {isActive && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="bg-blue-500 text-white text-xs font-bold rounded-full
                       min-w-[20px] h-5 flex items-center justify-center px-1
                       border border-blue-300 nodrag nopan"
          >
            {counter}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
