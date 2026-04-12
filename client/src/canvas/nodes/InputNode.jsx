import { Handle, Position } from '@xyflow/react';

export default function InputNode({ data, selected }) {
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const imageCount = fields.filter((field) => field.type === 'image').length;

  return (
    <div
      className={`min-w-[180px] max-w-[230px] rounded-lg border-2 bg-emerald-950 p-3 text-sm text-white transition-all duration-200 ${
        selected ? 'ring-2 ring-white ring-offset-1' : 'border-emerald-400'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg" role="img" aria-label="workflow input">📝</span>
        <span className="truncate font-semibold">{data?.label || 'Workflow Input'}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-emerald-100/80">
        {data?.prompt || data?.description || 'Collects workflow-start input.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="rounded-full border border-emerald-300/40 bg-emerald-900 px-2 py-0.5 text-emerald-100">
          {fields.length} field{fields.length === 1 ? '' : 's'}
        </span>
        {imageCount > 0 && (
          <span className="rounded-full border border-cyan-300/40 bg-cyan-950 px-2 py-0.5 text-cyan-100">
            {imageCount} image
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-300 !border-emerald-700" />
    </div>
  );
}
