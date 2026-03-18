import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../hooks/useApi.js';

const LINE_WARN_THRESHOLD = 300;

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

function ClaudeMdPanel({ label, filePath, content, onChange, onSave, saving, saveError }) {
  const lineCount = content.split('\n').length;
  const overLimit = lineCount > LINE_WARN_THRESHOLD;

  return (
    <div className="flex flex-col flex-1 min-w-0 gap-3">
      {/* Panel header */}
      <div>
        <span className="text-xs font-semibold text-gray-200">{label}</span>
        {filePath && (
          <p className="text-xs text-gray-600 mt-0.5 font-mono truncate" title={filePath}>{filePath}</p>
        )}
        {!filePath && (
          <p className="text-xs text-gray-600 mt-0.5 italic">No project selected</p>
        )}
      </div>

      {/* Line count + warning */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
        {overLimit && (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: '#fde047', border: '1px solid rgba(234,179,8,0.3)' }}
          >
            Warning: exceeds 300 lines — Claude may not read all content
          </span>
        )}
      </div>

      {/* Textarea */}
      <textarea
        className="flex-1 px-3 py-2 rounded text-xs text-gray-200 bg-gray-900 border outline-none resize-none font-mono"
        style={{
          borderColor: overLimit ? 'rgba(234,179,8,0.4)' : '#374151',
          minHeight: '320px',
        }}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        disabled={!filePath}
        placeholder={filePath ? '# CLAUDE.md\n\n...' : 'Select a project to edit project-scoped CLAUDE.md'}
        spellCheck={false}
      />

      {saveError && (
        <div className="px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          {saveError}
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saving || !filePath}
        className="self-start px-4 py-2 rounded text-xs font-semibold"
        style={{
          backgroundColor: (saving || !filePath) ? '#374151' : '#4ade80',
          color: (saving || !filePath) ? '#9ca3af' : '#111111',
        }}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

export default function ClaudeMdEditor({ activeProjectId }) {
  const [userContent, setUserContent] = useState('');
  const [projectContent, setProjectContent] = useState('');
  const [userFilePath, setUserFilePath] = useState(null);
  const [projectFilePath, setProjectFilePath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [userSaving, setUserSaving] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [userSaveError, setUserSaveError] = useState(null);
  const [projectSaveError, setProjectSaveError] = useState(null);
  const [toast, setToast] = useState(null);

  async function loadContent() {
    setLoading(true);
    setLoadError(null);
    try {
      const url = activeProjectId
        ? `/api/v1/claudemd?projectId=${encodeURIComponent(activeProjectId)}`
        : '/api/v1/claudemd';
      const data = await apiGet(url);
      setUserContent(data.userScope?.content ?? '');
      setUserFilePath(data.userScope?.path ?? null);
      setProjectContent(data.projectScope?.content ?? '');
      setProjectFilePath(data.projectScope?.path ?? null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadContent(); }, [activeProjectId]);

  const handleSaveUser = useCallback(async () => {
    setUserSaving(true);
    setUserSaveError(null);
    try {
      await apiPut('/api/v1/claudemd/user', { content: userContent });
      setToast('User CLAUDE.md saved.');
    } catch (err) {
      setUserSaveError(err.message);
    } finally {
      setUserSaving(false);
    }
  }, [userContent]);

  const handleSaveProject = useCallback(async () => {
    if (!activeProjectId) return;
    setProjectSaving(true);
    setProjectSaveError(null);
    try {
      await apiPut('/api/v1/claudemd/project', { content: projectContent, projectId: activeProjectId });
      setToast('Project CLAUDE.md saved.');
    } catch (err) {
      setProjectSaveError(err.message);
    } finally {
      setProjectSaving(false);
    }
  }, [projectContent, activeProjectId]);

  if (loading) {
    return <div className="flex-1 p-6"><p className="text-xs text-gray-500">Loading...</p></div>;
  }

  if (loadError) {
    return (
      <div className="flex-1 p-6">
        <div className="px-3 py-2 rounded text-xs max-w-md" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-sm font-semibold text-gray-200 mb-5">CLAUDE.md</h2>

      <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>
        <ClaudeMdPanel
          label="User CLAUDE.md (global)"
          filePath={userFilePath}
          content={userContent}
          onChange={setUserContent}
          onSave={handleSaveUser}
          saving={userSaving}
          saveError={userSaveError}
        />
        <ClaudeMdPanel
          label="Project CLAUDE.md"
          filePath={projectFilePath}
          content={projectContent}
          onChange={setProjectContent}
          onSave={handleSaveProject}
          saving={projectSaving}
          saveError={projectSaveError}
        />
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
