// client/src/canvas/nodes/SubWorkflowNode.jsx
// Sub-workflow node — references another saved workflow as a nested step.
// FR-V5-77
import { Handle, Position } from '@xyflow/react';

// type: "subWorkflow"
export default function SubWorkflowNode({ id, data, selected }) {
  return (
    <div
      className={`relative rounded-lg p-3 min-w-[160px] max-w-[200px] text-white text-sm
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
      style={{
        border: '4px double #6b7280',
        backgroundColor: '#1f2937',
      }}
    >
      {/* Top handle — input */}
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !border-gray-600" />

      {/* Nested icon + label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="sub-workflow">&#128230;</span>
        <span className="font-semibold truncate">{data.label || 'Sub-Workflow'}</span>
      </div>

      {/* Referenced workflow name */}
      {data.workflowId ? (
        <div className="text-xs text-gray-400 truncate">
          Ref: {data.workflowId}
        </div>
      ) : (
        <div className="text-xs text-gray-500 italic">No workflow selected</div>
      )}

      {/* Bottom handle — output */}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !border-gray-600" />
    </div>
  );
}
