import { Handle, Position } from '@xyflow/react';

export default function OutputExtractorNode({ data, selected }) {
  const format = data?.format || 'markdown';

  return (
    <div
      className={`min-w-[190px] max-w-[240px] rounded-lg border-2 bg-amber-950 p-3 text-sm text-white transition-all duration-200 ${
        selected ? 'ring-2 ring-white ring-offset-1' : 'border-amber-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-300 !border-amber-700" />
      <div className="flex items-center gap-2">
        <span className="text-lg" role="img" aria-label="output extractor">📦</span>
        <span className="truncate font-semibold">{data?.label || 'Output Extractor'}</span>
      </div>
      <p className="mt-1 truncate text-[11px] text-amber-100/80">
        {data?.artifactName || data?.artifactKey || 'Workflow artifact'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="rounded-full border border-amber-300/40 bg-amber-900 px-2 py-0.5 text-amber-100">
          {format}
        </span>
        <span className="rounded-full border border-amber-300/30 bg-gray-900/40 px-2 py-0.5 text-amber-100">
          {data?.sourcePolicy || 'allIncoming'}
        </span>
      </div>
    </div>
  );
}
