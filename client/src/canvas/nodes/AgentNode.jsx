// client/src/canvas/nodes/AgentNode.jsx
// Custom React Flow node for agent visualization in swarm canvas.
import { Handle, Position } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';
import { stripAnsi } from '../../utils/stripAnsi';
import { isStructuredSpawnMode } from '../../utils/runtimeModes';
import { repairTokenSplitting } from '../../utils/repairTokenSpacing';

function formatTokenCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// type: "agent"
export default function AgentNode({ id, data, selected }) {
  const agentState = useSwarmStore((s) => s.agentStates[id]);
  const hasUnviewedOutput = useSwarmStore(
    (s) => !!(s.agentResults[id]?.finalText && !s.agentResults[id]?.viewed)
  );
  const isDropPreview = Boolean(data?.isDropPreview);
  const status = isDropPreview ? 'preview' : agentState?.status ?? 'idle';
  const isStreamJson = isStructuredSpawnMode(agentState?.spawnMode);
  const showThinking = isStreamJson && status === 'running' && agentState?.isThinking;
  const currentToolName = isStreamJson ? agentState?.currentTool?.toolName : null;
  // Support both client-accumulated format (totalCost.costUsd from WS agent_cost events)
  // and server-serialized format (flat totalCostUsd from getStatus/reconciliation).
  const totalCostUsd = Number(agentState?.totalCost?.costUsd ?? agentState?.totalCostUsd ?? 0);
  const showCostBadge = Number.isFinite(totalCostUsd) && totalCostUsd > 0;

  const inputTokens = Number(agentState?.totalCost?.inputTokens ?? agentState?.totalInputTokens ?? 0);
  const outputTokens = Number(agentState?.totalCost?.outputTokens ?? agentState?.totalOutputTokens ?? 0);
  const cacheRead = Number(agentState?.totalCost?.cacheReadTokens ?? 0);
  const cacheWrite = Number(agentState?.totalCost?.cacheWriteTokens ?? 0);
  const totalTokens = inputTokens + outputTokens;

  // Status -> color mapping
  const statusColors = {
    idle: 'border-gray-400 bg-gray-800',
    running: 'border-blue-400 bg-blue-950 animate-pulse',
    done: 'border-green-400 bg-green-950',
    paused: 'border-orange-400 bg-orange-950',
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

      {/* Validation warning badge - empty system prompt (FR-V5-45) */}
      {!isDropPreview && !data?.systemPrompt?.trim() && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[10px] text-black font-bold z-10"
          title="Empty system prompt"
        >
          !
        </div>
      )}

      {/* Unviewed output badge - pulsing blue dot (top-left) */}
      {!isDropPreview && hasUnviewedOutput && ['done', 'idle', 'completed', 'stopped'].includes(status) && (
        <div
          className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-blue-500 rounded-full animate-pulse border border-blue-300 shadow-[0_0_6px_rgba(59,130,246,0.6)] z-10"
          title="Output ready - click to view"
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

      {showThinking && !isDropPreview && (
        <div className="mt-2 text-[11px] italic text-amber-300 animate-bounce">
          Thinking...
        </div>
      )}

      {currentToolName && !isDropPreview && (
        <div className="mt-1 text-[11px] text-amber-200">
          Using: {currentToolName}
        </div>
      )}

      {/* Node snippet - prefer clean chat message (Option B) over raw PTY */}
      {(agentState?.lastChatSnippet || agentState?.lastOutputSnippet) && !isDropPreview && (() => {
        const rawSnippet = agentState.lastChatSnippet || stripAnsi(agentState.lastOutputSnippet);
        const truncated = rawSnippet.split('\n').slice(-8).join('\n');
        const displayText = isStructuredSpawnMode(agentState?.spawnMode) ? truncated : repairTokenSplitting(truncated);
        return (
          <div className="mt-2 bg-black/40 rounded p-1.5 max-h-36 overflow-y-auto">
            <pre className="text-[11px] text-green-300 font-mono whitespace-pre-wrap break-words leading-normal">
              {displayText}
              {status === 'running' && <span className="animate-pulse">▋</span>}
            </pre>
          </div>
        );
      })()}

      {/* handoffCount badge */}
      {agentState?.handoffCount > 0 && !isDropPreview && (
        <div className="mt-1 text-xs text-blue-300">
          {agentState.handoffCount} handoff{agentState.handoffCount !== 1 ? 's' : ''}
        </div>
      )}

      {showCostBadge && !isDropPreview && (
        <div className="group/cost absolute bottom-2 right-2">
          <div className="rounded-full border border-emerald-400/50 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 cursor-default">
            ${totalCostUsd.toFixed(2)}
          </div>
          <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden w-max max-w-[200px] rounded-md border border-emerald-400/40 bg-gray-900/95 px-2.5 py-1.5 text-[10px] leading-[1.6] text-gray-200 shadow-lg backdrop-blur-sm group-hover/cost:block z-50">
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Input</span>
              <span className="font-medium text-emerald-300">{formatTokenCount(inputTokens)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Output</span>
              <span className="font-medium text-emerald-300">{formatTokenCount(outputTokens)}</span>
            </div>
            <div className="mt-0.5 border-t border-gray-700/60 pt-0.5 flex justify-between gap-3">
              <span className="text-gray-400 font-semibold">Total</span>
              <span className="font-semibold text-white">{formatTokenCount(totalTokens)}</span>
            </div>
            {(cacheRead > 0 || cacheWrite > 0) && (
              <div className="mt-0.5 border-t border-gray-700/60 pt-0.5 text-gray-500">
                {cacheRead > 0 && <div>Cache read: {formatTokenCount(cacheRead)}</div>}
                {cacheWrite > 0 && <div>Cache write: {formatTokenCount(cacheWrite)}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom handle - sends handoffs to other agents */}
      {!isDropPreview && (
        <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !border-blue-600" />
      )}
    </div>
  );
}
