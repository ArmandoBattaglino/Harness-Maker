// client/src/canvas/VersionHistory.jsx
// Slide-out panel showing workflow version history (FR-V5-53/54/55).
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../hooks/useApi.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  // Server stores timestamps with '-' instead of ':' and '.' — restore ISO format
  // e.g. "2026-04-06T21-16-32-123Z" → "2026-04-06T21:16:32.123Z"
  const restored = isoStr.replace(
    /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d+Z?)$/,
    '$1$2:$3:$4.$5'
  );
  const d = new Date(restored);
  if (isNaN(d.getTime())) return isoStr; // fallback to raw string
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VersionHistory({ workflowId, onRestore, onPreview, onClose }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(null); // timestamp being restored
  const [previewTimestamp, setPreviewTimestamp] = useState(null);

  const fetchVersions = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/v1/workflows/${workflowId}/versions`);
      setVersions(Array.isArray(data) ? data : data?.versions ?? []);
    } catch (err) {
      setError(err.message || 'Failed to load version history');
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (previewTimestamp) {
          setPreviewTimestamp(null);
          if (onPreview) onPreview(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previewTimestamp, onPreview]);

  const handleRestore = useCallback(async (timestamp) => {
    setRestoring(timestamp);
    try {
      const result = await apiPost(
        `/api/v1/workflows/${workflowId}/versions/${encodeURIComponent(timestamp)}/restore`,
        {}
      );
      const workflow = result?.workflow ?? result;
      if (onRestore) onRestore(workflow);
    } catch (err) {
      setError(err.message || 'Failed to restore version');
    } finally {
      setRestoring(null);
    }
  }, [workflowId, onRestore]);

  const handlePreview = useCallback((version) => {
    const ts = version.timestamp;
    if (previewTimestamp === ts) {
      // Toggle off
      setPreviewTimestamp(null);
      if (onPreview) onPreview(null);
    } else {
      setPreviewTimestamp(ts);
      if (onPreview) onPreview(version);
    }
  }, [previewTimestamp, onPreview]);

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-80 bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-white">Version History</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
          aria-label="Close versions"
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

        {!loading && !error && versions.length === 0 && (
          <div className="text-xs text-gray-500 py-8 text-center">
            No versions available. Save changes to create versions.
          </div>
        )}

        {!loading && versions.length > 0 && (
          <div className="relative flex flex-col gap-0">
            {/* Timeline line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-700" />

            {versions.map((ver, idx) => {
              const isPreview = previewTimestamp === ver.timestamp;
              const isRestoring = restoring === ver.timestamp;

              return (
                <div key={ver.timestamp || idx} className="relative pl-8 py-2.5">
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-2 top-3.5 w-2.5 h-2.5 rounded-full border-2 ${
                      isPreview
                        ? 'bg-blue-500 border-blue-400'
                        : idx === 0
                        ? 'bg-green-500 border-green-400'
                        : 'bg-gray-600 border-gray-500'
                    }`}
                  />

                  <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-200 font-medium">
                      {ver.name || formatTimestamp(ver.timestamp)}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {formatTimestamp(ver.timestamp)}
                      {ver.nodeCount != null && ` · ${ver.nodeCount} nodes`}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => handlePreview(ver)}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                          isPreview
                            ? 'bg-blue-700 text-blue-200'
                            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                        }`}
                      >
                        {isPreview ? 'Previewing' : 'Preview'}
                      </button>
                      <button
                        onClick={() => handleRestore(ver.timestamp)}
                        disabled={isRestoring}
                        className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {isRestoring ? '...' : 'Restore'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
