import { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext.jsx';
import NodeValidationCard from './NodeValidationCard.jsx';

function getIssueReviewLabel(count) {
  return `${count} issue${count === 1 ? '' : 's'} — click to review`;
}

export default function InputNode({ id, data, selected }) {
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const imageCount = fields.filter((field) => field.type === 'image').length;
  const validationIssues = useSwarmStore((s) => s.agentValidationIssuesByNodeId[id] || []);
  const expandedValidationNodeId = useSwarmStore((s) => s.expandedValidationNodeId);
  const setExpandedValidationNodeId = useSwarmStore((s) => s.setExpandedValidationNodeId);
  const validationIssueCount = validationIssues.length;
  const showValidationCard = expandedValidationNodeId === id;

  const handleValidationClick = useCallback((event) => {
    event.stopPropagation();
    setExpandedValidationNodeId(id);
  }, [id, setExpandedValidationNodeId]);

  return (
    <div
      className={`relative min-w-[180px] max-w-[230px] rounded-lg border-2 bg-emerald-950 p-3 text-sm text-white transition-all duration-200 ${
        selected ? 'ring-2 ring-white ring-offset-1' : 'border-emerald-400'
      }`}
    >
      {validationIssueCount > 0 && (
        <button
          onClick={handleValidationClick}
          className="absolute -top-2.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full border-2 z-20 cursor-pointer transition-all bg-amber-500 border-amber-300 text-[10px] font-bold text-amber-950 flex items-center justify-center"
          style={{ animation: 'warningDotGlow 2s ease-in-out infinite' }}
          title={getIssueReviewLabel(validationIssueCount)}
          aria-label={getIssueReviewLabel(validationIssueCount)}
        >
          {validationIssueCount}
        </button>
      )}
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
      {showValidationCard && (
        <NodeValidationCard
          nodeId={id}
          nodeLabel={data?.label || 'Workflow Input'}
          issues={validationIssues}
          onClose={() => setExpandedValidationNodeId(null)}
        />
      )}
    </div>
  );
}
