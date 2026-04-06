// client/src/canvas/TemplateGallery.jsx
// Modal gallery for workflow templates (FR-V5-51/52).
import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../hooks/useApi.js';

export default function TemplateGallery({ onInstantiate, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [instantiating, setInstantiating] = useState(null); // template id being instantiated

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet('/api/v1/workflows/templates')
      .then((data) => {
        if (cancelled) return;
        setTemplates(Array.isArray(data) ? data : data?.templates ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load templates');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

  const handleUseTemplate = useCallback(async (templateId) => {
    setInstantiating(templateId);
    try {
      const result = await apiPost(`/api/v1/workflows/templates/${templateId}/instantiate`, {});
      const workflow = result?.workflow ?? result;
      onInstantiate(workflow);
    } catch (err) {
      setError(err.message || 'Failed to instantiate template');
    } finally {
      setInstantiating(null);
    }
  }, [onInstantiate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-xl border border-gray-600 shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold text-white">Workflow Templates</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
            aria-label="Close templates"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-xs text-gray-400 py-8 text-center animate-pulse">Loading templates...</div>
          )}

          {error && (
            <div className="text-xs text-red-400 py-4 text-center">{error}</div>
          )}

          {!loading && !error && templates.length === 0 && (
            <div className="text-xs text-gray-500 py-8 text-center">
              No templates available.
            </div>
          )}

          {!loading && templates.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="bg-gray-900 rounded-lg border border-gray-700 p-3 flex flex-col gap-2 hover:border-gray-500 transition-colors"
                >
                  <div className="text-sm font-semibold text-white truncate">
                    {tmpl.name || 'Untitled Template'}
                  </div>
                  {tmpl.description && (
                    <div className="text-xs text-gray-400 line-clamp-2">
                      {tmpl.description}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-[10px] text-gray-500">
                      {tmpl.nodeCount ?? tmpl.nodes?.length ?? '?'} nodes
                    </span>
                    <button
                      onClick={() => handleUseTemplate(tmpl.id)}
                      disabled={instantiating === tmpl.id}
                      className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                    >
                      {instantiating === tmpl.id ? '...' : 'Use Template'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
