// client/src/canvas/WorkflowSettingsModal.jsx
// Modal for editing workflow settings (mode, budget, circuit breaker, model)
// and initial context variables (key-value pairs).
import { useState, useEffect, useCallback } from 'react';

const MODEL_OPTIONS = [
  { group: 'Claude', models: ['opus', 'sonnet', 'haiku'] },
  { group: 'Codex', models: ['gpt-5.4', 'gpt-5.1-codex', 'gpt-4.1-codex'] },
  { group: 'Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
];

const BUDGET_PRESETS = [
  { label: '10K', value: 10000 },
  { label: '50K', value: 50000 },
  { label: '100K', value: 100000 },
  { label: '500K', value: 500000 },
  { label: 'Unlimited', value: 0 },
];

const DEFAULTS = {
  mode: 'autonomous',
  budgetTokens: 100000,
  circuitBreakerThreshold: 10,
  defaultModel: 'sonnet',
};

const INPUT_CLS =
  'w-full bg-gray-700 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:border-purple-500 focus:outline-none';

function SettingsTab({ settings, onChange, description, onDescriptionChange }) {
  const mode = settings.mode || DEFAULTS.mode;
  const budgetTokens = settings.budgetTokens ?? DEFAULTS.budgetTokens;
  const cbThreshold = settings.circuitBreakerThreshold ?? DEFAULTS.circuitBreakerThreshold;
  const defaultModel = settings.defaultModel || DEFAULTS.defaultModel;
  const maxTurns = settings.maxConversationTurns ?? 30;
  const loopThreshold = settings.loopDetectionThreshold ?? 6;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Workflow Goal */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Workflow Goal</label>
        <textarea
          className={`${INPUT_CLS} resize-y font-mono`}
          rows={3}
          style={{ minHeight: '3rem', maxHeight: '12rem' }}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe the overall purpose of this workflow..."
        />
        <span className="text-[10px] text-gray-500">
          All agents see this goal in their awareness context
        </span>
      </div>

      {/* Mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Execution Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
            <input
              type="radio"
              name="wf-mode"
              value="autonomous"
              checked={mode === 'autonomous'}
              onChange={() => onChange({ ...settings, mode: 'autonomous' })}
              className="accent-purple-500"
            />
            Autonomous
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
            <input
              type="radio"
              name="wf-mode"
              value="hitl"
              checked={mode === 'hitl'}
              onChange={() => onChange({ ...settings, mode: 'hitl' })}
              className="accent-purple-500"
            />
            HITL (Human-in-the-Loop)
          </label>
        </div>
      </div>

      {/* Budget Tokens */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Budget Tokens</label>
        <div className="flex items-center gap-2 flex-wrap">
          {BUDGET_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ ...settings, budgetTokens: p.value })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                budgetTokens === p.value
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="number"
          className={INPUT_CLS}
          min={0}
          value={budgetTokens}
          onChange={(e) =>
            onChange({ ...settings, budgetTokens: e.target.value === '' ? 0 : Number(e.target.value) })
          }
          placeholder="Custom token budget (0 = unlimited)"
        />
        <span className="text-[10px] text-gray-500">
          {budgetTokens === 0 ? 'Unlimited' : `${budgetTokens.toLocaleString()} tokens`}
        </span>
      </div>

      {/* Circuit Breaker Threshold */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Circuit Breaker Threshold</label>
        <input
          type="number"
          className={INPUT_CLS}
          min={1}
          value={cbThreshold}
          onChange={(e) =>
            onChange({
              ...settings,
              circuitBreakerThreshold:
                e.target.value === '' ? DEFAULTS.circuitBreakerThreshold : Math.max(1, Number(e.target.value)),
            })
          }
        />
        <span className="text-[10px] text-gray-500">
          Max consecutive failures before halting execution
        </span>
      </div>

      {/* Max Conversation Turns */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Max Conversation Turns</label>
        <input
          type="number"
          className={INPUT_CLS}
          min={1}
          max={200}
          value={maxTurns}
          onChange={(e) =>
            onChange({
              ...settings,
              maxConversationTurns:
                e.target.value === '' ? 30 : Math.max(1, Math.min(200, Number(e.target.value))),
            })
          }
        />
        <span className="text-[10px] text-gray-500">
          Workflow stops after this many agent handoffs (default: 30)
        </span>
      </div>

      {/* Loop Detection Threshold */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Loop Detection Threshold</label>
        <input
          type="number"
          className={INPUT_CLS}
          min={2}
          max={50}
          value={loopThreshold}
          onChange={(e) =>
            onChange({
              ...settings,
              loopDetectionThreshold:
                e.target.value === '' ? 6 : Math.max(2, Math.min(50, Number(e.target.value))),
            })
          }
        />
        <span className="text-[10px] text-gray-500">
          Stops execution when the same agent pair exchanges this many handoffs (default: 6)
        </span>
      </div>

      {/* Default Model */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-300">Default Model</label>
        <select
          className={INPUT_CLS}
          value={defaultModel}
          onChange={(e) => onChange({ ...settings, defaultModel: e.target.value })}
        >
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
    </div>
  );
}

function ContextTab({ contextVars, onChange }) {
  const handleKeyChange = useCallback(
    (index, newKey) => {
      const next = contextVars.map((row, i) => (i === index ? { ...row, key: newKey } : row));
      onChange(next);
    },
    [contextVars, onChange]
  );

  const handleValueChange = useCallback(
    (index, newValue) => {
      const next = contextVars.map((row, i) => (i === index ? { ...row, value: newValue } : row));
      onChange(next);
    },
    [contextVars, onChange]
  );

  const handleDelete = useCallback(
    (index) => {
      onChange(contextVars.filter((_, i) => i !== index));
    },
    [contextVars, onChange]
  );

  const handleAdd = useCallback(() => {
    onChange([...contextVars, { key: '', value: '' }]);
  }, [contextVars, onChange]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">Initial Context Variables</span>
        <button
          type="button"
          onClick={handleAdd}
          className="text-xs px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          + Add Variable
        </button>
      </div>

      {contextVars.length === 0 && (
        <div className="text-xs text-gray-500 py-4 text-center">
          No context variables defined. Click "Add Variable" to create one.
        </div>
      )}

      {contextVars.length > 0 && (
        <div className="flex flex-col gap-0">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-1 pb-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Key</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Value</span>
            <span />
          </div>
          {contextVars.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_1fr_32px] gap-2 px-1 py-1.5 rounded ${
                i % 2 === 0 ? 'bg-gray-800/50' : ''
              }`}
            >
              <input
                type="text"
                className={INPUT_CLS}
                value={row.key}
                onChange={(e) => handleKeyChange(i, e.target.value)}
                placeholder="variable_name"
              />
              <input
                type="text"
                className={INPUT_CLS}
                value={row.value}
                onChange={(e) => handleValueChange(i, e.target.value)}
                placeholder="value"
              />
              <button
                type="button"
                onClick={() => handleDelete(i)}
                className="text-gray-500 hover:text-red-400 text-sm transition-colors flex items-center justify-center"
                title="Remove variable"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const INPUT_TYPES = ['text', 'textarea', 'number', 'integer', 'boolean', 'json', 'enum'];
const OUTPUT_SOURCES = ['finalText', 'workflowContext'];
const ARTIFACT_SOURCES = ['aggregatedArtifact', 'workflowContext'];
const ARTIFACT_FORMATS = ['markdown', 'text', 'json'];

function newInputField() {
  return { key: '', label: '', type: 'text', required: false, defaultValue: '', helpText: '', options: [] };
}

function newOutputField() {
  return { key: '', label: '', source: 'finalText', contextKey: '', description: '' };
}

function newArtifactField() {
  return { key: '', label: '', format: 'markdown', source: 'aggregatedArtifact', contextKey: '', description: '' };
}

function normalizeCsv(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function ContractRows({ title, rows, columns, onAdd, onUpdate, onDelete, emptyLabel }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">{title}</span>
        <button
          type="button"
          onClick={onAdd}
          className="text-xs px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          + Add
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded bg-gray-800/50 px-3 py-3 text-center text-xs text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="rounded border border-gray-700 bg-gray-800/70 p-3">
              <div className="mb-2 flex justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-400">Item {index + 1}</span>
                <button type="button" onClick={() => onDelete(index)} className="text-xs text-red-300 hover:text-red-200">
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {columns.map((column) => (
                  <label key={column.key} className={column.wide ? 'col-span-2 text-[11px] text-gray-400' : 'text-[11px] text-gray-400'}>
                    {column.label}
                    {column.type === 'select' ? (
                      <select className={INPUT_CLS} value={row[column.key] ?? column.options[0]} onChange={(event) => onUpdate(index, column.key, event.target.value)}>
                        {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : column.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        className="mt-2 block accent-purple-500"
                        checked={Boolean(row[column.key])}
                        onChange={(event) => onUpdate(index, column.key, event.target.checked)}
                      />
                    ) : (
                      <input
                        type="text"
                        className={INPUT_CLS}
                        value={Array.isArray(row[column.key]) ? row[column.key].join(', ') : row[column.key] ?? ''}
                        onChange={(event) => onUpdate(index, column.key, column.csv ? normalizeCsv(event.target.value) : event.target.value)}
                        placeholder={column.placeholder}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function InterfaceTab({ inputContract, outputContract, onInputsChange, onOutputContractChange }) {
  const outputs = outputContract?.outputs ?? [];
  const artifacts = outputContract?.artifacts ?? [];

  const updateInput = (index, key, value) => {
    onInputsChange(inputContract.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const updateOutput = (index, key, value) => {
    onOutputContractChange({
      outputs: outputs.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
      artifacts,
    });
  };
  const updateArtifact = (index, key, value) => {
    onOutputContractChange({
      outputs,
      artifacts: artifacts.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <p className="rounded border border-purple-900/50 bg-purple-950/20 px-3 py-2 text-xs text-purple-100">
        Workflow direct runs use these workflow-native contracts. Pack runs remain pack-authoritative in this wave.
      </p>
      <ContractRows
        title="Workflow Inputs"
        rows={inputContract}
        columns={[
          { key: 'key', label: 'Key', placeholder: 'brief' },
          { key: 'label', label: 'Label', placeholder: 'Campaign brief' },
          { key: 'type', label: 'Type', type: 'select', options: INPUT_TYPES },
          { key: 'required', label: 'Required', type: 'checkbox' },
          { key: 'defaultValue', label: 'Default', placeholder: 'Optional default' },
          { key: 'options', label: 'Enum options', placeholder: 'a, b, c', csv: true },
          { key: 'helpText', label: 'Help text', placeholder: 'Explain what the user should enter', wide: true },
        ]}
        onAdd={() => onInputsChange([...inputContract, newInputField()])}
        onUpdate={updateInput}
        onDelete={(index) => onInputsChange(inputContract.filter((_, i) => i !== index))}
        emptyLabel="No workflow inputs yet."
      />
      <ContractRows
        title="Canonical Outputs"
        rows={outputs}
        columns={[
          { key: 'key', label: 'Key', placeholder: 'result' },
          { key: 'label', label: 'Label', placeholder: 'Primary result' },
          { key: 'source', label: 'Source', type: 'select', options: OUTPUT_SOURCES },
          { key: 'contextKey', label: 'Context key', placeholder: 'packOutputs.result' },
          { key: 'description', label: 'Description', placeholder: 'What success looks like', wide: true },
        ]}
        onAdd={() => onOutputContractChange({ outputs: [...outputs, newOutputField()], artifacts })}
        onUpdate={updateOutput}
        onDelete={(index) => onOutputContractChange({ outputs: outputs.filter((_, i) => i !== index), artifacts })}
        emptyLabel="No workflow outputs yet."
      />
      <ContractRows
        title="Canonical Artifacts"
        rows={artifacts}
        columns={[
          { key: 'key', label: 'Key', placeholder: 'report' },
          { key: 'label', label: 'Label', placeholder: 'Final report' },
          { key: 'format', label: 'Format', type: 'select', options: ARTIFACT_FORMATS },
          { key: 'source', label: 'Source', type: 'select', options: ARTIFACT_SOURCES },
          { key: 'contextKey', label: 'Context key', placeholder: 'reportMarkdown' },
          { key: 'description', label: 'Description', placeholder: 'Artifact purpose', wide: true },
        ]}
        onAdd={() => onOutputContractChange({ outputs, artifacts: [...artifacts, newArtifactField()] })}
        onUpdate={updateArtifact}
        onDelete={(index) => onOutputContractChange({ outputs, artifacts: artifacts.filter((_, i) => i !== index) })}
        emptyLabel="No workflow artifacts yet."
      />
    </div>
  );
}

export default function WorkflowSettingsModal({ workflowDef, onApply, onClose }) {
  const [tab, setTab] = useState('settings');
  const [settings, setSettings] = useState({ ...DEFAULTS });
  const [contextVars, setContextVars] = useState([]);
  const [description, setDescription] = useState('');
  const [inputContract, setInputContract] = useState([]);
  const [outputContract, setOutputContract] = useState({ outputs: [], artifacts: [] });

  // Initialize from workflowDef
  useEffect(() => {
    const wfSettings = workflowDef?.settings || {};
    setSettings({
      mode: wfSettings.mode || DEFAULTS.mode,
      budgetTokens: wfSettings.budgetTokens ?? DEFAULTS.budgetTokens,
      circuitBreakerThreshold: wfSettings.circuitBreakerThreshold ?? DEFAULTS.circuitBreakerThreshold,
      defaultModel: wfSettings.defaultModel || DEFAULTS.defaultModel,
      maxConversationTurns: wfSettings.maxConversationTurns ?? 30,
      loopDetectionThreshold: wfSettings.loopDetectionThreshold ?? 6,
    });
    setDescription(workflowDef?.description || '');

    const ctx = workflowDef?.initialContext || {};
    const entries = Object.entries(ctx).map(([key, value]) => ({ key, value: String(value) }));
    setContextVars(entries);
    setInputContract(Array.isArray(workflowDef?.inputContract) ? workflowDef.inputContract : []);
    setOutputContract({
      outputs: Array.isArray(workflowDef?.outputContract?.outputs) ? workflowDef.outputContract.outputs : [],
      artifacts: Array.isArray(workflowDef?.outputContract?.artifacts) ? workflowDef.outputContract.artifacts : [],
    });
  }, [workflowDef]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleApply = useCallback(() => {
    const contextDict = {};
    for (const row of contextVars) {
      const k = row.key.trim();
      if (k) contextDict[k] = row.value;
    }
    onApply(settings, contextDict, description, inputContract, outputContract);
  }, [settings, contextVars, description, inputContract, outputContract, onApply]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-xl border border-gray-600 shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold text-white">Workflow Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-700 shrink-0">
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={`flex-1 text-xs py-2.5 transition-colors ${
              tab === 'settings'
                ? 'border-b-2 border-purple-500 text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setTab('context')}
            className={`flex-1 text-xs py-2.5 transition-colors ${
              tab === 'context'
                ? 'border-b-2 border-purple-500 text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Initial Context
          </button>
          <button
            type="button"
            onClick={() => setTab('interface')}
            className={`flex-1 text-xs py-2.5 transition-colors ${
              tab === 'interface'
                ? 'border-b-2 border-purple-500 text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Interface
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'settings' && <SettingsTab settings={settings} onChange={setSettings} description={description} onDescriptionChange={setDescription} />}
          {tab === 'context' && <ContextTab contextVars={contextVars} onChange={setContextVars} />}
          {tab === 'interface' && (
            <InterfaceTab
              inputContract={inputContract}
              outputContract={outputContract}
              onInputsChange={setInputContract}
              onOutputContractChange={setOutputContract}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
