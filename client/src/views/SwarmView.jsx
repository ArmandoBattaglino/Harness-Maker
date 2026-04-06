// client/src/views/SwarmView.jsx
// Layout shell for the Swarm Orchestrator — toolbar + canvas.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import SwarmCanvas from '../canvas/SwarmCanvas';
import PromptToFlowBar from '../canvas/PromptToFlowBar';
import BroadcastBar from '../canvas/BroadcastBar';
import PtyExplosion from '../canvas/PtyExplosion';
import WorkflowSettingsModal from '../canvas/WorkflowSettingsModal';
import ExecutionHistory from '../canvas/ExecutionHistory';
import TemplateGallery from '../canvas/TemplateGallery';
import VersionHistory from '../canvas/VersionHistory';
import HitlInbox, { getPendingCount } from '../panels/HitlInbox';
import { useSwarmStore } from '../store/SwarmContext';
import { useSwarm } from '../hooks/useSwarm';
import { useInbox } from '../hooks/useInbox.js';
import { useWorkflowList } from '../hooks/useWorkflow.js';
import { useAppState } from '../store/AppContext';
import { apiGet, apiPost, apiPut } from '../hooks/useApi.js';
import { sanitizeWorkflow } from '../utils/sanitizeWorkflow.js';
import { useCanvasValidation } from '../hooks/useCanvasValidation.js';

const statusColors = {
  idle: 'text-gray-400',
  running: 'text-blue-400 animate-pulse',
  paused: 'text-yellow-400',
  blocked: 'text-orange-400',
  stopped: 'text-red-400',
};

function resolveRuntimeModelSelection(currentModel, availableModels = [], detectedDefault = null) {
  if (currentModel && availableModels.includes(currentModel)) {
    return currentModel;
  }
  if (detectedDefault && availableModels.includes(detectedDefault)) {
    return detectedDefault;
  }
  return availableModels[0] ?? '';
}

export default function SwarmView() {
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const runtimeBlocker = useSwarmStore((s) => s.runtimeBlocker);
  const runtimeProvider = useSwarmStore((s) => s.runtimeProvider);
  const providerStrategy = useSwarmStore((s) => s.providerStrategy);
  const lastFallback = useSwarmStore((s) => s.lastFallback);
  const inboxItems = useSwarmStore((s) => s.inboxItems);
  const setPaused = useSwarmStore((s) => s.setPaused);
  const setResumed = useSwarmStore((s) => s.setResumed);
  const reset = useSwarmStore((s) => s.reset);
  const ptyExplosionNodeId = useSwarmStore((s) => s.ptyExplosionNodeId);
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const setWorkflowDef = useSwarmStore((s) => s.setWorkflowDef);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [importError, setImportError] = useState(null);
  const canvasStateRef = useRef({ nodes: [], edges: [] });
  const [validationErrors, setValidationErrors] = useState([]);
  const fileInputRef = useRef(null);
  const selectedRuntimeProvider = useSwarmStore((s) => s.selectedRuntimeProvider);
  const setSelectedRuntimeProvider = useSwarmStore((s) => s.setSelectedRuntimeProvider);
  const [runtimeModels, setRuntimeModels] = useState({ claude: '', codex: '', gemini: '' });
  const [runtimeDefaults, setRuntimeDefaults] = useState({ claude: '', codex: '', gemini: '' });
  const [runtimeAvailability, setRuntimeAvailability] = useState({ claude: false, codex: false, gemini: false });
  const [showSettings, setShowSettings] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState({
    claude: [],
    codex: [],
    gemini: [],
  });
  const [runtimeCapabilityError, setRuntimeCapabilityError] = useState('');

  const { activeProjectId, projects } = useAppState();
  const projectPath = projects.find((p) => p.id === activeProjectId)?.path ?? '';
  const {
    workflows,
    loading: workflowsLoading,
    error: workflowsError,
    refresh: refreshWorkflows,
  } = useWorkflowList();

  const { startExecution, stopExecution } = useSwarm(workflowDef?.id);
  useInbox(activeExecutionId);

  const pendingCount = getPendingCount(inboxItems);
  const isExecutionActive = ['running', 'paused', 'blocked'].includes(executionStatus);
  const showMissingProjectMessage = Boolean(workflowDef && !activeProjectId);
  const savedWorkflows = useMemo(() => {
    const filtered = workflows
      .filter((workflow) => !activeProjectId || !workflow.projectId || workflow.projectId === activeProjectId)
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });

    // Deduplicate by name — keep only the most recent workflow per name.
    // The array is already sorted newest-first, so the first occurrence wins.
    const seen = new Set();
    return filtered.filter((workflow) => {
      const key = (workflow.name ?? '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [workflows, activeProjectId]);

  // Stable refs for keyboard shortcut handlers (FR-V5-43)
  const handleSaveRef = useRef(null);
  const handleRunRef = useRef(null);
  const handleSaveFnRef = useRef(null);
  const handleRunFnRef = useRef(null);
  handleSaveRef.current = { isDirty, workflowDef, saving };
  handleRunRef.current = { workflowDef, activeProjectId, executing, executionStatus, validationErrors };
  // Updated after handleSave/handleRun are defined (see below)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && ptyExplosionNodeId !== null) {
        e.preventDefault();
        setPtyExplosionNodeId(null);
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;

      // FR-V5-43: Ctrl+S — save workflow
      if (e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        const s = handleSaveRef.current;
        if (s.isDirty && s.workflowDef && !s.saving) {
          handleSaveFnRef.current?.();
        }
        return;
      }

      // FR-V5-43: Ctrl+Enter — run workflow
      if (e.key === 'Enter') {
        e.preventDefault();
        const r = handleRunRef.current;
        const canRun = r.workflowDef && r.activeProjectId && !r.executing
          && (r.executionStatus === 'idle' || r.executionStatus === 'completed')
          && !(r.validationErrors?.filter(ve => ve.severity === 'error').length > 0);
        if (canRun) {
          handleRunFnRef.current?.();
        }
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [ptyExplosionNodeId, setPtyExplosionNodeId]);

  useEffect(() => {
    if (workflowDef?.id) {
      setSelectedWorkflowId(workflowDef.id);
    }
  }, [workflowDef?.id]);

  useEffect(() => {
    let cancelled = false;

    apiGet('/api/v1/swarm/runtime-capabilities')
      .then((data) => {
        if (cancelled) return;
        const nextCapabilities = {
          claude: data?.providers?.claude ?? [],
          codex: data?.providers?.codex ?? [],
          gemini: data?.providers?.gemini ?? [],
        };
        const nextDefaults = {
          claude: data?.defaults?.claude ?? '',
          codex: data?.defaults?.codex ?? '',
          gemini: data?.defaults?.gemini ?? '',
        };
        const nextAvailability = {
          claude: Boolean(data?.availability?.claude),
          codex: Boolean(data?.availability?.codex),
          gemini: Boolean(data?.availability?.gemini),
        };

        setRuntimeCapabilities(nextCapabilities);
        setRuntimeDefaults(nextDefaults);
        setRuntimeAvailability(nextAvailability);
        setRuntimeModels((current) => ({
          claude: resolveRuntimeModelSelection(current.claude, nextCapabilities.claude, nextDefaults.claude),
          codex: resolveRuntimeModelSelection(current.codex, nextCapabilities.codex, nextDefaults.codex),
          gemini: resolveRuntimeModelSelection(current.gemini, nextCapabilities.gemini, nextDefaults.gemini),
        }));
        setSelectedRuntimeProvider((current) => {
          if (current === 'codex' && !nextAvailability.codex) return 'auto';
          if (current === 'gemini' && !nextAvailability.gemini) return 'auto';
          if (current === 'claude' && !nextAvailability.claude) return 'auto';
          return current;
        });
        setRuntimeCapabilityError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setRuntimeCapabilities({ claude: [], codex: [], gemini: [] });
        setRuntimeDefaults({ claude: '', codex: '', gemini: '' });
        setRuntimeAvailability({ claude: false, codex: false, gemini: false });
        setRuntimeCapabilityError(error.message || 'Unable to load runtime model capabilities');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRun = async () => {
    // FR-V5-46: validate before run — block if errors exist
    if (hasValidationErrors) return;
    setExecuting(true);
    try {
      const models = {};
      if (runtimeModels.claude) models.claude = runtimeModels.claude;
      if (runtimeModels.codex) models.codex = runtimeModels.codex;
      if (runtimeModels.gemini) models.gemini = runtimeModels.gemini;
      await startExecution(activeProjectId, projectPath, selectedRuntimeProvider, Object.keys(models).length > 0 ? models : null);
    } finally {
      setExecuting(false);
    }
  };

  const handleStop = async () => {
    setExecuting(true);
    try {
      await stopExecution(activeExecutionId);
    } finally {
      setExecuting(false);
    }
  };

  const handlePause = async () => {
    if (!activeExecutionId) return;
    setPausing(true);
    try {
      await apiPost(`/api/v1/swarm/${activeExecutionId}/pause`, {});
      setPaused();
    } finally {
      setPausing(false);
    }
  };

  const handleResume = async () => {
    if (!activeExecutionId) return;
    setPausing(true);
    try {
      await apiPost(`/api/v1/swarm/${activeExecutionId}/resume`, {});
      setResumed();
    } finally {
      setPausing(false);
    }
  };

  const handleLoadWorkflow = () => {
    const selected = savedWorkflows.find((workflow) => workflow.id === selectedWorkflowId);
    if (!selected) return;

    reset();
    setWorkflowDef(selected);
    setIsDirty(false);
    setSaveError(null);
  };

  // FR-V5-01: markDirty callback for SwarmCanvas
  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveError(null);
  }, []);

  // FR-V5-01: track latest canvas nodes/edges for save + FR-V5-44 validation
  const onCanvasChange = useCallback((nodes, edges) => {
    canvasStateRef.current = { nodes, edges };
  }, []);

  // FR-V5-44: canvas validation — computed from latest canvas state
  const canvasValidation = useCanvasValidation(
    canvasStateRef.current.nodes,
    canvasStateRef.current.edges
  );
  // Keep validation errors in state so banners react to changes
  useEffect(() => {
    setValidationErrors(canvasValidation.errors);
  }, [canvasValidation.errors]);

  const validationErrorCount = validationErrors.filter((e) => e.severity === 'error').length;
  const hasValidationErrors = validationErrorCount > 0;

  // FR-V5-01: save handler — persist canvas state to server
  const handleSave = async () => {
    if (!workflowDef?.id || !isDirty) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const { nodes, edges } = canvasStateRef.current;
      const updated = sanitizeWorkflow({
        ...workflowDef,
        nodes,
        edges,
      });
      const result = await apiPut(`/api/v1/workflows/${workflowDef.id}`, updated);
      const saved = result?.workflow ?? result;
      if (saved) setWorkflowDef(saved);
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      refreshWorkflows();
    } catch (err) {
      setSaveError(err.message || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  // Keep function refs updated for keyboard shortcuts (avoids stale closures in useEffect)
  handleSaveFnRef.current = handleSave;
  handleRunFnRef.current = handleRun;

  // FR-V5-05/06: name editing
  const NAME_PATTERN = /^[a-zA-Z0-9 _\-]+$/;
  const handleNameEditStart = () => {
    if (!workflowDef) return;
    setNameInput(workflowDef.name || '');
    setEditingName(true);
  };
  const handleNameEditConfirm = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length > 128 || !NAME_PATTERN.test(trimmed)) {
      setEditingName(false);
      return;
    }
    if (trimmed !== workflowDef?.name) {
      setWorkflowDef({ ...workflowDef, name: trimmed });
      markDirty();
    }
    setEditingName(false);
  };
  const handleNameEditCancel = () => {
    setEditingName(false);
  };
  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') handleNameEditConfirm();
    if (e.key === 'Escape') handleNameEditCancel();
  };

  // FR-V5-38: Export workflow as JSON
  const handleExport = () => {
    if (!workflowDef) return;
    const sanitized = sanitizeWorkflow({
      ...workflowDef,
      nodes: canvasStateRef.current?.nodes ?? workflowDef.nodes,
      edges: canvasStateRef.current?.edges ?? workflowDef.edges,
    });
    const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowDef.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // FR-V5-39: Import workflow from JSON
  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) throw new Error('Invalid workflow: missing nodes');
      if (!parsed.edges || !Array.isArray(parsed.edges)) throw new Error('Invalid workflow: missing edges');
      const res = await apiPost('/api/v1/workflows', {
        name: parsed.name || file.name.replace('.json', ''),
        description: parsed.description || '',
        nodes: parsed.nodes,
        edges: parsed.edges,
        settings: parsed.settings || {},
        initialContext: parsed.initialContext || {},
      });
      const imported = res?.workflow ?? res;
      setWorkflowDef(imported);
      setSelectedWorkflowId(imported.id);
      setIsDirty(false);
      refreshWorkflows();
    } catch (e) {
      setImportError(e.message);
    }
    // Reset file input so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // FR-V5-37: Duplicate workflow
  const handleDuplicate = async () => {
    if (!workflowDef) return;
    const sanitized = sanitizeWorkflow({
      ...workflowDef,
      nodes: canvasStateRef.current?.nodes ?? workflowDef.nodes,
      edges: canvasStateRef.current?.edges ?? workflowDef.edges,
    });
    const copy = {
      name: `${sanitized.name || 'Workflow'} - Copy`,
      description: sanitized.description || '',
      nodes: sanitized.nodes,
      edges: sanitized.edges,
      settings: sanitized.settings || {},
      initialContext: sanitized.initialContext || {},
      projectId: sanitized.projectId,
    };
    const res = await apiPost('/api/v1/workflows', copy);
    const created = res?.workflow ?? res;
    setWorkflowDef(created);
    setSelectedWorkflowId(created.id);
    setIsDirty(false);
    refreshWorkflows();
  };

  const providerLabel = runtimeProvider
    ? runtimeProvider === 'codex'
      ? 'Codex'
      : runtimeProvider === 'gemini'
      ? 'Gemini'
      : 'Claude'
    : selectedRuntimeProvider === 'codex'
    ? 'Codex'
    : selectedRuntimeProvider === 'gemini'
    ? 'Gemini'
    : selectedRuntimeProvider === 'claude'
    ? 'Claude'
    : 'Auto';

  const providerStrategyLabel = providerStrategy?.mode
    ? (providerStrategy.mode === 'auto'
      ? 'Auto fallback'
      : providerStrategy.mode === 'codex'
      ? 'Codex only'
      : providerStrategy.mode === 'gemini'
      ? 'Gemini only'
      : providerStrategy.mode === 'claude'
      ? 'Claude only'
      : 'Auto fallback')
    : (selectedRuntimeProvider === 'codex'
      ? 'Codex only'
      : selectedRuntimeProvider === 'gemini'
      ? 'Gemini only'
      : selectedRuntimeProvider === 'claude'
      ? 'Claude only'
      : 'Auto fallback');

  const hasCustomRuntimeSelections =
    (runtimeModels.claude && runtimeModels.claude !== runtimeDefaults.claude)
    || (runtimeModels.codex && runtimeModels.codex !== runtimeDefaults.codex)
    || (runtimeModels.gemini && runtimeModels.gemini !== runtimeDefaults.gemini);

  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        {workflowDef && editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value.slice(0, 128))}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameEditConfirm}
            className="text-sm font-semibold text-white bg-gray-800 border border-gray-600 rounded px-2 py-0.5 outline-none focus:border-blue-500 max-w-[240px]"
            maxLength={128}
          />
        ) : (
          <span
            className="text-sm font-semibold text-white cursor-pointer hover:text-blue-300 transition-colors"
            onClick={handleNameEditStart}
            title={workflowDef ? 'Click to rename workflow' : ''}
          >
            {workflowDef?.name || 'Swarm Orchestrator'}{isDirty ? ' *' : ''}
          </span>
        )}
        <div className="flex-1" />

        <button
          onClick={(e) => { e.stopPropagation(); setInboxOpen((open) => !open); }}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            pendingCount > 0 ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {'\uD83D\uDCE5'} HITL{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>

        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>Runtime</span>
          <select
            value={selectedRuntimeProvider}
            onChange={(e) => setSelectedRuntimeProvider(e.target.value)}
            disabled={isExecutionActive || executing}
            className="bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600 disabled:opacity-50"
            title="Choose the provider strategy for the next run"
          >
            <option value="auto">Auto</option>
            <option value="claude" disabled={!runtimeAvailability.claude}>Claude{runtimeAvailability.claude ? '' : ' (Unavailable)'}</option>
            <option value="codex" disabled={!runtimeAvailability.codex}>Codex{runtimeAvailability.codex ? '' : ' (Unavailable)'}</option>
            <option value="gemini" disabled={!runtimeAvailability.gemini}>Gemini{runtimeAvailability.gemini ? '' : ' (Unavailable)'}</option>
          </select>
        </label>

        <div className="relative">
          <button
            onClick={() => setShowModelSettings((v) => !v)}
            disabled={isExecutionActive || executing}
            className="text-[11px] px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-600 hover:border-gray-500 disabled:opacity-50 transition-colors"
            title="Configure model per provider"
          >
            Models {hasCustomRuntimeSelections ? '*' : ''}
          </button>
          {showModelSettings && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 min-w-[220px]">
              <div className="text-[11px] text-gray-300 font-semibold mb-2">Model per Provider</div>
              <label className="flex items-center gap-2 text-[11px] text-gray-400 mb-1.5">
                <span className="w-14">Claude</span>
                <select
                  value={runtimeModels.claude}
                  onChange={(e) => setRuntimeModels((m) => ({ ...m, claude: e.target.value }))}
                  disabled={!runtimeAvailability.claude}
                  className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  {runtimeCapabilities.claude.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-gray-500 mb-2">
                {runtimeAvailability.claude
                  ? `Default detected: ${runtimeDefaults.claude || 'none'}`
                  : 'Claude runtime not detected on this server'}
              </div>
              <label className="flex items-center gap-2 text-[11px] text-gray-400 mb-1.5">
                <span className="w-14">Codex</span>
                <select
                  value={runtimeModels.codex}
                  onChange={(e) => setRuntimeModels((m) => ({ ...m, codex: e.target.value }))}
                  disabled={!runtimeAvailability.codex}
                  className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
                >
                  {runtimeCapabilities.codex.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-gray-500 mb-2">
                {runtimeAvailability.codex
                  ? `Default detected: ${runtimeDefaults.codex || 'none'}`
                  : 'Codex runtime not detected on this server'}
              </div>
              <label className="flex items-center gap-2 text-[11px] text-gray-400">
                <span className="w-14">Gemini</span>
                <select
                  value={runtimeModels.gemini}
                  onChange={(e) => setRuntimeModels((m) => ({ ...m, gemini: e.target.value }))}
                  disabled={!runtimeAvailability.gemini}
                  className="flex-1 bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
                >
                  {runtimeCapabilities.gemini.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
              <div className="text-[10px] text-gray-500">
                {runtimeAvailability.gemini
                  ? `Default detected: ${runtimeDefaults.gemini || 'none'}`
                  : 'Gemini runtime not detected on this server'}
              </div>
              {runtimeCapabilityError && (
                <div className="mt-2 text-[10px] text-amber-300">
                  Runtime model list unavailable: {runtimeCapabilityError}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowHistory((v) => !v)}
          disabled={!workflowDef}
          title={!workflowDef ? 'No workflow loaded' : 'Execution history'}
          className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            showHistory ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
          }`}
        >
          History
        </button>

        <button
          onClick={() => setShowTemplates(true)}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors"
        >
          Templates
        </button>

        <button
          onClick={() => setShowVersions((v) => !v)}
          disabled={!workflowDef}
          title={!workflowDef ? 'No workflow loaded' : 'Version history'}
          className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            showVersions ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Versions
        </button>

        <button
          onClick={() => setShowSettings(true)}
          disabled={!workflowDef}
          title={!workflowDef ? 'No workflow loaded' : 'Workflow settings'}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {'\u2699'} Settings
        </button>

        <button
          onClick={handleSave}
          disabled={!isDirty || !workflowDef || saving}
          title={!workflowDef ? 'No workflow loaded' : !isDirty ? 'No unsaved changes' : 'Save workflow (Ctrl+S)'}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? '...' : 'Save'}
        </button>

        {(executionStatus === 'idle' || executionStatus === 'completed') && (
          <button
            onClick={workflowDef && activeProjectId && !hasValidationErrors ? handleRun : undefined}
            disabled={executing || !workflowDef || !activeProjectId || hasValidationErrors}
            title={
              !activeProjectId
                ? 'Select a project first'
                : !workflowDef
                ? 'Generate or load a workflow first'
                : hasValidationErrors
                ? `${validationErrorCount} validation error${validationErrorCount !== 1 ? 's' : ''} — fix before running`
                : 'Run workflow (Ctrl+Enter)'
            }
            className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {executing ? '...' : 'Run'}
          </button>
        )}

        {executionStatus === 'running' && (
          <button
            onClick={handlePause}
            disabled={pausing}
            className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40"
          >
            {pausing ? '...' : 'Pause'}
          </button>
        )}

        {executionStatus === 'paused' && (
          <button
            onClick={handleResume}
            disabled={pausing}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40"
          >
            {pausing ? '...' : 'Resume'}
          </button>
        )}

        {(executionStatus === 'running' || executionStatus === 'paused' || executionStatus === 'blocked') && (
          <button
            onClick={handleStop}
            disabled={executing}
            className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40"
          >
            {executing ? '...' : 'Stop'}
          </button>
        )}

        <span className={`text-xs capitalize ${statusColors[executionStatus] || 'text-gray-400'}`}>
          ● {executionStatus}
        </span>

        <span className="text-[11px] px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
          Provider: {providerLabel}
        </span>

        <span className="text-[11px] text-gray-500">
          {providerStrategyLabel}
        </span>

        {(executionStatus === 'stopped' || executionStatus === 'completed') && (
          <button
            onClick={reset}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {showMissingProjectMessage && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-950/40 border-b border-amber-900/60">
          Select a project in the sidebar to run this workflow.
        </div>
      )}

      {executionStatus === 'blocked' && runtimeBlocker && (
        <div className="px-4 py-2 text-xs text-orange-200 bg-orange-950/40 border-b border-orange-900/60">
          {runtimeBlocker.message}
          {runtimeBlocker.provider ? ` Provider: ${runtimeBlocker.provider}.` : ''}
        </div>
      )}

      {lastFallback && (
        <div className="px-4 py-2 text-xs text-sky-200 bg-sky-950/30 border-b border-sky-900/60">
          Runtime fallback: {lastFallback.fromProvider} to {lastFallback.toProvider}
          {lastFallback.reason ? ` because ${lastFallback.reason}` : ''}.
        </div>
      )}

      {saveError && (
        <div className="px-4 py-2 text-xs text-red-300 bg-red-950/40 border-b border-red-900/60">
          Save failed: {saveError}
        </div>
      )}

      {saveSuccess && (
        <div className="px-4 py-2 text-xs text-green-300 bg-green-950/40 border-b border-green-900/60">
          Workflow saved successfully.
        </div>
      )}

      {validationErrors.length > 0 && (executionStatus === 'idle' || executionStatus === 'completed') && (
        <div className="px-4 py-2 text-xs border-b border-amber-900/60 bg-amber-950/30">
          <span className="text-amber-300 font-semibold">Validation ({validationErrors.length}):</span>
          {validationErrors.map((err, i) => (
            <span key={i} className={err.severity === 'error' ? 'text-red-300 ml-2' : 'text-amber-200 ml-2'}>
              {err.severity === 'error' ? '[ERR]' : '[WARN]'} {err.message}{i < validationErrors.length - 1 ? ';' : ''}
            </span>
          ))}
        </div>
      )}

      <PromptToFlowBar
        onWorkflowGenerated={(workflowId, animatedDef) => {
          setWorkflowDef(animatedDef);
          setSelectedWorkflowId(workflowId);
          setIsDirty(false);
          setSaveError(null);
          refreshWorkflows();
        }}
      />

      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-300">Saved workflows</span>
        <select
          value={selectedWorkflowId}
          onChange={(e) => setSelectedWorkflowId(e.target.value)}
          disabled={workflowsLoading || savedWorkflows.length === 0 || isExecutionActive}
          className="min-w-72 max-w-[28rem] bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-600 disabled:opacity-50"
        >
          <option value="">
            {workflowsLoading
              ? 'Loading workflows...'
              : savedWorkflows.length === 0
              ? 'No saved workflows available'
              : 'Select a saved workflow'}
          </option>
          {savedWorkflows.map((workflow) => {
            const dateStr = workflow.updatedAt ?? workflow.createdAt;
            const suffix = dateStr
              ? ` (${new Date(dateStr).toLocaleDateString()})`
              : '';
            return (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}{suffix}
              </option>
            );
          })}
        </select>
        <button
          onClick={handleLoadWorkflow}
          disabled={!selectedWorkflowId || isExecutionActive}
          className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Load workflow
        </button>
        <button
          onClick={refreshWorkflows}
          disabled={workflowsLoading}
          className="text-xs px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-40"
        >
          Refresh
        </button>
        <button
          onClick={handleDuplicate}
          disabled={!workflowDef || isExecutionActive}
          title={!workflowDef ? 'No workflow loaded' : 'Duplicate workflow'}
          className="text-xs px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Duplicate
        </button>
        <button
          onClick={handleExport}
          disabled={!workflowDef || isExecutionActive}
          title={!workflowDef ? 'No workflow loaded' : 'Export workflow as JSON'}
          className="text-xs px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isExecutionActive}
          title="Import workflow from JSON file"
          className="text-xs px-2 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
        <div className="flex-1" />
        <span className="text-xs text-gray-500">
          {activeProjectId ? 'Shows current-project workflows plus unscoped ones' : 'Shows all saved workflows'}
        </span>
      </div>

      {workflowsError && (
        <div className="px-4 py-2 text-xs text-red-400 bg-gray-900 border-b border-gray-800">
          Failed to load saved workflows: {workflowsError}
        </div>
      )}

      {importError && (
        <div className="px-4 py-2 text-xs text-red-300 bg-red-950/40 border-b border-red-900/60 flex items-center gap-2">
          <span>Import failed: {importError}</span>
          <button onClick={() => setImportError(null)} className="text-red-400 hover:text-white text-xs ml-auto">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <SwarmCanvas key={`${workflowDef?.id ?? 'none'}:${activeExecutionId ?? 'idle'}`} workflowDef={workflowDef} markDirty={markDirty} onCanvasChange={onCanvasChange} />
        </ReactFlowProvider>
      </div>

      {inboxOpen && (
        <div className="border-t border-gray-700 bg-gray-900 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <span className="text-xs font-semibold text-gray-300">HITL Approvals</span>
            <button onClick={() => setInboxOpen(false)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>
          <HitlInbox />
        </div>
      )}

      <BroadcastBar />

      {ptyExplosionNodeId && (
        <PtyExplosion
          key={ptyExplosionNodeId}
          sessionId={ptyExplosionNodeId}
          onClose={() => setPtyExplosionNodeId(null)}
        />
      )}

      {showSettings && workflowDef && (
        <WorkflowSettingsModal
          workflowDef={workflowDef}
          onApply={(updatedSettings, updatedContext) => {
            setWorkflowDef({
              ...workflowDef,
              settings: { ...(workflowDef.settings || {}), ...updatedSettings },
              initialContext: updatedContext,
            });
            markDirty();
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHistory && workflowDef?.id && (
        <ExecutionHistory
          workflowId={workflowDef.id}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showTemplates && (
        <TemplateGallery
          onInstantiate={(workflow) => {
            setWorkflowDef(workflow);
            setSelectedWorkflowId(workflow.id);
            setIsDirty(false);
            setSaveError(null);
            refreshWorkflows();
            setShowTemplates(false);
          }}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {showVersions && workflowDef?.id && (
        <VersionHistory
          workflowId={workflowDef.id}
          onRestore={(restored) => {
            setWorkflowDef(restored);
            setIsDirty(false);
            setSaveError(null);
            refreshWorkflows();
            setShowVersions(false);
          }}
          onPreview={() => {}}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}
