// client/src/canvas/AgentInspector.jsx
// Side panel for inspecting and editing agent node configuration.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { stripAnsi } from '../utils/stripAnsi';
import { inspectControlTokens } from '../utils/controlTokens';
import { isStructuredSpawnMode } from '../utils/runtimeModes.js';

const MODEL_OPTIONS = [
  { group: 'Claude', models: ['opus', 'sonnet', 'haiku'] },
  { group: 'Codex', models: ['gpt-5.4', 'gpt-5.1-codex', 'gpt-4.1-codex'] },
  { group: 'Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
];

const CLAUDE_TOOL_OPTIONS = [
  'Bash',
  'Read',
  'Edit',
  'MultiEdit',
  'Write',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'NotebookRead',
  'NotebookEdit',
  'TodoRead',
  'TodoWrite',
  'Agent',
  'exit_plan_mode',
];

const DEFAULT_CLAUDE_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'LS'];

const INPUT_CLS =
  'w-full bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none';

function isClaudeModel(model = '') {
  const normalized = String(model ?? '').trim().toLowerCase();
  return normalized === 'opus'
    || normalized === 'sonnet'
    || normalized === 'haiku'
    || normalized.startsWith('claude-');
}

function normalizeClaudeToolSelection(tools) {
  if (!Array.isArray(tools)) return [...DEFAULT_CLAUDE_TOOLS];
  const selected = new Set(tools.filter((tool) => CLAUDE_TOOL_OPTIONS.includes(tool)));
  return CLAUDE_TOOL_OPTIONS.filter((tool) => selected.has(tool));
}

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
  const isClaude = isClaudeModel(data.model);

  const commit = useCallback(
    (field) => (val) => onUpdateNode(nodeId, { [field]: val }),
    [nodeId, onUpdateNode]
  );

  const [promptLocal, setPromptLocal] = useDebouncedField(
    data.systemPrompt,
    commit('systemPrompt')
  );
  const [selectedTools, setSelectedTools] = useState(() => normalizeClaudeToolSelection(data.tools));
  const toolsTimerRef = useRef(null);

  useEffect(() => {
    setSelectedTools(normalizeClaudeToolSelection(data.tools));
  }, [data.tools, data.model]);

  useEffect(() => () => clearTimeout(toolsTimerRef.current), []);

  const commitTools = useCallback((tools) => {
    clearTimeout(toolsTimerRef.current);
    toolsTimerRef.current = setTimeout(() => {
      onUpdateNode(nodeId, { tools });
    }, 300);
  }, [nodeId, onUpdateNode]);

  const updateSelectedTools = useCallback((tools) => {
    const normalizedTools = normalizeClaudeToolSelection(tools);
    setSelectedTools(normalizedTools);
    commitTools(normalizedTools);
  }, [commitTools]);

  const toggleTool = useCallback((toolName) => {
    const nextTools = selectedTools.includes(toolName)
      ? selectedTools.filter((tool) => tool !== toolName)
      : [...selectedTools, toolName];
    updateSelectedTools(nextTools);
  }, [selectedTools, updateSelectedTools]);

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

      {isClaude && (
        <CollapsibleSection title="Tools" defaultOpen={false}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Allowed Tools</FieldLabel>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateSelectedTools([...CLAUDE_TOOL_OPTIONS])}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => updateSelectedTools([])}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Deselect All
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CLAUDE_TOOL_OPTIONS.map((toolName) => (
              <label
                key={toolName}
                className="flex items-center gap-2 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTools.includes(toolName)}
                  onChange={() => toggleTool(toolName)}
                  className="accent-blue-500"
                />
                <span className="break-all">{toolName}</span>
              </label>
            ))}
          </div>
          <div className="text-[10px] text-gray-500">
            Debounced 300ms. Default Claude selection: {DEFAULT_CLAUDE_TOOLS.join(', ')}.
          </div>
        </CollapsibleSection>
      )}

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

      {/* Start Node */}
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={!!data.isTriageNode}
          onChange={(e) => onUpdateNode(nodeId, { isTriageNode: e.target.checked })}
          className="accent-blue-500"
        />
        Start Node
      </label>
      <div className="text-[10px] text-gray-500 -mt-1">
        All start nodes run immediately. Mark multiple agents to launch parallel branches together.
      </div>

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

function ConditionalFields({ node, nodes, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const rules = data.rules || [];

  const addRule = () => {
    const updated = [...rules, { condition: '', targetNodeId: '' }];
    onUpdateNode(nodeId, { rules: updated });
  };

  const removeRule = (idx) => {
    const updated = rules.filter((_, i) => i !== idx);
    onUpdateNode(nodeId, { rules: updated });
  };

  const updateRule = (idx, field, value) => {
    const updated = rules.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
    onUpdateNode(nodeId, { rules: updated });
  };

  const targetableNodes = nodes.filter((n) => n.id !== nodeId);

  return (
    <CollapsibleSection title="Conditional Rules">
      {rules.map((rule, idx) => (
        <div key={idx} className="bg-gray-800 rounded p-2 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <FieldLabel>Rule {idx + 1}</FieldLabel>
            <button
              onClick={() => removeRule(idx)}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              Remove
            </button>
          </div>
          <input
            type="text"
            className={INPUT_CLS}
            value={rule.condition}
            onChange={(e) => updateRule(idx, 'condition', e.target.value)}
            placeholder="Condition expression"
          />
          <select
            className={INPUT_CLS}
            value={rule.targetNodeId || ''}
            onChange={(e) => updateRule(idx, 'targetNodeId', e.target.value)}
          >
            <option value="">— target node —</option>
            {targetableNodes.map((n) => (
              <option key={n.id} value={n.id}>{n.data?.label || n.id}</option>
            ))}
          </select>
        </div>
      ))}
      <button
        onClick={addRule}
        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        + Add Rule
      </button>

      <div className="flex flex-col gap-0.5 mt-1">
        <FieldLabel>Default Target</FieldLabel>
        <select
          className={INPUT_CLS}
          value={data.defaultTargetNodeId || ''}
          onChange={(e) => onUpdateNode(nodeId, { defaultTargetNodeId: e.target.value })}
        >
          <option value="">— none —</option>
          {targetableNodes.map((n) => (
            <option key={n.id} value={n.id}>{n.data?.label || n.id}</option>
          ))}
        </select>
      </div>
    </CollapsibleSection>
  );
}

function MergeFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const waitFor = data.waitFor ?? 'all';
  const isNumber = typeof waitFor === 'number' || (typeof waitFor === 'string' && !['all', 'any'].includes(waitFor));

  return (
    <CollapsibleSection title="Configuration">
      <FieldLabel>Wait For</FieldLabel>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="radio"
            name={`merge-wait-${nodeId}`}
            checked={waitFor === 'all'}
            onChange={() => onUpdateNode(nodeId, { waitFor: 'all' })}
            className="accent-cyan-500"
          />
          All inputs
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="radio"
            name={`merge-wait-${nodeId}`}
            checked={waitFor === 'any'}
            onChange={() => onUpdateNode(nodeId, { waitFor: 'any' })}
            className="accent-cyan-500"
          />
          Any input
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="radio"
            name={`merge-wait-${nodeId}`}
            checked={isNumber}
            onChange={() => onUpdateNode(nodeId, { waitFor: 2 })}
            className="accent-cyan-500"
          />
          Specific count
        </label>
        {isNumber && (
          <input
            type="number"
            className={INPUT_CLS}
            min={1}
            max={20}
            value={typeof waitFor === 'number' ? waitFor : 2}
            onChange={(e) => onUpdateNode(nodeId, { waitFor: Number(e.target.value) })}
          />
        )}
      </div>
    </CollapsibleSection>
  );
}

function DelayFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};

  return (
    <CollapsibleSection title="Configuration">
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Delay (seconds)</FieldLabel>
        <input
          type="number"
          className={INPUT_CLS}
          min={1}
          max={3600}
          value={data.delaySeconds ?? 30}
          onChange={(e) => onUpdateNode(nodeId, { delaySeconds: Number(e.target.value) })}
        />
        <span className="text-[10px] text-gray-500">1 – 3600 seconds</span>
      </div>
    </CollapsibleSection>
  );
}

function LoopFields({ node, nodes, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const targetableNodes = nodes.filter((n) => n.id !== nodeId);

  const commit = useCallback(
    (field) => (val) => onUpdateNode(nodeId, { [field]: val }),
    [nodeId, onUpdateNode]
  );

  const [exitCondLocal, setExitCondLocal] = useDebouncedField(
    data.exitCondition,
    commit('exitCondition')
  );

  return (
    <CollapsibleSection title="Configuration">
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Max Iterations</FieldLabel>
        <input
          type="number"
          className={INPUT_CLS}
          min={1}
          max={100}
          value={data.maxIterations ?? 10}
          onChange={(e) => onUpdateNode(nodeId, { maxIterations: Number(e.target.value) })}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <FieldLabel>Exit Condition</FieldLabel>
        <input
          type="text"
          className={INPUT_CLS}
          value={exitCondLocal}
          onChange={(e) => setExitCondLocal(e.target.value)}
          placeholder="e.g. result.status === 'done'"
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <FieldLabel>Exit Target Node</FieldLabel>
        <select
          className={INPUT_CLS}
          value={data.exitTargetNodeId || ''}
          onChange={(e) => onUpdateNode(nodeId, { exitTargetNodeId: e.target.value })}
        >
          <option value="">— none —</option>
          {targetableNodes.map((n) => (
            <option key={n.id} value={n.id}>{n.data?.label || n.id}</option>
          ))}
        </select>
      </div>
    </CollapsibleSection>
  );
}

function ErrorHandlerFields({ node, nodes, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const watchedNodes = data.watchedNodes || [];
  const watchableNodes = nodes.filter((n) => n.id !== nodeId && n.type !== 'errorHandler');

  const toggleWatch = (targetId) => {
    const updated = watchedNodes.includes(targetId)
      ? watchedNodes.filter((id) => id !== targetId)
      : [...watchedNodes, targetId];
    onUpdateNode(nodeId, { watchedNodes: updated });
  };

  return (
    <CollapsibleSection title="Watched Nodes">
      {watchableNodes.length === 0 && (
        <span className="text-xs text-gray-500">No other nodes in workflow</span>
      )}
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {watchableNodes.map((n) => (
          <label key={n.id} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={watchedNodes.includes(n.id)}
              onChange={() => toggleWatch(n.id)}
              className="accent-red-500"
            />
            {n.data?.label || n.id}
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function SubWorkflowFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};

  // Workflow list would come from useWorkflowList() hook in a full implementation.
  // For now, provide a text input for workflow ID.
  return (
    <CollapsibleSection title="Configuration">
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Workflow ID</FieldLabel>
        <input
          type="text"
          className={INPUT_CLS}
          value={data.workflowId || ''}
          onChange={(e) => onUpdateNode(nodeId, { workflowId: e.target.value })}
          placeholder="Enter workflow ID"
        />
      </div>
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
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);

  const selectedNode = nodes?.find((n) => n.id === selectedNodeId);
  const tokenSemantics = inspectControlTokens(agentState?.lastOutputSnippet);

  if (!selectedNodeId || !selectedNode) {
    return null;
  }

  const nodeType = selectedNode.type || 'agent';

  return (
    <div className="w-[19rem] min-w-[19rem] shrink-0 bg-gray-900 border-l border-gray-700 p-4 text-white text-sm flex flex-col gap-3 overflow-y-auto">
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
      {nodeType === 'conditional' && (
        <ConditionalFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'merge' && (
        <MergeFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'delay' && (
        <DelayFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'loop' && (
        <LoopFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'errorHandler' && (
        <ErrorHandlerFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {nodeType === 'subWorkflow' && (
        <SubWorkflowFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}

      {/* Open Terminal button — only when agent has an active session */}
      {selectedNode?.id && !isStructuredSpawnMode(agentState?.spawnMode) && (agentState?.sessionId || activeExecutionId) && (
        <button
          onClick={() => setPtyExplosionNodeId(selectedNode.id)}
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
