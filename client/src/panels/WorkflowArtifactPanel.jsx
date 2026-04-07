// client/src/panels/WorkflowArtifactPanel.jsx
// Modal panel showing the aggregated markdown artifact for an entire workflow execution.
// Provides copy-to-clipboard and download-as-.md functionality.
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiGet } from '../hooks/useApi.js';

/**
 * Sanitize a string for use in a filename — replace non-alphanumeric chars with hyphens,
 * collapse consecutive hyphens, trim leading/trailing hyphens.
 */
function sanitizeFilename(str) {
  return str
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export default function WorkflowArtifactPanel({ executionId, workflowName, onClose }) {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Fetch aggregated artifact on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchResults() {
      try {
        const data = await apiGet(`/api/v1/swarm/executions/${executionId}/results`);
        if (cancelled) return;
        setMarkdown(data.aggregatedArtifact || '');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Could not load results.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchResults();
    return () => { cancelled = true; };
  }, [executionId]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Copy raw markdown to clipboard
  function handleCopy() {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  // Download as .md file
  function handleDownload() {
    const safeName = sanitizeFilename(workflowName || 'workflow');
    const idPrefix = (executionId || '').slice(0, 8);
    const filename = `${safeName}-${idPrefix}.md`;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Close when clicking backdrop (not the modal body)
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-900 rounded-lg border border-gray-700 max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold text-white truncate">
            Final Report: {workflowName || 'Workflow'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors ml-3 shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable markdown area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar min-h-0">
          {loading && (
            <p className="text-sm text-gray-400 animate-pulse">Loading...</p>
          )}

          {error && (
            <p className="text-sm text-yellow-400">
              Could not load results. The execution may still be in progress.
            </p>
          )}

          {!loading && !error && !markdown && (
            <p className="text-sm text-gray-500">No artifact content available.</p>
          )}

          {!loading && !error && markdown && (
            <div className="prose prose-invert prose-sm max-w-none
                            prose-headings:text-white prose-headings:font-bold
                            prose-p:text-gray-300 prose-li:text-gray-300
                            prose-a:text-blue-400 prose-strong:text-white
                            prose-code:text-green-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
                            prose-pre:bg-gray-800 prose-pre:rounded prose-pre:p-3 prose-pre:overflow-x-auto
                            prose-table:text-gray-300
                            prose-th:text-gray-200 prose-th:border-gray-600
                            prose-td:border-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer action bar */}
        {!loading && !error && markdown && (
          <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-700 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded
                         border border-gray-600 bg-gray-800 text-gray-200
                         hover:bg-gray-700 transition-colors"
            >
              {copyFeedback ? 'Copied!' : 'Copy All'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded
                         border border-gray-600 bg-gray-800 text-gray-200
                         hover:bg-gray-700 transition-colors"
            >
              Download .md
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
