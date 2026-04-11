import { useEffect, useRef } from 'react';

function getIssueLabel(count) {
  return `${count} issue${count === 1 ? '' : 's'}`;
}

export default function NodeValidationCard({ nodeId, nodeLabel, issues = [], onClose }) {
  const cardRef = useRef(null);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        const isInsideNode = event.target.closest('.react-flow__node');
        if (!isInsideNode) onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      className="nowheel nodrag nopan absolute top-0 left-[calc(100%+14px)] z-50 w-[340px] max-h-[420px] flex flex-col rounded-lg border border-amber-500/30 bg-gray-900/97 backdrop-blur-sm shadow-[0_8px_18px_rgba(0,0,0,0.28)] text-white text-sm"
      style={{ animation: 'outputCardSlideIn 0.2s ease-out' }}
      onClick={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-amber-500/20">
        <div className="min-w-0">
          <div className="font-semibold text-[13px] truncate text-gray-100">
            {nodeLabel || nodeId}
          </div>
          <div className="text-[11px] text-amber-200/80">
            {getIssueLabel(issues.length)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-sm leading-none ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700/60 transition-colors"
          aria-label="Close validation details"
        >
          &times;
        </button>
      </div>

      <div className="nowheel validation-card-scrollbar flex-1 overflow-y-auto min-h-0 px-3 py-2.5">
        {issues.length === 0 ? (
          <p className="text-[12px] italic text-gray-500">No validation issues for this agent.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-[12px] text-gray-100">
                    {issue.summary}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      issue.severity === 'error'
                        ? 'bg-red-500/15 text-red-200 border border-red-400/30'
                        : 'bg-amber-500/15 text-amber-200 border border-amber-400/30'
                    }`}
                  >
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-gray-300">
                  {issue.detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
