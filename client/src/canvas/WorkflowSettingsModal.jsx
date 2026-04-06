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

function SettingsTab({ settings, onChange }) {
  const mode = settings.mode || DEFAULTS.mode;
  const budgetTokens = settings.budgetTokens ?? DEFAULTS.budgetTokens;
  const cbThreshold = settings.circuitBreakerThreshold ?? DEFAULTS.circuitBreakerThreshold;
  const defaultModel = settings.defaultModel || DEFAULTS.defaultModel;

  return (
    <div className="flex flex-col gap-4 p-4">
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

export default function WorkflowSettingsModal({ workflowDef, onApply, onClose }) {
  const [tab, setTab] = useState('settings');
  const [settings, setSettings] = useState({ ...DEFAULTS });
  const [contextVars, setContextVars] = useState([]);

  // Initialize from workflowDef
  useEffect(() => {
    const wfSettings = workflowDef?.settings || {};
    setSettings({
      mode: wfSettings.mode || DEFAULTS.mode,
      budgetTokens: wfSettings.budgetTokens ?? DEFAULTS.budgetTokens,
      circuitBreakerThreshold: wfSettings.circuitBreakerThreshold ?? DEFAULTS.circuitBreakerThreshold,
      defaultModel: wfSettings.defaultModel || DEFAULTS.defaultModel,
    });

    const ctx = workflowDef?.initialContext || {};
    const entries = Object.entries(ctx).map(([key, value]) => ({ key, value: String(value) }));
    setContextVars(entries);
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
    // Convert contextVars array back to flat dict
    const contextDict = {};
    for (const row of contextVars) {
      const k = row.key.trim();
      if (k) contextDict[k] = row.value;
    }
    onApply(settings, contextDict);
  }, [settings, contextVars, onApply]);

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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'settings' && <SettingsTab settings={settings} onChange={setSettings} />}
          {tab === 'context' && <ContextTab contextVars={contextVars} onChange={setContextVars} />}
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
