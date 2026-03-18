import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDeleteWithBody } from '../hooks/useApi.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  argumentHint: '',
  disableModelInvocation: false,
  userInvocable: true,
  allowedTools: '',
  model: '',
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

function FormatBadge({ format }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs"
      style={{
        backgroundColor: format === 'modern' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.2)',
        color: format === 'modern' ? '#86efac' : '#9ca3af',
      }}
    >
      {format}
    </span>
  );
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-6 right-6 px-4 py-3 rounded text-xs font-semibold z-50"
      style={{ backgroundColor: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80' }}
    >
      {message}
    </div>
  );
}

function SkillForm({ initial, onSave, onCancel, activeProjectId }) {
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
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(form.name.trim())) errs.name = 'Must match ^[a-z0-9][a-z0-9-]*$';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    setApiError(null);

    const frontmatter = { name: form.name.trim() };
    if (form.description.trim()) frontmatter.description = form.description.trim();
    if (form.argumentHint.trim()) frontmatter['argument-hint'] = form.argumentHint.trim();
    if (form.disableModelInvocation) frontmatter['disable-model-invocation'] = true;
    if (!form.userInvocable) frontmatter['user-invocable'] = false;
    if (form.allowedTools.trim()) frontmatter['allowed-tools'] = form.allowedTools.trim().split(',').map(t => t.trim()).filter(Boolean).join(',');
    if (form.model.trim()) frontmatter.model = form.model.trim();

    try {
      if (initial._isEdit) {
        await apiPut(`/api/v1/skills/${initial.id}`, {
          frontmatter,
          body: form.body,
          filePath: initial.filePath,
        });
      } else {
        await apiPost('/api/v1/skills', {
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
          placeholder="e.g. my-skill"
        />
        {errors.name && <span className="text-xs" style={{ color: '#f87171' }}>{errors.name}</span>}
        {!errors.name && <span className="text-xs text-gray-600">Becomes the slash command name</span>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Description</label>
        <textarea
          className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none resize-y"
          style={{ minHeight: '50px' }}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What this skill does"
        />
      </div>

      {/* Argument hint */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Argument Hint</label>
        <input
          className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
          value={form.argumentHint}
          onChange={(e) => set('argumentHint', e.target.value)}
          placeholder="e.g. [filename]"
        />
      </div>

      {/* Allowed tools / Model row */}
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-400">Allowed Tools</label>
          <input
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.allowedTools}
            onChange={(e) => set('allowedTools', e.target.value)}
            placeholder="Read,Glob"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-400">Model (optional)</label>
          <input
            className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="inherit"
          />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.disableModelInvocation}
            onChange={(e) => set('disableModelInvocation', e.target.checked)}
          />
          Disable model invocation
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.userInvocable}
            onChange={(e) => set('userInvocable', e.target.checked)}
          />
          User invocable
        </label>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Body (Markdown, use $ARGUMENTS)</label>
        <textarea
          className="px-3 py-2 rounded text-xs text-white bg-gray-800 border border-gray-700 outline-none resize-y font-mono"
          style={{ minHeight: '100px' }}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder="Do something with $ARGUMENTS..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded text-xs font-semibold"
          style={{ backgroundColor: saving ? '#374151' : '#4ade80', color: saving ? '#9ca3af' : '#111111' }}
        >
          {saving ? 'Saving...' : (initial._isEdit ? 'Update Skill' : 'Create Skill')}
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

export default function SkillEditor({ activeProjectId }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [formState, setFormState] = useState(null);
  const [toast, setToast] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  async function loadSkills() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet(`/api/v1/skills?projectId=${encodeURIComponent(activeProjectId ?? '')}`);
      setSkills(data.skills ?? []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSkills(); }, [activeProjectId]);

  function handleEdit(skill) {
    const fm = skill.frontmatter ?? {};
    setFormState({
      _isEdit: true,
      id: skill.id,
      filePath: skill.filePath,
      name: skill.name ?? '',
      description: fm.description ?? '',
      argumentHint: fm['argument-hint'] ?? '',
      disableModelInvocation: Boolean(fm['disable-model-invocation']),
      userInvocable: fm['user-invocable'] !== false,
      allowedTools: fm['allowed-tools'] ?? '',
      model: fm.model ?? '',
      body: skill.body ?? '',
      scope: skill.scope ?? 'user',
    });
  }

  function handleSaved() {
    setFormState(null);
    setToast('Skill saved. Changes take effect immediately.');
    loadSkills();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      const body = deleteTarget.dirPath
        ? { dirPath: deleteTarget.dirPath }
        : { filePath: deleteTarget.filePath };
      await apiDeleteWithBody(`/api/v1/skills/${deleteTarget.id}`, body);
      setDeleteTarget(null);
      loadSkills();
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
            Delete skill <span className="font-semibold text-white">"{deleteTarget.name}"</span>? This cannot be undone.
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
            {formState._isEdit ? `Edit Skill: ${formState.name}` : 'New Skill'}
          </h2>
          <SkillForm
            initial={formState}
            activeProjectId={activeProjectId}
            onSave={handleSaved}
            onCancel={() => setFormState(null)}
          />
        </div>
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Skills</h2>
        <button
          onClick={() => setFormState({ ...EMPTY_FORM })}
          className="px-3 py-1.5 rounded text-xs font-semibold"
          style={{ backgroundColor: '#4ade80', color: '#111111' }}
        >
          + New Skill
        </button>
      </div>

      {loading && <p className="text-xs text-gray-500">Loading...</p>}

      {loadError && (
        <div className="px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          {loadError}
        </div>
      )}

      {!loading && !loadError && skills.length === 0 && (
        <p className="text-xs text-gray-600 italic">No skills found. Click "+ New Skill" to create one.</p>
      )}

      {!loading && skills.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Scope</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Format</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Name</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Description</th>
                <th className="pb-2 pr-4 text-left text-gray-500 font-semibold">Arg Hint</th>
                <th className="pb-2 text-left text-gray-500 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr key={skill.id} style={{ borderBottom: '1px solid #1f2937' }}>
                  <td className="py-2 pr-4"><ScopeBadge scope={skill.scope} /></td>
                  <td className="py-2 pr-4"><FormatBadge format={skill.format} /></td>
                  <td className="py-2 pr-4 font-mono text-gray-200">{skill.name}</td>
                  <td className="py-2 pr-4 text-gray-400" style={{ maxWidth: '200px' }}>
                    <span className="block truncate">{skill.frontmatter?.description ?? '—'}</span>
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{skill.frontmatter?.['argument-hint'] ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(skill)}
                        className="px-2 py-1 rounded text-xs border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(skill)}
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
