import { useInternalNode } from '@xyflow/react';

/**
 * Custom connection line that slides along the source node border,
 * following the mouse direction during edge creation drag.
 */
export default function FloatingConnectionLine({
  toX,
  toY,
  fromPosition,
  toPosition,
  fromNode,
}) {
  const sourceNode = useInternalNode(fromNode?.id);

  if (!sourceNode) {
    return null;
  }

  const iw = sourceNode.measured?.width ?? 180;
  const ih = sourceNode.measured?.height ?? 60;
  const iPos = sourceNode.internals?.positionAbsolute ?? sourceNode.position;

  const w = iw / 2;
  const h = ih / 2;
  const cx = iPos.x + w;
  const cy = iPos.y + h;

  const xx1 = (toX - cx) / (2 * w) - (toY - cy) / (2 * h);
  const yy1 = (toX - cx) / (2 * w) + (toY - cy) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const sx = w * (xx3 + yy3) + cx;
  const sy = h * (-xx3 + yy3) + cy;

  return (
    <g>
      <path
        fill="none"
        stroke="#93c5fd"
        strokeWidth={2.5}
        strokeDasharray="8 6"
        d={`M ${sx},${sy} C ${sx + (toX - sx) * 0.5},${sy} ${toX - (toX - sx) * 0.5},${toY} ${toX},${toY}`}
      />
      <circle
        cx={toX}
        cy={toY}
        fill="#1e293b"
        r={4}
        stroke="#93c5fd"
        strokeWidth={2}
      />
    </g>
  );
}
