// client/src/canvas/nodes/AgentNode.jsx
// Custom React Flow node for agent visualization in swarm canvas.
import { Handle, Position } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';

// type: "agent"
export default function AgentNode({ id, data, selected }) {
  const agentState = useSwarmStore((s) => s.agentStates[id]);
  const status = agentState?.status ?? 'idle';

  // Status → color mapping
  const statusColors = {
    idle: 'border-gray-400 bg-gray-800',
    running: 'border-blue-400 bg-blue-950 animate-pulse',
    done: 'border-green-400 bg-green-950',
    paused: 'border-yellow-400 bg-yellow-950',
    error: 'border-red-400 bg-red-950',
  };
  const colorClass = statusColors[status] || statusColors.idle;

  return (
    <div
      className={`rounded-lg border-2 p-3 min-w-[160px] max-w-[220px] text-white text-sm
        ${colorClass}
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        cursor-pointer transition-all duration-200`}
    >
      {/* Top handle — accepts handoffs from other agents */}
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !border-gray-600" />

      {/* Agent icon + name */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="agent">🤖</span>
        <span className="font-semibold truncate">{data.label || 'Agent'}</span>
      </div>

      {/* Status badge */}
      <div className="text-xs text-gray-300 capitalize">{status}</div>

      {/* lastOutputSnippet — micro log (3 lines max, truncated) */}
      {agentState?.lastOutputSnippet && (
        <div className="mt-2 text-xs text-gray-400 font-mono truncate overflow-hidden"
             style={{ maxHeight: '3.6em', lineHeight: '1.2em' }}>
          {agentState.lastOutputSnippet.split('\n').slice(-3).join('\n')}
        </div>
      )}

      {/* handoffCount badge */}
      {agentState?.handoffCount > 0 && (
        <div className="mt-1 text-xs text-blue-300">
          {agentState.handoffCount} handoff{agentState.handoffCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Bottom handle — sends handoffs to other agents */}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !border-blue-600" />
    </div>
  );
}
