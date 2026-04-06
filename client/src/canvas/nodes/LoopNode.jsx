// client/src/canvas/nodes/LoopNode.jsx
// Loop node — iterates with configurable max iterations and exit condition.
// FR-V5-68, FR-V5-71
import { Handle, Position } from '@xyflow/react';

// type: "loop"
export default function LoopNode({ id, data, selected }) {
  const maxIterations = data.maxIterations ?? 0;
  const exitCondition = data.exitCondition || '';

  return (
    <div
      className={`relative rounded-lg border-2 border-violet-500 bg-violet-950 p-3 min-w-[160px] max-w-[200px] text-white text-sm
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
    >
      {/* Top handle — input */}
      <Handle type="target" position={Position.Top} className="!bg-violet-400 !border-violet-600" />

      {/* Circular arrow icon + label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="loop">&#128260;</span>
        <span className="font-semibold truncate">{data.label || 'Loop'}</span>
      </div>

      {/* Iteration badge */}
      {maxIterations > 0 && (
        <div className="text-xs text-violet-300 mb-0.5">
          Max: {maxIterations} iterations
        </div>
      )}

      {/* Exit condition preview */}
      {exitCondition && (
        <div className="text-[10px] text-violet-400 truncate" title={exitCondition}>
          Exit: {exitCondition}
        </div>
      )}

      {/* Bottom handle — loop back */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="loop"
        className="!bg-violet-400 !border-violet-600"
      />

      {/* Right handle — exit */}
      <Handle
        type="source"
        position={Position.Right}
        id="exit"
        className="!bg-green-400 !border-green-600"
      />
    </div>
  );
}
