// client/src/canvas/nodes/ErrorHandlerNode.jsx
// Error handler node — watches other nodes for errors, triggers recovery flow.
// FR-V5-73
import { Handle, Position } from '@xyflow/react';

// type: "errorHandler"
export default function ErrorHandlerNode({ id, data, selected }) {
  const watchedNodes = data.watchedNodes || [];
  const watchCount = watchedNodes.length;

  return (
    <div
      className={`relative rounded-lg border-2 border-red-500 bg-red-950 p-3 min-w-[160px] max-w-[200px] text-white text-sm
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
    >
      {/* Lightning bolt icon + label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg text-red-400" role="img" aria-label="error handler">&#9889;</span>
        <span className="font-semibold truncate">{data.label || 'Error Handler'}</span>
      </div>

      {/* Watched nodes count */}
      <div className="text-xs text-red-300">
        {watchCount > 0 ? `Watching ${watchCount} node${watchCount !== 1 ? 's' : ''}` : 'No nodes watched'}
      </div>

      {/* Output handle — sends to recovery flow */}
      <Handle type="source" position={Position.Bottom} className="!bg-red-400 !border-red-600" />
    </div>
  );
}
