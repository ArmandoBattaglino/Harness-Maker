// client/src/canvas/AgentInspector.jsx
// Side panel for inspecting and editing agent node configuration.
import { useSwarmStore } from '../store/SwarmContext';

export default function AgentInspector({ nodes, onUpdateNode }) {
  const selectedNodeId = useSwarmStore((s) => s.selectedNodeId);
  const agentState = useSwarmStore((s) => s.agentStates[selectedNodeId]);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);

  const selectedNode = nodes?.find((n) => n.id === selectedNodeId);

  if (!selectedNodeId || !selectedNode) {
    return (
      <div className="w-64 bg-gray-900 border-l border-gray-700 p-4 text-gray-400 text-sm flex items-center justify-center">
        <span>Select a node to inspect</span>
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-900 border-l border-gray-700 p-4 text-white text-sm flex flex-col gap-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-base truncate">
          {selectedNode.data?.label || 'Node'}
        </span>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-400 hover:text-white text-lg leading-none"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      {/* Node type badge */}
      <div className="text-xs text-gray-400 capitalize">
        Type: {selectedNode.type || 'agent'}
      </div>

      {/* Open Terminal button — only when agent has an active session */}
      {agentState?.sessionId && (
        <button
          onClick={() => setPtyExplosionNodeId(agentState.sessionId)}
          className="w-full text-xs px-2 py-1.5 rounded bg-indigo-700 hover:bg-indigo-600 text-white transition-colors flex items-center gap-1.5"
        >
          <span>⌨</span> Open Terminal
        </button>
      )}

      {/* Live status (from Zustand) */}
      {agentState && (
        <div className="bg-gray-800 rounded p-2 text-xs">
          <div className="text-gray-400 mb-1">Status</div>
          <div className="capitalize font-medium">{agentState.status}</div>
          {agentState.handoffCount > 0 && (
            <div className="text-gray-400 mt-1">{agentState.handoffCount} handoffs sent</div>
          )}
        </div>
      )}

      {/* System prompt (read-only display) */}
      {selectedNode.data?.systemPrompt && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-gray-400">System Prompt</div>
          <div className="bg-gray-800 rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
            {selectedNode.data.systemPrompt}
          </div>
        </div>
      )}

      {/* Last output snippet */}
      {agentState?.lastOutputSnippet && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-gray-400">Last Output</div>
          <div className="bg-gray-800 rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto text-green-300">
            {agentState.lastOutputSnippet}
          </div>
        </div>
      )}
    </div>
  );
}
