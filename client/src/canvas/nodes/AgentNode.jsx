// client/src/canvas/nodes/AgentNode.jsx
// Custom React Flow node for agent visualization in swarm canvas.
import { Handle, Position } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';
import { stripAnsi } from '../../utils/stripAnsi';
// type: "agent"
export default function AgentNode({ id, data, selected }) {
  const agentState = useSwarmStore((s) => s.agentStates[id]);
  const hasUnviewedOutput = useSwarmStore(
    (s) => !!(s.agentResults[id]?.finalText && !s.agentResults[id]?.viewed)
  );
  const isDropPreview = Boolean(data?.isDropPreview);
  const status = isDropPreview ? 'preview' : agentState?.status ?? 'idle';

  // Status → color mapping
  const statusColors = {
    idle: 'border-gray-400 bg-gray-800',
    running: 'border-blue-400 bg-blue-950 animate-pulse',
    done: 'border-green-400 bg-green-950',
    paused: 'border-yellow-400 bg-yellow-950',
    error: 'border-red-400 bg-red-950',
    preview: 'border-sky-400/80 bg-sky-950/40 border-dashed',
  };
  const colorClass = statusColors[status] || statusColors.idle;

  return (
    <div
      className={`relative rounded-lg border-2 p-3 min-w-[160px] max-w-[220px] text-white text-sm
        ${colorClass}
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        ${isDropPreview ? 'pointer-events-none shadow-[0_0_0_1px_rgba(125,211,252,0.25)]' : 'cursor-pointer'}
        transition-all duration-200`}
    >
      {!isDropPreview && (
        <Handle type="target" position={Position.Top} className="!bg-gray-400 !border-gray-600" />
      )}

      {/* Validation warning badge — empty system prompt (FR-V5-45) */}
      {!isDropPreview && !data?.systemPrompt?.trim() && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[10px] text-black font-bold z-10"
          title="Empty system prompt"
        >
          !
        </div>
      )}

      {/* Unviewed output badge — pulsing red dot (top-left) */}
      {!isDropPreview && hasUnviewedOutput && status === 'done' && (
        <div
          className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-red-500 rounded-full animate-pulse border border-red-300 shadow-[0_0_6px_rgba(239,68,68,0.6)] z-10"
          title="Output ready — click to view"
        />
      )}

      {/* Agent icon + name */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="agent">🤖</span>
        <span className="font-semibold truncate">{data.label || 'Agent'}</span>
      </div>

      {/* Status badge */}
      <div className="text-xs text-gray-300 capitalize">
        {isDropPreview ? 'Drop preview' : status}
      </div>

      {/* lastOutputSnippet — micro PTY log (last 4 lines, scrollable) */}
      {agentState?.lastOutputSnippet && !isDropPreview && (
        <div className="mt-2 bg-black/40 rounded p-1.5 max-h-16 overflow-y-auto">
          <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap break-all leading-tight">
            {stripAnsi(agentState.lastOutputSnippet).split('\n').slice(-4).join('\n')}
            {status === 'running' && <span className="animate-pulse">▋</span>}
          </pre>
        </div>
      )}

      {/* handoffCount badge */}
      {agentState?.handoffCount > 0 && !isDropPreview && (
        <div className="mt-1 text-xs text-blue-300">
          {agentState.handoffCount} handoff{agentState.handoffCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Bottom handle — sends handoffs to other agents */}
      {!isDropPreview && (
        <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !border-blue-600" />
      )}
    </div>
  );
}
