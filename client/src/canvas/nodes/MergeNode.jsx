// client/src/canvas/nodes/MergeNode.jsx
// Hexagonal merge/join node — waits for multiple inputs before continuing.
// FR-V5-60
import { Handle, Position } from '@xyflow/react';

// type: "merge"
export default function MergeNode({ id, data, selected }) {
  const waitFor = data.waitFor ?? 'all';
  const waitLabel =
    waitFor === 'all' ? 'Wait: all' : waitFor === 'any' ? 'Wait: any' : `Wait: ${waitFor}`;

  return (
    <div
      className={`relative flex items-center justify-center text-white text-sm
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
      style={{ width: 150, height: 90 }}
    >
      {/* Hexagon shape via clip-path */}
      <div
        className="absolute inset-0 border-2 border-cyan-500 bg-cyan-950"
        style={{
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        <span className="text-lg mb-0.5">&#x2B21;</span>
        <span className="font-semibold text-xs truncate max-w-[100px]">
          {data.label || 'Merge'}
        </span>
        <span className="text-[10px] text-cyan-300 mt-0.5">{waitLabel}</span>
      </div>

      {/* Left handles — multiple inputs */}
      <Handle
        type="target"
        position={Position.Left}
        id="in-0"
        className="!bg-cyan-400 !border-cyan-600"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in-1"
        className="!bg-cyan-400 !border-cyan-600"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in-2"
        className="!bg-cyan-400 !border-cyan-600"
        style={{ top: '70%' }}
      />

      {/* Right handle — single output */}
      <Handle type="source" position={Position.Right} className="!bg-cyan-400 !border-cyan-600" />
    </div>
  );
}
