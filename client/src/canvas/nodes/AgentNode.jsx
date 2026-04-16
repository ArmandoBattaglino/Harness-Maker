// client/src/canvas/nodes/AgentNode.jsx
// Custom React Flow node for agent visualization in swarm canvas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSwarmStore } from '../../store/SwarmContext';
import { stripAnsi } from '../../utils/stripAnsi';
import { isStructuredSpawnMode } from '../../utils/runtimeModes';
import { repairTokenSplitting } from '../../utils/repairTokenSpacing';
import NodeActionMenu from './NodeActionMenu';
import NodeOutputCard from './NodeOutputCard';
import { useCanvasActions } from '../CanvasActionsContext';
import { getModelContextLimit } from '../../utils/modelContextLimits';
import NodeValidationCard from './NodeValidationCard';
import PromptBlockEditor from './PromptBlockEditor';

function formatTokenCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function extractTickerLine(snippet, spawnMode) {
  if (!snippet) return '';
  const cleaned = stripAnsi(snippet);
  const repaired = isStructuredSpawnMode(spawnMode) ? cleaned : repairTokenSplitting(cleaned);
  const lines = repaired.split('\n').filter((l) => l.trim());
  const last = lines[lines.length - 1] || '';
  return last.length > 80 ? last.slice(0, 77) + '...' : last;
}

function getIssueReviewLabel(count) {
  return `${count} issue${count === 1 ? '' : 's'} — click to review`;
}

// type: "agent"
export default function AgentNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }) {
  const agentState = useSwarmStore((s) => s.agentStates[id]);
  const hasUnviewedOutput = useSwarmStore(
    (s) => !!(s.agentResults[id]?.finalText && !s.agentResults[id]?.viewed)
  );
  const hasOutput = useSwarmStore((s) => !!s.agentResults[id]?.finalText);
  const markViewed = useSwarmStore((s) => s.markAgentResultViewed);
  const setChatFilter = useSwarmStore((s) => s.setChatFilter);
  const setSidePanelMode = useSwarmStore((s) => s.setSidePanelMode);
  const setSidePanelOpen = useSwarmStore((s) => s.setSidePanelOpen);
  const expandedOutputNodeId = useSwarmStore((s) => s.expandedOutputNodeId);
  const setExpandedOutputNodeId = useSwarmStore((s) => s.setExpandedOutputNodeId);
  const expandedValidationNodeId = useSwarmStore((s) => s.expandedValidationNodeId);
  const setExpandedValidationNodeId = useSwarmStore((s) => s.setExpandedValidationNodeId);
  const expandedPromptEditorNodeId = useSwarmStore((s) => s.expandedPromptEditorNodeId);
  const setExpandedPromptEditorNodeId = useSwarmStore((s) => s.setExpandedPromptEditorNodeId);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const validationIssues = useSwarmStore((s) => s.agentValidationIssuesByNodeId[id] || []);
  const canvasActions = useCanvasActions();
  const isDropPreview = Boolean(data?.isDropPreview);
  const showOutputCard = expandedOutputNodeId === id && !isDropPreview;
  const showValidationCard = expandedValidationNodeId === id && !isDropPreview;
  const showPromptEditor = expandedPromptEditorNodeId === id && !isDropPreview;
  const status = isDropPreview ? 'preview' : agentState?.status ?? 'idle';
  const isStreamJson = isStructuredSpawnMode(agentState?.spawnMode);
  const showThinking = isStreamJson && status === 'running' && agentState?.isThinking;
  const currentToolName = isStreamJson ? agentState?.currentTool?.toolName : null;
  const totalCostUsd = Number(agentState?.totalCost?.costUsd ?? agentState?.totalCostUsd ?? 0);
  const showCostBadge = Number.isFinite(totalCostUsd) && totalCostUsd > 0;
  const validationIssueCount = validationIssues.length;

  const inputTokens = Number(agentState?.totalCost?.inputTokens ?? agentState?.totalInputTokens ?? 0);
  const outputTokens = Number(agentState?.totalCost?.outputTokens ?? agentState?.totalOutputTokens ?? 0);
  const cacheRead = Number(agentState?.totalCost?.cacheReadTokens ?? 0);
  const cacheWrite = Number(agentState?.totalCost?.cacheWriteTokens ?? 0);
  const totalTokens = inputTokens + outputTokens;

  const turnCost = agentState?.turnCost;
  const runtimeProvider = agentState?.runtimeProvider ?? agentState?.provider;
  const contextLimit = getModelContextLimit(data.model, runtimeProvider);
  const contextUsed = (turnCost?.inputTokens ?? 0) + (turnCost?.cacheReadTokens ?? 0) + (turnCost?.cacheWriteTokens ?? 0);
  const contextPct = contextLimit && contextUsed > 0
    ? Math.min((contextUsed / contextLimit) * 100, 100)
    : null;
  const nodeLabel = data.label || 'Agent';

  // --- Live reasoning ticker ---
  const rawSnippet = agentState?.lastChatSnippet || agentState?.lastOutputSnippet || '';
  const [tickerText, setTickerText] = useState('');
  const [tickerVisible, setTickerVisible] = useState(false);
  const tickerTimeoutRef = useRef(null);
  const prevSnippetRef = useRef('');

  useEffect(() => {
    const line = extractTickerLine(rawSnippet, agentState?.spawnMode);
    if (!line || line === prevSnippetRef.current) return;
    prevSnippetRef.current = line;

    setTickerText(line);
    setTickerVisible(true);

    if (tickerTimeoutRef.current) clearTimeout(tickerTimeoutRef.current);
    tickerTimeoutRef.current = setTimeout(() => {
      setTickerVisible(false);
    }, 4000);

    return () => {
      if (tickerTimeoutRef.current) clearTimeout(tickerTimeoutRef.current);
    };
  }, [rawSnippet, agentState?.spawnMode]);

  // Clear ticker when agent finishes
  useEffect(() => {
    if (status !== 'running') {
      setTickerVisible(false);
      prevSnippetRef.current = '';
    }
  }, [status]);

  // Status -> color mapping
  const statusColors = {
    idle: 'border-gray-400 bg-gray-800',
    running: 'border-blue-400 bg-blue-950 animate-pulse',
    done: 'border-green-400 bg-green-950',
    paused: 'border-orange-400 bg-orange-950',
    error: 'border-red-400 bg-red-950',
    preview: 'border-sky-400/80 bg-sky-950/40 border-dashed',
    maxTurns_reached: 'border-amber-400 bg-amber-950',
    retrying: 'border-yellow-400 bg-yellow-950 animate-pulse',
  };
  const colorClass = statusColors[status] || statusColors.idle;

  const handleDotClick = useCallback((e) => {
    e.stopPropagation();
    canvasActions?.onViewOutput(id);
    markViewed(id);
  }, [canvasActions, id, markViewed]);

  const handleValidationClick = useCallback((event) => {
    event.stopPropagation();
    setExpandedValidationNodeId(id);
  }, [id, setExpandedValidationNodeId]);

  const handleGearClick = useCallback((event) => {
    event.stopPropagation();
    setExpandedPromptEditorNodeId(id);
  }, [id, setExpandedPromptEditorNodeId]);

  const handlePromptFieldChange = useCallback((field, value) => {
    canvasActions?.onUpdateNode?.(id, { [field]: value });
  }, [canvasActions, id]);

  const menuActions = useMemo(() => {
    if (isDropPreview || !canvasActions) return [];
    return [
      {
        label: 'Chat with this Agent',
        icon: '💬',
        onClick: () => {
          setChatFilter(id);
          setSidePanelMode('chat');
          setSidePanelOpen(true);
        },
      },
      {
        label: 'View Output',
        icon: '📄',
        onClick: () => {
          canvasActions.onViewOutput(id);
          markViewed(id);
        },
        disabled: !hasOutput,
      },
      {
        label: 'Edit',
        icon: '✏️',
        onClick: () => canvasActions.onEdit(id),
      },
      {
        label: 'Duplicate',
        icon: '📋',
        onClick: () => canvasActions.onDuplicate(id),
      },
      {
        label: 'Delete',
        icon: '🗑️',
        onClick: () => canvasActions.onDelete(id),
      },
    ];
  }, [isDropPreview, canvasActions, id, hasOutput, markViewed, setChatFilter, setSidePanelMode, setSidePanelOpen]);

  return (
    <div
      className={`group relative rounded-lg border-2 p-3 min-w-[160px] max-w-[220px] text-white text-sm
        ${showCostBadge && !isDropPreview ? 'pb-8' : 'pb-3'}
        ${colorClass}
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : ''}
        ${isDropPreview ? 'pointer-events-none shadow-[0_0_0_1px_rgba(125,211,252,0.25)]' : 'cursor-pointer'}
        transition-all duration-200`}
    >
      {!isDropPreview && (
        <Handle type="target" position={Position.Top} className="!bg-gray-400 !border-gray-600" />
      )}

      {/* Gear icon — prompt block editor toggle */}
      {!isDropPreview && (
        <button
          onClick={handleGearClick}
          className={`absolute top-0 right-[calc(100%+6px)] z-20 text-indigo-400 hover:text-indigo-300 transition-opacity ${showPromptEditor ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          title="Prompt Block Editor"
          aria-label="Open prompt block editor"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px]">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Validation warning badge */}
      {!isDropPreview && validationIssueCount > 0 && (
        <button
          onClick={handleValidationClick}
          className="absolute -top-2.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full border-2 z-20 cursor-pointer transition-all bg-amber-500 border-amber-300 text-[10px] font-bold text-amber-950 flex items-center justify-center"
          style={{ animation: 'warningDotGlow 2s ease-in-out infinite' }}
          title={getIssueReviewLabel(validationIssueCount)}
          aria-label={getIssueReviewLabel(validationIssueCount)}
        >
          {validationIssueCount}
        </button>
      )}

      {/* Output-ready dot (improved) — clickable, opens output card */}
      {!isDropPreview && hasOutput && ['done', 'idle', 'completed', 'stopped'].includes(status) && (
        <button
          onClick={handleDotClick}
          className="absolute -top-2.5 -left-2.5 w-[18px] h-[18px] rounded-full border-2 z-20 cursor-pointer transition-all bg-blue-500 border-blue-300"
          style={{
            animation: hasUnviewedOutput ? 'outputDotGlow 2s ease-in-out infinite' : 'none',
          }}
          title={hasUnviewedOutput ? 'New output — click to view' : 'View output'}
          aria-label="View agent output"
        />
      )}

      {/* Agent icon + name */}
      <div className="flex min-w-0 items-center gap-2 mb-1">
        <span className="text-lg" role="img" aria-label="agent">🤖</span>
        <span className="min-w-0 flex-1 truncate font-semibold" title={nodeLabel}>
          {nodeLabel}
        </span>
        {!isDropPreview && menuActions.length > 0 && (
          <NodeActionMenu actions={menuActions} />
        )}
      </div>

      {/* Status badge */}
      <div className="text-xs text-gray-300 capitalize">
        {isDropPreview ? 'Drop preview' : status}
      </div>

      {/* Context window usage bar */}
      {contextPct !== null && !isDropPreview && (
        <div className="mt-1.5" title={`${formatTokenCount(contextUsed)} / ${formatTokenCount(contextLimit)} tokens (${Math.round(contextPct)}%)`}>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-[5px] rounded-full bg-gray-600/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  contextPct < 60
                    ? 'bg-emerald-400'
                    : contextPct < 85
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                }`}
                style={{ width: `${contextPct}%` }}
              />
            </div>
            <span className={`text-[9px] font-semibold tabular-nums min-w-[28px] text-right ${
              contextPct < 60
                ? 'text-emerald-300'
                : contextPct < 85
                  ? 'text-amber-300'
                  : 'text-red-300'
            }`}>
              {Math.round(contextPct)}%
            </span>
          </div>
          <div className="mt-0.5 text-[8px] tabular-nums text-gray-400 leading-tight">
            {formatTokenCount(contextUsed)} / {formatTokenCount(contextLimit)} tokens
          </div>
        </div>
      )}

      {/* Live reasoning ticker — replaces the old snippet box */}
      {status === 'running' && !isDropPreview && (
        <div className="mt-1.5 h-[18px] overflow-hidden">
          {(showThinking || currentToolName || tickerVisible) && (
            <div
              className="text-[10px] text-blue-300/90 truncate leading-[18px]"
              style={{
                animation: tickerVisible || showThinking || currentToolName
                  ? 'tickerFadeIn 0.3s ease-out'
                  : 'tickerFadeOut 0.3s ease-in forwards',
              }}
            >
              {showThinking
                ? 'Thinking...'
                : currentToolName
                  ? `Using: ${currentToolName}`
                  : tickerText
              }
            </div>
          )}
        </div>
      )}

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

      {/* Bottom handle */}
      {!isDropPreview && (
        <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !border-blue-600" />
      )}

      {/* Floating output card — positioned to the right of the node */}
      {showOutputCard && (
        <NodeOutputCard
          nodeId={id}
          nodeLabel={data.label}
          onClose={() => setExpandedOutputNodeId(null)}
        />
      )}

      {showValidationCard && (
        <NodeValidationCard
          nodeId={id}
          nodeLabel={data.label}
          issues={validationIssues}
          onClose={() => setExpandedValidationNodeId(null)}
        />
      )}

      {/* Floating prompt block editor — positioned to the left of the node */}
      {showPromptEditor && (
        <PromptBlockEditor
          nodeId={id}
          nodeData={data}
          nodePosition={{ x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 }}
          workflowDef={workflowDef}
          onFieldChange={handlePromptFieldChange}
          onClose={() => setExpandedPromptEditorNodeId(null)}
        />
      )}
    </div>
  );
}
