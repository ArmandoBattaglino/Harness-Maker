import { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext.jsx';
import NodeValidationCard from './NodeValidationCard.jsx';

function getIssueReviewLabel(count) {
  return `${count} issue${count === 1 ? '' : 's'} — click to review`;
}

export default function OutputExtractorNode({ id, data, selected }) {
  const format = data?.format || 'markdown';
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
      className={`relative min-w-[190px] max-w-[240px] rounded-lg border-2 bg-amber-950 p-3 text-sm text-white transition-all duration-200 ${
        selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : 'border-amber-400'
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
      {showValidationCard && (
        <NodeValidationCard
          nodeId={id}
          nodeLabel={data?.label || 'Output Extractor'}
          issues={validationIssues}
          onClose={() => setExpandedValidationNodeId(null)}
        />
      )}
    </div>
  );
}
