// client/src/canvas/AgentInspector.jsx
// Side panel for inspecting and editing agent node configuration.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { stripAnsi } from '../utils/stripAnsi';
import { inspectControlTokens } from '../utils/controlTokens';

const MODEL_OPTIONS = [
  { group: 'Claude', models: ['opus', 'sonnet', 'haiku'] },
  { group: 'Codex', models: ['gpt-5.4', 'gpt-5.1-codex', 'gpt-4.1-codex'] },
  { group: 'Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
];

const INPUT_CLS =
  'w-full bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none';

/**
 * Debounced field updater — returns a [localValue, setLocalValue] pair
 * that syncs back to the canvas after `delay` ms of inactivity.
 */
function useDebouncedField(nodeValue, onCommit, delay = 300) {
  const [local, setLocal] = useState(nodeValue ?? '');
  const timerRef = useRef(null);

  // Sync from external when selection changes
  useEffect(() => {
    setLocal(nodeValue ?? '');
  }, [nodeValue]);

  const onChange = useCallback(
    (val) => {
      setLocal(val);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onCommit(val), delay);
    },
    [onCommit, delay]
  );

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [local, onChange];
}

/* ------------------------------------------------------------------ */
/*  Section wrappers                                                   */
/* ------------------------------------------------------------------ */

function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span className="text-[10px]">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="flex flex-col gap-2 pl-1">{children}</div>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="text-[11px] text-gray-400">{children}</label>;
}

/* ------------------------------------------------------------------ */
/*  Per-type edit sections                                             */
/* ------------------------------------------------------------------ */

function AgentFields({ node, nodes, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};

  const commit = useCallback(
    (field) => (val) => onUpdateNode(nodeId, { [field]: val }),
    [nodeId, onUpdateNode]
  );

  const [promptLocal, setPromptLocal] = useDebouncedField(
    data.systemPrompt,
    commit('systemPrompt')
  );

  const [toolsLocal, setToolsLocal] = useDebouncedField(
    data.tools?.join(', ') ?? '',
    useCallback(
      (val) => {
        const arr = val
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        onUpdateNode(nodeId, { tools: arr });
      },
      [nodeId, onUpdateNode]
    )
  );

  const departmentNodes = nodes.filter((n) => n.type === 'department');

  return (
    <CollapsibleSection title="Configuration">
      {/* Model */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Model</FieldLabel>
        <select
          className={INPUT_CLS}
          value={data.model || ''}
          onChange={(e) => onUpdateNode(nodeId, { model: e.target.value })}
        >
          <option value="">— select —</option>
          {MODEL_OPTIONS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* System Prompt */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>System Prompt</FieldLabel>
        <textarea
          className={`${INPUT_CLS} font-mono resize-y`}
          rows={4}
          style={{ minHeight: '4rem', maxHeight: '20rem' }}
          value={promptLocal}
          onChange={(e) => setPromptLocal(e.target.value)}
        />
      </div>

      {/* Tools */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Tools (comma-separated)</FieldLabel>
        <input
          type="text"
          className={INPUT_CLS}
          value={toolsLocal}
          onChange={(e) => setToolsLocal(e.target.value)}
          placeholder="tool1, tool2"
        />
      </div>

      {/* Max Turns */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Max Turns</FieldLabel>
        <input
          type="number"
          className={INPUT_CLS}
          min={0}
          max={100}
          value={data.maxTurns ?? ''}
          onChange={(e) =>
            onUpdateNode(nodeId, {
              maxTurns: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
      </div>

      {/* Triage Node */}
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={!!data.isTriageNode}
          onChange={(e) => onUpdateNode(nodeId, { isTriageNode: e.target.checked })}
          className="accent-blue-500"
        />
        Triage Node
      </label>

      {/* Parent Department */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Department</FieldLabel>
        <select
          className={INPUT_CLS}
          value={data.parentDepartmentId || ''}
          onChange={(e) =>
            onUpdateNode(nodeId, {
              parentDepartmentId: e.target.value || undefined,
            })
          }
        >
          <option value="">None</option>
          {departmentNodes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.data?.label || d.id}
            </option>
          ))}
        </select>
      </div>
    </CollapsibleSection>
  );
}

function DepartmentFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};

  return (
    <CollapsibleSection title="Configuration">
      {/* Color */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Color</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={data.color || '#6366f1'}
            onChange={(e) => onUpdateNode(nodeId, { color: e.target.value })}
            className="w-8 h-6 rounded border border-gray-600 bg-gray-700 cursor-pointer"
          />
          <input
            type="text"
            className={INPUT_CLS}
            value={data.color || '#6366f1'}
            onChange={(e) => onUpdateNode(nodeId, { color: e.target.value })}
          />
        </div>
      </div>

      {/* Collapsed */}
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={!!data.collapsed}
          onChange={(e) => onUpdateNode(nodeId, { collapsed: e.target.checked })}
          className="accent-blue-500"
        />
        Collapsed
      </label>
    </CollapsibleSection>
  );
}

function TriggerFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const triggerType = data.triggerType || 'webhook';

  return (
    <CollapsibleSection title="Configuration">
      {/* Trigger Type */}
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Trigger Type</FieldLabel>
        <select
          className={INPUT_CLS}
          value={triggerType}
          onChange={(e) => onUpdateNode(nodeId, { triggerType: e.target.value })}
        >
          <option value="webhook">Webhook</option>
          <option value="rss">RSS</option>
        </select>
      </div>

      {/* Webhook fields */}
      {triggerType === 'webhook' && (
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Webhook Path</FieldLabel>
          <input
            type="text"
            className={INPUT_CLS}
            value={data.webhookPath || ''}
            onChange={(e) => onUpdateNode(nodeId, { webhookPath: e.target.value })}
            placeholder="/hooks/my-webhook"
          />
        </div>
      )}

      {/* RSS fields */}
      {triggerType === 'rss' && (
        <>
          <div className="flex flex-col gap-0.5">
            <FieldLabel>RSS URL</FieldLabel>
            <input
              type="text"
              className={INPUT_CLS}
              value={data.rssUrl || ''}
              onChange={(e) => onUpdateNode(nodeId, { rssUrl: e.target.value })}
              placeholder="https://example.com/feed.xml"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <FieldLabel>Poll Interval (seconds)</FieldLabel>
            <input
              type="number"
              className={INPUT_CLS}
              min={60}
              value={data.pollIntervalSeconds ?? 300}
              onChange={(e) =>
                onUpdateNode(nodeId, {
                  pollIntervalSeconds: Number(e.target.value),
                })
              }
            />
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Execution Info section with live timer                             */
/* ------------------------------------------------------------------ */

function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms) {
  if (ms < 0 || !Number.isFinite(ms)) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ${sec}s`;
}

function ExecutionInfo({ timestamps, status }) {
  const [now, setNow] = useState(Date.now());
  const isRunning = status === 'running';

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const started = timestamps?.started;
  const done = timestamps?.done;
  const errTime = timestamps?.error;
  const endTime = done || errTime;

  const durationMs = started
    ? (endTime ? new Date(endTime).getTime() : now) - new Date(started).getTime()
    : null;

  return (
    <CollapsibleSection title="Execution Info">
      <div className="bg-gray-800 rounded p-2 text-xs flex flex-col gap-1.5">
        <div className="flex justify-between">
          <span className="text-gray-400">Started</span>
          <span className="text-white">{formatTime(started)}</span>
        </div>
        {durationMs !== null && (
          <div className="flex justify-between">
            <span className="text-gray-400">Duration</span>
            <span className={isRunning ? 'text-blue-300 tabular-nums' : 'text-white'}>
              {formatDuration(durationMs)}{isRunning ? ' ...' : ''}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className="capitalize text-white">{status}</span>
        </div>
      </div>
    </CollapsibleSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Inspector                                                     */
/* ------------------------------------------------------------------ */

export default function AgentInspector({ nodes, onUpdateNode }) {
  const selectedNodeId = useSwarmStore((s) => s.selectedNodeId);
  const agentState = useSwarmStore((s) => s.agentStates[selectedNodeId]);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);

  const selectedNode = nodes?.find((n) => n.id === selectedNodeId);
  const tokenSemantics = inspectControlTokens(agentState?.lastOutputSnippet);

  if (!selectedNodeId || !selectedNode) {
    return (
      <div className="w-72 bg-gray-900 border-l border-gray-700 p-4 text-gray-400 text-sm flex items-center justify-center">
        <span>Select a node to inspect</span>
      </div>
    );
  }

  const nodeType = selectedNode.type || 'agent';

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-700 p-4 text-white text-sm flex flex-col gap-3 overflow-y-auto">
      {/* Header — editable label */}
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          className="flex-1 bg-gray-800 text-white text-sm font-semibold rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none truncate"
          value={selectedNode.data?.label || ''}
          onChange={(e) => onUpdateNode(selectedNodeId, { label: e.target.value })}
        />
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      {/* Node type badge */}
      <div className="text-xs text-gray-400 capitalize">Type: {nodeType}</div>

      {/* Type-specific editable fields */}
      {nodeType === 'agent' && (
        <AgentFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'department' && (
        <DepartmentFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'trigger' && (
        <TriggerFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}

      {/* Open Terminal button — only when agent has an active session */}
      {agentState?.sessionId && (
        <button
          onClick={() => setPtyExplosionNodeId(agentState.sessionId)}
          className="w-full text-xs px-2 py-1.5 rounded bg-indigo-700 hover:bg-indigo-600 text-white transition-colors flex items-center gap-1.5"
        >
          <span>⌨</span> Open Terminal
        </button>
      )}

      {/* Execution Info — timing data (FR-V5-49/50) */}
      {agentState?.timestamps?.started && (
        <ExecutionInfo timestamps={agentState.timestamps} status={agentState.status} />
      )}

      {/* Live status (from Zustand) */}
      {agentState && (
        <CollapsibleSection title="Live Status">
          <div className="bg-gray-800 rounded p-2 text-xs">
            <div className="text-gray-400 mb-1">Status</div>
            <div className="capitalize font-medium">{agentState.status}</div>
            {agentState.handoffCount > 0 && (
              <div className="text-gray-400 mt-1">
                {agentState.handoffCount} handoffs sent
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Last output snippet */}
      {agentState?.lastOutputSnippet && (
        <CollapsibleSection title="Output" defaultOpen={false}>
          <div className="bg-gray-800 rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto text-green-300">
            {stripAnsi(agentState.lastOutputSnippet)}
          </div>
          {tokenSemantics.notes.length > 0 && (
            <div className="bg-gray-800/80 border border-gray-700 rounded p-2 text-[11px] text-amber-200 flex flex-col gap-1">
              {tokenSemantics.notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}
