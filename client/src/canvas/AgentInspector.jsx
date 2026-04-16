// client/src/canvas/AgentInspector.jsx
// Side panel for inspecting and editing agent node configuration.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useSwarmStore } from '../store/SwarmContext';
import { inspectControlTokens } from '../utils/controlTokens';
import { mdComponents, sanitizeSchema } from '../utils/markdownComponents.jsx';
import { formatAgentLiveSnippet, getPreferredAgentLiveSnippet } from '../utils/formatAgentOutput.js';
import { getAgentOutputEntries, serializeAgentOutputEntries } from '../utils/agentOutputEntries.js';
import { isVisualInputNode } from '../utils/visualIoContracts.js';

const MODEL_OPTIONS = [
  { group: 'Claude', models: ['opus', 'sonnet', 'haiku'] },
  { group: 'Codex', models: ['gpt-5.4', 'gpt-5.1-codex', 'gpt-4.1-codex'] },
  { group: 'Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
];

const INPUT_CLS =
  'w-full bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none';
const SELECT_OPTIONS = {
  handoffPolicy: ['auto', 'explicit', 'manual-review'],
  errorRetryPolicy: ['none', 'retry-on-error', 'escalate-to-human'],
};

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

function InspectorTabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function HandoffEntry({ handoff }) {
  const timestamp = handoff?.timestamp
    ? new Date(handoff.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/90 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-cyan-300">&rarr; {handoff?.target || 'unknown'}</span>
        {timestamp && <span className="text-gray-500">{timestamp}</span>}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-gray-950 p-2 text-[10px] leading-relaxed text-gray-300">
        {JSON.stringify(handoff?.payload ?? handoff, null, 2)}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-type edit sections                                             */
/* ------------------------------------------------------------------ */

function AgentFields({ node, nodes, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};

  const departmentNodes = nodes.filter((n) => n.type === 'department');

  return (
    <>
      <CollapsibleSection title="Essentials">
        <div className="rounded border border-gray-700 bg-gray-800/60 p-2 text-[10px] text-gray-500">
          Define who this agent is and where it starts in the workflow. Prompt-related fields are now edited in the Prompt Block Editor.
        </div>
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Model</FieldLabel>
          <select
            className={INPUT_CLS}
            value={data.model || ''}
            onChange={(e) => onUpdateNode(nodeId, { model: e.target.value })}
          >
            <option value="">Select model</option>
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

      <CollapsibleSection title="Context Visibility" defaultOpen={false}>
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Context Visibility</FieldLabel>
          <select
            className={INPUT_CLS}
            aria-label="Context Visibility"
            value={data.contextVisibility || 'full'}
            onChange={(e) => onUpdateNode(nodeId, { contextVisibility: e.target.value })}
          >
            <option value="full">Full (awareness + transcript + protocol)</option>
            <option value="minimal">Minimal (last handoff + protocol)</option>
            <option value="roleOnly">Role Only (system prompt + protocol)</option>
          </select>
          <span className="text-[10px] text-gray-500">
            Controls how much workflow context this agent receives
          </span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Runtime & Policies" defaultOpen={false}>
        <div className="rounded border border-gray-700 bg-gray-800/60 p-2 text-[10px] text-gray-500">
          Runtime and policy controls influence execution behavior.
        </div>
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
          <span className="text-[9px] text-gray-500">Limits turns for this agent only. Other agents continue.</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400">
            Handoff policy
            <select
              className={INPUT_CLS}
              aria-label="Handoff policy"
              value={data.handoffPolicy || 'auto'}
              onChange={(e) => onUpdateNode(nodeId, { handoffPolicy: e.target.value })}
            >
              {SELECT_OPTIONS.handoffPolicy.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <span className="text-[9px] text-gray-500">
            {(data.handoffPolicy || 'auto') === 'auto' && 'Handoffs proceed immediately without approval.'}
            {data.handoffPolicy === 'explicit' && 'Only handoffs to connected nodes are allowed. Invented targets are blocked.'}
            {data.handoffPolicy === 'manual-review' && 'Every handoff requires human approval. Approve/Reject/Reroute/Edit in Inbox.'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-400">
            Error/retry policy
            <select
              className={INPUT_CLS}
              aria-label="Error/retry policy"
              value={data.errorRetryPolicy || 'none'}
              onChange={(e) => onUpdateNode(nodeId, { errorRetryPolicy: e.target.value })}
            >
              {SELECT_OPTIONS.errorRetryPolicy.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <span className="text-[9px] text-gray-500">
            {(data.errorRetryPolicy || 'none') === 'none' && 'Agent stops on error.'}
            {data.errorRetryPolicy === 'retry-on-error' && 'Retries with exponential backoff before stopping.'}
            {data.errorRetryPolicy === 'escalate-to-human' && 'Errors require human decision: retry, skip, or halt.'}
          </span>
        </div>
      </CollapsibleSection>
    </>
  );

}

function InputBlockFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const connectedAgents = (workflowDef?.edges ?? [])
    .filter((edge) => edge.source === nodeId)
    .map((edge) => (workflowDef?.nodes ?? []).find((candidate) => candidate.id === edge.target))
    .filter((candidate) => candidate?.type === 'agent');
  const previewPayload = fields.reduce((acc, field) => {
    const key = field?.key || `field_${Object.keys(acc).length + 1}`;
    const type = field?.type || 'text';
    acc[key] = type === 'image'
      ? {
          kind: 'run-image',
          name: 'reference.png',
          mimeType: 'image/png',
          size: 2048,
          note: 'metadata-only in current MVP',
        }
      : type === 'boolean'
        ? false
        : type === 'number' || type === 'integer'
          ? 0
          : type === 'json'
            ? { example: 'value' }
            : type === 'enum'
              ? (Array.isArray(field.options) && field.options[0]) || 'option'
              : `<${type}>`;
    return acc;
  }, {});

  const updateField = (index, patch) => {
    onUpdateNode(nodeId, {
      fields: fields.map((field, fieldIndex) => (
        fieldIndex === index ? { ...field, ...patch } : field
      )),
    });
  };

  const addField = () => {
    const nextIndex = fields.length + 1;
    onUpdateNode(nodeId, {
      fields: [
        ...fields,
        {
          id: `field-${nextIndex}`,
          key: `input_${nextIndex}`,
          label: `Input ${nextIndex}`,
          type: 'text',
          required: false,
          defaultValue: '',
          helpText: '',
          options: [],
        },
      ],
    });
  };

  const removeField = (index) => {
    onUpdateNode(nodeId, {
      fields: fields.filter((_, fieldIndex) => fieldIndex !== index),
    });
  };

  return (
    <CollapsibleSection title="Input Block">
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Prompt</FieldLabel>
        <textarea
          className={`${INPUT_CLS} resize-y`}
          rows={2}
          value={data.prompt || ''}
          onChange={(e) => onUpdateNode(nodeId, { prompt: e.target.value })}
          placeholder="Question shown at workflow start"
        />
      </div>
      {fields.map((field, index) => (
        <div key={field.id || index} className="rounded border border-gray-700 bg-gray-800/60 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-gray-300">Field {index + 1}</span>
            <button
              type="button"
              onClick={() => removeField(index)}
              className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-600"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-400">
              Key
              <input
                className={INPUT_CLS}
                value={field.key || ''}
                onChange={(e) => updateField(index, { key: e.target.value })}
              />
            </label>
            <label className="text-[11px] text-gray-400">
              Type
              <select
                className={INPUT_CLS}
                value={field.type || 'text'}
                onChange={(e) => updateField(index, { type: e.target.value })}
              >
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
                <option value="enum">Enum</option>
                <option value="number">Number</option>
                <option value="integer">Integer</option>
                <option value="boolean">Boolean</option>
                <option value="image">Image</option>
              </select>
            </label>
          </div>
          <label className="mt-2 block text-[11px] text-gray-400">
            Label
            <input
              className={INPUT_CLS}
              value={field.label || ''}
              onChange={(e) => updateField(index, { label: e.target.value })}
            />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={(e) => updateField(index, { required: e.target.checked })}
              className="accent-blue-500"
            />
            Required
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={addField}
        className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-[11px] font-medium text-gray-300 hover:bg-gray-700"
      >
        Add field
      </button>
      <div className="rounded border border-emerald-700/40 bg-emerald-950/20 p-2 text-[11px] text-emerald-100/90">
        <div className="font-semibold">What the agent receives</div>
        <div className="mt-1 text-[10px] text-emerald-100/70">
          Operator prompt: {data.prompt?.trim() || 'No prompt set.'}
        </div>
        <div className="mt-1 text-[10px] text-emerald-100/70">
          Connected agents: {connectedAgents.length > 0 ? connectedAgents.map((agent) => agent.data?.label || agent.id).join(', ') : 'No connected agents yet'}
        </div>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-emerald-900/60 bg-gray-950 p-2 text-[10px] text-emerald-100/90">{JSON.stringify(previewPayload, null, 2)}</pre>
      </div>
    </CollapsibleSection>
  );
}

function OutputExtractorFields({ node, onUpdateNode }) {
  const nodeId = node.id;
  const data = node.data || {};
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const incomingAgents = (workflowDef?.edges ?? [])
    .filter((edge) => edge.target === nodeId)
    .map((edge) => (workflowDef?.nodes ?? []).find((candidate) => candidate.id === edge.source))
    .filter((candidate) => candidate?.type === 'agent');
  const sourcePolicyLabel = {
    allIncoming: 'Uses all connected upstream agent outputs.',
    firstIncoming: 'Uses only the first connected upstream agent output.',
  }[data.sourcePolicy || 'allIncoming'] || 'Uses connected upstream agent outputs.';

  return (
    <CollapsibleSection title="Output Extractor">
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Artifact key</FieldLabel>
        <input
          className={INPUT_CLS}
          value={data.artifactKey || ''}
          onChange={(e) => onUpdateNode(nodeId, { artifactKey: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Artifact name</FieldLabel>
        <input
          className={INPUT_CLS}
          value={data.artifactName || ''}
          onChange={(e) => onUpdateNode(nodeId, { artifactName: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Format</FieldLabel>
        <select
          className={INPUT_CLS}
          value={data.format || 'markdown'}
          onChange={(e) => onUpdateNode(nodeId, { format: e.target.value })}
        >
          <option value="markdown">Markdown</option>
          <option value="text">Text</option>
          <option value="json">JSON</option>
          <option value="table">Table</option>
        </select>
      </div>
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Source policy</FieldLabel>
        <select
          className={INPUT_CLS}
          value={data.sourcePolicy || 'allIncoming'}
          onChange={(e) => onUpdateNode(nodeId, { sourcePolicy: e.target.value })}
        >
          <option value="allIncoming">All incoming</option>
          <option value="firstIncoming">First incoming</option>
        </select>
        <span className="text-[10px] text-gray-500">
          Selected-source extraction is deferred in this MVP.
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Extraction instruction</FieldLabel>
        <textarea
          className={`${INPUT_CLS} resize-y`}
          rows={3}
          value={data.instruction || ''}
          onChange={(e) => onUpdateNode(nodeId, { instruction: e.target.value })}
        />
      </div>
      <div className="rounded border border-amber-700/40 bg-amber-950/20 p-2 text-[11px] text-amber-100/90">
        <div className="font-semibold">What the user gets</div>
        <div className="mt-1 text-[10px] text-amber-100/70">Deliverable: {data.artifactName?.trim() || data.label || 'Artifact'} ({data.format || 'markdown'})</div>
        <div className="mt-1 text-[10px] text-amber-100/70">Upstream agents: {incomingAgents.length > 0 ? incomingAgents.map((agent) => agent.data?.label || agent.id).join(', ') : 'No connected upstream agent yet'}</div>
        <div className="mt-1 text-[10px] text-amber-100/70">Source policy: {sourcePolicyLabel}</div>
        <pre className="mt-2 max-h-32 overflow-auto rounded border border-amber-900/60 bg-gray-950 p-2 text-[10px] text-amber-100/90">{JSON.stringify({ artifactKey: data.artifactKey || 'report', artifactName: data.artifactName || data.label || 'Report', format: data.format || 'markdown', sourcePolicy: data.sourcePolicy || 'allIncoming' }, null, 2)}</pre>
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

export default function AgentInspector({ nodes, edges = null, onUpdateNode }) {
  const selectedNodeId = useSwarmStore((s) => s.selectedNodeId);
  const agentState = useSwarmStore((s) => s.agentStates[selectedNodeId]);
  const agentResult = useSwarmStore((s) => s.agentResults[selectedNodeId]);
  const chatMessages = useSwarmStore((s) => s.chatMessages);
  const setSelectedNode = useSwarmStore((s) => s.setSelectedNode);
  const expandedOutputNodeId = useSwarmStore((s) => s.expandedOutputNodeId);
  const setExpandedOutputNodeId = useSwarmStore((s) => s.setExpandedOutputNodeId);
  const setExpandedValidationNodeId = useSwarmStore((s) => s.setExpandedValidationNodeId);
  const setExpandedPromptEditorNodeId = useSwarmStore((s) => s.setExpandedPromptEditorNodeId);
  const markViewed = useSwarmStore((s) => s.markAgentResultViewed);
  const [activeTab, setActiveTab] = useState('config');

  const selectedNode = nodes?.find((n) => n.id === selectedNodeId);
  const preferredLiveSnippet = useMemo(
    () => getPreferredAgentLiveSnippet(agentState),
    [agentState?.lastChatSnippet, agentState?.lastOutputSnippet, agentState?.spawnMode]
  );
  const tokenSemantics = inspectControlTokens(preferredLiveSnippet || agentState?.lastOutputSnippet);
  const hasSelectedNode = Boolean(selectedNodeId && selectedNode);
  const nodeType = selectedNode?.type || 'agent';
  const outputEntries = useMemo(
    () => getAgentOutputEntries({
      nodeId: selectedNodeId,
      chatMessages,
      agentResult,
      spawnMode: agentState?.spawnMode,
    }),
    [agentResult, agentState?.spawnMode, chatMessages, selectedNodeId]
  );
  const liveOutputText = useMemo(
    () => formatAgentLiveSnippet(agentState),
    [agentState?.lastChatSnippet, agentState?.lastOutputSnippet, agentState?.spawnMode]
  );
  const handoffs = agentResult?.handoffPayloads || [];
  const hasInspectorOutput = hasSelectedNode && nodeType === 'agent' && (outputEntries.length > 0 || handoffs.length > 0);

  useEffect(() => {
    if (!selectedNodeId) {
      setActiveTab('config');
    }
  }, [selectedNodeId]);

  const handleCloseInspector = useCallback(() => {
    setSelectedNode(null);
    setExpandedOutputNodeId(null);
    setExpandedValidationNodeId(null);
  }, [setExpandedOutputNodeId, setExpandedValidationNodeId, setSelectedNode]);

  const handleCopyPanelContent = useCallback(async () => {
    const text = activeTab === 'handoff'
      ? JSON.stringify(handoffs, null, 2)
      : serializeAgentOutputEntries(outputEntries);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard is best-effort only in the inspector.
    }
  }, [activeTab, handoffs, outputEntries]);

  if (!hasSelectedNode) {
    return null;
  }

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
          onClick={handleCloseInspector}
          className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      {/* Node type badge */}
      <div className="text-xs text-gray-400 capitalize">Type: {nodeType}</div>

      <div className="flex flex-wrap gap-2">
        <InspectorTabButton
          active={activeTab === 'config'}
          onClick={() => {
            setExpandedOutputNodeId(null);
            setExpandedValidationNodeId(null);
            setActiveTab('config');
          }}
        >
          Setup
        </InspectorTabButton>
        {nodeType === 'agent' && (
          <InspectorTabButton
            active={false}
            onClick={() => {
              setExpandedPromptEditorNodeId(selectedNodeId);
            }}
          >
            Edit Prompts
          </InspectorTabButton>
        )}
        {hasInspectorOutput && (
          <InspectorTabButton
            active={activeTab === 'output'}
            onClick={() => {
              setExpandedOutputNodeId(selectedNodeId);
              setActiveTab('output');
              markViewed(selectedNodeId);
            }}
          >
            Output
          </InspectorTabButton>
        )}
        {hasInspectorOutput && handoffs.length > 0 && (
          <InspectorTabButton
            active={activeTab === 'handoff'}
            onClick={() => {
              setExpandedOutputNodeId(selectedNodeId);
              setActiveTab('handoff');
              markViewed(selectedNodeId);
            }}
          >
            Handoff
          </InspectorTabButton>
        )}
      </div>

      {(activeTab === 'output' || activeTab === 'handoff') && hasInspectorOutput && (
        <>
          <div className="rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-[11px] text-gray-400">
            {activeTab === 'output'
              ? 'Final output for this agent'
              : 'Handoff payloads emitted by this agent'}
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-900/80 p-3">
            {activeTab === 'output' ? (
              outputEntries.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {outputEntries.map((entry, index) => {
                    const outputNumber = outputEntries.length - index;
                    const formattedTimestamp = entry.timestamp
                      ? new Date(entry.timestamp).toLocaleString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          month: 'short',
                          day: 'numeric',
                        })
                      : null;

                    return (
                      <section
                        key={entry.id}
                        className={`min-w-0 break-words overflow-wrap-anywhere ${
                          index > 0 ? 'border-t border-gray-800 pt-3' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em] text-gray-500">
                          <span>{`Output ${outputNumber}`}</span>
                          {formattedTimestamp && (
                            <span className="text-[10px] normal-case tracking-normal">{formattedTimestamp}</span>
                          )}
                        </div>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                          components={mdComponents}
                        >
                          {entry.text}
                        </ReactMarkdown>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] italic text-gray-500">No output captured for this agent.</p>
              )
            ) : (
              <div className="flex flex-col gap-2">
                {handoffs.map((handoff, index) => (
                  <HandoffEntry key={`${handoff?.timestamp ?? index}-${index}`} handoff={handoff} />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopyPanelContent}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-[11px] font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Copy
          </button>
        </>
      )}

      {/* Type-specific editable fields */}
      {activeTab === 'config' && nodeType === 'agent' && (
        <AgentFields
          node={selectedNode}
          nodes={nodes}
          onUpdateNode={onUpdateNode}
        />
      )}
      {activeTab === 'config' && nodeType === 'department' && (
        <DepartmentFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'trigger' && (
        <TriggerFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'conditional' && (
        <ConditionalFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'merge' && (
        <MergeFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'delay' && (
        <DelayFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'loop' && (
        <LoopFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'errorHandler' && (
        <ErrorHandlerFields node={selectedNode} nodes={nodes} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'subWorkflow' && (
        <SubWorkflowFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && isVisualInputNode(selectedNode) && (
        <InputBlockFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}
      {activeTab === 'config' && nodeType === 'outputExtractor' && (
        <OutputExtractorFields node={selectedNode} onUpdateNode={onUpdateNode} />
      )}

      {/* Execution Info — timing data (FR-V5-49/50) */}
      {activeTab === 'config' && agentState?.timestamps?.started && (
        <ExecutionInfo timestamps={agentState.timestamps} status={agentState.status} />
      )}

      {/* Live status (from Zustand) */}
      {activeTab === 'config' && agentState && (
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
      {activeTab === 'config' && preferredLiveSnippet && (
        <CollapsibleSection title="Output" defaultOpen={true}>
          <div className="bg-gray-800 rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto text-green-300 leading-relaxed">
            {liveOutputText}
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

      {/* Agent Memory — full assembled prompt debug view */}
      {activeTab === 'config' && agentState?.lastAssembledPrompt && (
        <CollapsibleSection title="Agent Memory" defaultOpen={false}>
          {agentState.lastPromptTimestamp && (
            <div className="text-[10px] text-gray-500 mb-1">
              Last assembled: {new Date(agentState.lastPromptTimestamp).toLocaleTimeString()}
            </div>
          )}
          <div className="bg-gray-800 rounded p-2 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto text-blue-200 leading-relaxed border border-gray-700">
            {agentState.lastAssembledPrompt}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
