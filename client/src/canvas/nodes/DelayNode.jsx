// client/src/canvas/nodes/DelayNode.jsx
// Delay timer node — pauses flow for a configured number of seconds.
// FR-V5-64, FR-V5-66
import { Handle, Position } from '@xyflow/react';

// type: "delay"
export default function DelayNode({ id, data, selected }) {
  const seconds = data.delaySeconds ?? 0;
  const displayTime =
    seconds >= 3600
      ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
      : seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : `${seconds}s`;

  return (
    <div
      className={`relative rounded-lg border-2 border-orange-500 bg-orange-950 p-3 min-w-[140px] max-w-[180px] text-white text-sm
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
    >
      {/* Top handle — input */}
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !border-orange-600" />

      {/* Clock icon + label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="delay timer">&#9201;</span>
        <span className="font-semibold truncate">{data.label || 'Delay'}</span>
      </div>

      {/* Delay display */}
      <div className="text-xs text-orange-300">{displayTime}</div>

      {/* Bottom handle — output */}
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !border-orange-600" />
    </div>
  );
}
