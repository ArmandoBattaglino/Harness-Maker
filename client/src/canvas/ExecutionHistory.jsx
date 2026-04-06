// client/src/canvas/ExecutionHistory.jsx
// Slide-in panel showing past workflow executions (FR-V5-48).
import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../hooks/useApi.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day !== 1 ? 's' : ''} ago`;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ${sec}s`;
}

const STATUS_BADGE = {
  completed: 'bg-green-700 text-green-200',
  failed: 'bg-red-700 text-red-200',
  stopped: 'bg-yellow-700 text-yellow-200',
  running: 'bg-blue-700 text-blue-200',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ExecutionHistory({ workflowId, onClose }) {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/v1/swarm/history/${workflowId}`);
      setExecutions(Array.isArray(data) ? data : data?.executions ?? []);
    } catch (err) {
      setError(err.message || 'Failed to load execution history');
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-white">Execution History</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
          aria-label="Close history"
        >
          x
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="text-xs text-gray-400 py-8 text-center animate-pulse">Loading...</div>
        )}

        {error && (
          <div className="text-xs text-red-400 py-4 text-center">{error}</div>
        )}

        {!loading && !error && executions.length === 0 && (
          <div className="text-xs text-gray-500 py-8 text-center">
            No executions yet. Run the workflow to see history here.
          </div>
        )}

        {!loading && executions.length > 0 && (
          <div className="flex flex-col gap-2">
            {executions.map((exec) => {
              const isExpanded = expandedId === exec.id;
              const durationMs =
                exec.startedAt && exec.endedAt
                  ? new Date(exec.endedAt).getTime() - new Date(exec.startedAt).getTime()
                  : exec.durationMs ?? null;

              return (
                <div
                  key={exec.id}
                  className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-750 transition-colors"
                  >
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                        STATUS_BADGE[exec.status] || 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {exec.status}
                    </span>
                    <span className="text-xs text-gray-300 flex-1 truncate">
                      {relativeTime(exec.startedAt)}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {formatDuration(durationMs)}
                    </span>
                    {exec.nodesRun != null && (
                      <span className="text-[10px] text-gray-500">
                        {exec.nodesRun} node{exec.nodesRun !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">{isExpanded ? '▾' : '▸'}</span>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-700">
                      {exec.outcome && (
                        <div className="text-xs text-gray-400 mt-2 mb-1">
                          Outcome: <span className="text-gray-200">{exec.outcome}</span>
                        </div>
                      )}

                      {exec.nodeSnapshots && exec.nodeSnapshots.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                            Per-node results
                          </div>
                          {exec.nodeSnapshots.map((snap) => (
                            <div
                              key={snap.nodeId}
                              className="flex items-center gap-2 text-xs bg-gray-900 rounded px-2 py-1.5"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  snap.status === 'done' || snap.status === 'completed'
                                    ? 'bg-green-400'
                                    : snap.status === 'error'
                                    ? 'bg-red-400'
                                    : 'bg-gray-500'
                                }`}
                              />
                              <span className="text-gray-300 flex-1 truncate">
                                {snap.label || snap.nodeId}
                              </span>
                              <span className="text-gray-500 capitalize">{snap.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(!exec.nodeSnapshots || exec.nodeSnapshots.length === 0) && (
                        <div className="text-[10px] text-gray-600 mt-2">
                          No per-node snapshots available.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
