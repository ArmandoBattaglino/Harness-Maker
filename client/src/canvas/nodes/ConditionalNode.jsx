// client/src/canvas/nodes/ConditionalNode.jsx
// Diamond-shaped conditional router node for flow control.
// FR-V5-56, FR-V5-59
import { Handle, Position } from '@xyflow/react';

// type: "conditional"
export default function ConditionalNode({ id, data, selected }) {
  const rules = data.rules || [];
  const ruleCount = rules.length;

  return (
    <div
      className={`relative flex items-center justify-center
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
      style={{ width: 140, height: 140 }}
    >
      {/* Diamond shape via rotated inner container */}
      <div
        className="absolute border-2 border-amber-500 bg-amber-950 rounded-md"
        style={{
          width: 100,
          height: 100,
          transform: 'rotate(45deg)',
          top: 20,
          left: 20,
        }}
      />

      {/* Content — counter-rotated to stay upright */}
      <div className="relative z-10 flex flex-col items-center text-white text-sm">
        <span className="text-lg mb-0.5">&#9670;</span>
        <span className="font-semibold text-xs truncate max-w-[100px]">
          {data.label || 'Conditional'}
        </span>
        <span className="text-[10px] text-amber-300 mt-0.5">IF / THEN</span>
        {ruleCount > 0 && (
          <span className="mt-0.5 bg-amber-600 text-white text-[10px] rounded-full px-1.5 leading-4">
            {ruleCount} rule{ruleCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Top handle — target (incoming) */}
      <Handle type="target" position={Position.Top} className="!bg-amber-400 !border-amber-600" />

      {/* Bottom handles — one per rule + default */}
      {rules.map((_, idx) => (
        <Handle
          key={`rule-${idx}`}
          type="source"
          position={Position.Bottom}
          id={`rule-${idx}`}
          className="!bg-amber-400 !border-amber-600"
          style={{ left: `${((idx + 1) / (ruleCount + 2)) * 100}%` }}
        />
      ))}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!bg-gray-400 !border-gray-600"
        style={{ left: `${((ruleCount + 1) / (ruleCount + 2)) * 100}%` }}
      />
    </div>
  );
}
