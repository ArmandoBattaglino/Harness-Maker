import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDeleteWithBody } from '../hooks/useApi.js';

const MODEL_OPTIONS = [
  { value: 'inherit', label: 'Inherit (default)' },
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
  { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5-20251001' },
];

const PERMISSION_MODE_OPTIONS = [
  { value: 'default', label: 'default' },
  { value: 'acceptEdits', label: 'acceptEdits' },
  { value: 'dontAsk', label: 'dontAsk' },
  { value: 'bypassPermissions', label: 'bypassPermissions' },
  { value: 'plan', label: 'plan' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  tools: '',
  disallowedTools: '',
  model: 'inherit',
  permissionMode: 'default',
  maxTurns: '',
  background: false,
  isolation: '',
  body: '',
  scope: 'user',
};

function ScopeBadge({ scope }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
      style={{
        backgroundColor: scope === 'user' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
        color: scope === 'user' ? '#a5b4fc' : '#fbbf24',
      }}
    >
      {scope === 'user' ? 'User' : 'Project'}
    </span>
  );
}

function AgentForm({ initial, onSave, onCancel, activeProjectId }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    else if (!/^[a-z][a-z0-9-]*$/.test(form.name.trim())) errs.name = 'Must match ^[a-z][a-z0-9-]*$';
    if (!form.description.trim()) errs.description = 'Description is required';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    setApiError(null);

    const frontmatter = {
      name: form.name.trim(),
      description: form.description.trim(),
    };
    if (form.tools.trim()) frontmatter.tools = form.tools.trim().split(',').map(t => t.trim()).filter(Boolean).join(',');
    if (form.disallowedTools.trim()) frontmatter.disallowedTools = form.disallowedTools.trim().split(',').map(t => t.trim()).filter(Boolean).join(',');
    if (form.model && form.model !== 'inherit') frontmatter.model = form.model;
    if (form.permissionMode && form.permissionMode !== 'default') frontmatter.permissionMode = form.permissionMode;
    if (form.maxTurns !== '') frontmatter.maxTurns = parseInt(form.maxTurns, 10);
    if (form.background) frontmatter.background = true;
    if (form.isolation) frontmatter.isolation = form.isolation;

    try {
      if (initial._isEdit) {
        await apiPut(`/api/v1/agents/${initial.id}`, {
          frontmatter,
          body: form.body,
          filePath: initial.filePath,
        });
      } else {
        await apiPost('/api/v1/agents', {
          name: form.name.trim(),
          scope: form.scope,
          projectId: activeProjectId,
          frontmatter,
          body: form.body,
        });
      }
      onSave();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {apiError && (
        <div className="px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          {apiError}
        </div>
      )}

      {/* Scope selector (only for create) */}
      {!initial._isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Scope</label>
          <div className="flex gap-3">
            {['user', 'project'].map((s) => (
              <label key={s} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input type="radio" name="scope" value={s} checked={form.scope === s} onChange={() => set('scope', s)} />
                {s === 'user' ? 'User (global)' : 'Project-scoped'}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Name <span style={{ color: '#f87171' }}>*</span></label>
        <input
          className="px-3 py-2 rounded text-xs text-white bg-gray-800 border outline-none"
          style={{ borderColor: errors.name ? '#f87171' : '#374151' }}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={initial._isEdit}
          placeholder="e.g. my-agent"
        />
        {errors.name && <span className="text-xs" style={{ color: '#f87171' }}>{errors.name}</span>}
        {!errors.name && <span className="text-xs text-gray-600">Lowercase letters and hyphens only</span>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Description <span style={{ color: '#f87171' }}>*</span></label>
        <textarea
          className="px-3 py-2 rounded text-xs text-white bg-gray-800 border outline-none resize-y"
          style={{ borderColor: errors.description ? '#f87171' : '#374151', minHeight: '60px' }}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What this agent does"
        />
        {errors.description && <span className="text-xs" style={{ color: '#f87171' }}>{errors.description}</span>}
      </div>

      {/* Tools / DisallowedTools row */}
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-400">Tools</label>
          <input
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.tools}
            onChange={(e) => set('tools', e.target.value)}
            placeholder="Read,Glob,Grep"
          />
          <span className="text-xs text-gray-600">Comma-separated</span>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-400">Disallowed Tools</label>
          <input
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.disallowedTools}
            onChange={(e) => set('disallowedTools', e.target.value)}
            placeholder="Bash,Write"
          />
        </div>
      </div>

      {/* Model / PermissionMode row */}
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-400">Model</label>
          <select
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
          >
            {MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-400">Permission Mode</label>
          <select
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.permissionMode}
            onChange={(e) => set('permissionMode', e.target.value)}
          >
            {PERMISSION_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* MaxTurns / Background / Isolation row */}
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Max Turns</label>
          <input
            type="number"
            min="1"
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none w-24"
            value={form.maxTurns}
            onChange={(e) => set('maxTurns', e.target.value)}
            placeholder="unlimited"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Isolation</label>
          <select
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.isolation}
            onChange={(e) => set('isolation', e.target.value)}
          >
            <option value="">none</option>
            <option value="worktree">worktree</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={form.background}
            onChange={(e) => set('background', e.target.checked)}
          />
          Background
        </label>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">System Prompt (Markdown)</label>
        <textarea
          className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none resize-y font-mono"
          style={{ minHeight: '120px' }}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder="You are a specialized agent that..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded text-xs font-semibold"
          style={{ backgroundColor: saving ? '#374151' : '#4ade80', color: saving ? '#9ca3af' : '#111111' }}
        >
          {saving ? 'Saving...' : (initial._isEdit ? 'Update Agent' : 'Create Agent')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded text-xs text-gray-400 border border-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AgentEditor({ activeProjectId }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [formState, setFormState] = useState(null); // null = list, else = form initial values
  const [restartBanner, setRestartBanner] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // agent to confirm-delete
  const [deleteError, setDeleteError] = useState(null);

  async function loadAgents() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet(`/api/v1/agents?projectId=${encodeURIComponent(activeProjectId ?? '')}`);
      setAgents(data.agents ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAgents(); }, [activeProjectId]);

  function handleNewAgent() {
    setFormState({ ...EMPTY_FORM });
  }

  function handleEdit(agent) {
    const fm = agent.frontmatter ?? {};
    setFormState({
      _isEdit: true,
      id: agent.id,
      filePath: agent.filePath,
      name: agent.name ?? '',
      description: fm.description ?? '',
      tools: Array.isArray(fm.tools) ? fm.tools.join(',') : (fm.tools ?? ''),
      disallowedTools: Array.isArray(fm.disallowedTools) ? fm.disallowedTools.join(',') : (fm.disallowedTools ?? ''),
      model: fm.model ?? 'inherit',
      permissionMode: fm.permissionMode ?? 'default',
      maxTurns: fm.maxTurns != null ? String(fm.maxTurns) : '',
      background: Boolean(fm.background),
      isolation: fm.isolation ?? '',
      body: agent.body ?? '',
      scope: agent.scope ?? 'user',
    });
  }

  function handleSaved() {
    setFormState(null);
    setRestartBanner(true);
    loadAgents();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await apiDeleteWithBody(`/api/v1/agents/${deleteTarget.id}`, { filePath: deleteTarget.filePath });
      setDeleteTarget(null);
      loadAgents();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  // ---- Confirm delete dialog ----
  if (deleteTarget) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <div className="rounded-lg p-6 max-w-sm w-full" style={{ backgroundColor: '#1a1a1a', border: '1px solid #374151' }}>
          <p className="text-sm text-gray-200 mb-4">
            Delete agent <span className="font-semibold text-white">"{deleteTarget.name}"</span>? This cannot be undone.
          </p>
          {deleteError && (
            <p className="text-xs mb-3" style={{ color: '#f87171' }}>{deleteError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleDeleteConfirm}
              className="px-4 py-2 rounded text-xs font-semibold"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              Delete
            </button>
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
              className="px-4 py-2 rounded text-xs text-gray-400 border border-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Form view ----
  if (formState) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold text-gray-200 mb-5">
            {formState._isEdit ? `Edit Agent: ${formState.name}` : 'New Agent'}
          </h2>
          <AgentForm
            initial={formState}
            activeProjectId={activeProjectId}
            onSave={handleSaved}
            onCancel={() => setFormState(null)}
          />
        </div>
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {restartBanner && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded mb-5 text-xs"
          style={{ backgroundColor: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', color: '#fde047' }}
        >
          <span className="font-bold">!</span>
          <span>Restart the Claude session for this agent to take effect.</span>
          <button
            onClick={() => setRestartBanner(false)}
            className="ml-auto text-yellow-400 hover:text-yellow-200 font-semibold"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Agents</h2>
        <button
          onClick={handleNewAgent}
          className="px-3 py-1.5 rounded text-xs font-semibold"
          style={{ backgroundColor: '#4ade80', color: '#111111' }}
        >
          + New Agent
        </button>
      </div>

      {loading && (
        <p className="text-xs text-gray-500">Loading...</p>
      )}

      {loadError && (
        <div className="px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          {loadError}
        </div>
      )}

      {!loading && !loadError && agents.length === 0 && (
        <p className="text-xs text-gray-600 italic">No agents found. Click "+ New Agent" to create one.</p>
      )}

      {!loading && agents.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Scope</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Name</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Description</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Model</th>
                <th className="pb-2 text-left text-gray-500 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} style={{ borderBottom: '1px solid #1f2937' }}>
                  <td className="py-2 pr-4"><ScopeBadge scope={agent.scope} /></td>
                  <td className="py-2 pr-4 font-mono text-gray-200">{agent.name}</td>
                  <td className="py-2 pr-4 text-gray-400" style={{ maxWidth: '260px' }}>
                    <span className="block truncate">{agent.frontmatter?.description ?? '—'}</span>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">{agent.frontmatter?.model ?? 'inherit'}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(agent)}
                        className="px-2 py-1 rounded text-xs border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(agent)}
                        className="px-2 py-1 rounded text-xs border text-red-400 hover:text-red-300"
                        style={{ borderColor: 'rgba(239,68,68,0.3)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
