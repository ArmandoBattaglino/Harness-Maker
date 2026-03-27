// client/src/canvas/nodes/TriggerNode.jsx
// Trigger source node stub — webhook and RSS feed triggers.
// Full implementation in Task #76 (TriggerNode full visual implementation).
import { Handle, Position } from '@xyflow/react';

const triggerIcons = {
  webhook: '🔗',
  rss: '📡',
};

// type: "trigger"
export default function TriggerNode({ id, data, selected }) {
  const icon = triggerIcons[data.triggerType] || '⚡';

  return (
    <div
      className={`rounded-lg border-2 border-purple-500 bg-purple-950 p-3 min-w-[140px] max-w-[200px]
        text-white text-sm
        ${selected ? 'ring-2 ring-white ring-offset-1' : ''}
        cursor-pointer transition-all duration-200`}
    >
      {/* Trigger icon + label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="trigger">{icon}</span>
        <span className="font-semibold truncate">{data.label || 'Trigger'}</span>
      </div>

      {/* Trigger type badge */}
      <div className="text-xs text-purple-300 capitalize">
        {data.triggerType || 'webhook'}
      </div>

      {/* Only source handle — triggers fire outward to agents */}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !border-purple-600" />
    </div>
  );
}
