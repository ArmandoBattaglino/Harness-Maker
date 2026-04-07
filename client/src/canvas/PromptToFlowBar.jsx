// client/src/canvas/PromptToFlowBar.jsx
// Natural-language prompt bar that calls scaffold endpoint to generate a workflow.
import { useState, useCallback, useEffect } from 'react';

const SCAFFOLD_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'ClaudeCodeManager',
};

export default function PromptToFlowBar({ onWorkflowGenerated, resetSignal }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [promptError, setPromptError] = useState('');

  useEffect(() => {
    setPromptError('');
    setError(null);
  }, [resetSignal]);

  const handleGenerate = useCallback(async () => {
    if (loading) return;
    const trimmed = prompt.trim();
    if (!trimmed) {
      setPromptError('Please enter a workflow description.');
      return;
    }
    setPromptError('');

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/swarm/scaffold', {
        method: 'POST',
        headers: SCAFFOLD_HEADERS,
        body: JSON.stringify({ prompt: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const { workflowId, workflowDef } = await res.json();

      const animatedDef = {
        ...workflowDef,
        nodes: workflowDef.nodes.map((node) => ({
          ...node,
          data: { ...node.data },
        })),
      };

      onWorkflowGenerated?.(workflowId, animatedDef);
      setPrompt('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, onWorkflowGenerated]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col gap-1 px-4 py-2 bg-gray-900 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span className="text-purple-400 text-lg">✨</span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setPromptError(''); }}
          onKeyDown={handleKeyDown}
          placeholder="Describe your workflow... e.g. 'Triage customer requests then route to billing or support agents'"
          disabled={loading}
          className={`flex-1 bg-gray-800 text-white text-sm rounded px-3 py-1.5
                     border focus:outline-none
                     placeholder-gray-500 disabled:opacity-50 ${
                       promptError
                         ? 'border-red-500 focus:border-red-400'
                         : 'border-gray-600 focus:border-purple-500'
                     }`}
          maxLength={2000}
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500
                     disabled:opacity-40 disabled:cursor-not-allowed text-white
                     transition-colors shrink-0"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>
      {promptError && (
        <div className="text-xs text-red-400 pl-7">{promptError}</div>
      )}
      {error && (
        <div className="text-xs text-red-400 pl-7">{error}</div>
      )}
    </div>
  );
}
