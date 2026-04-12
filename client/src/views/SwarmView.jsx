// client/src/views/SwarmView.jsx
// Layout shell for the Swarm Orchestrator — toolbar + canvas.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import SwarmCanvas from '../canvas/SwarmCanvas';
import PromptToFlowBar from '../canvas/PromptToFlowBar';
// BroadcastBar removed — broadcast controls are now integrated into ChatPanel
import PtyExplosion from '../canvas/PtyExplosion';
import WorkflowSettingsModal from '../canvas/WorkflowSettingsModal';
import ExecutionHistory from '../canvas/ExecutionHistory';
import VersionHistory from '../canvas/VersionHistory';
import { useSwarmStore } from '../store/SwarmContext';
import { useSwarm } from '../hooks/useSwarm';
import { useInbox } from '../hooks/useInbox.js';
import { useWorkflowList } from '../hooks/useWorkflow.js';
import { useAppDispatch, useAppState } from '../store/AppContext';
import { apiDelete, apiGet, apiPost, apiPut } from '../hooks/useApi.js';
import { sanitizeWorkflow } from '../utils/sanitizeWorkflow.js';
import { useCanvasValidation } from '../hooks/useCanvasValidation.js';
import { isStructuredSpawnMode } from '../utils/runtimeModes.js';
import WorkflowArtifactPanel from '../panels/WorkflowArtifactPanel';

const statusColors = {
  idle: 'text-gray-400',
  running: 'text-blue-400 animate-pulse',
  paused: 'text-orange-400',
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

const ACTIVE_AGENT_STATUSES = ['running', 'paused', 'blocked'];
const LIVE_AGENT_STATUSES = ['running', 'blocked'];

export default function SwarmView() {
  const appDispatch = useAppDispatch();
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
  const runtimeBlocker = useSwarmStore((s) => s.runtimeBlocker);
  const runtimeProvider = useSwarmStore((s) => s.runtimeProvider);
  const providerStrategy = useSwarmStore((s) => s.providerStrategy);
  const lastFallback = useSwarmStore((s) => s.lastFallback);
  const agentStates = useSwarmStore((s) => s.agentStates);
  const setPaused = useSwarmStore((s) => s.setPaused);
  const setResumed = useSwarmStore((s) => s.setResumed);
  const reset = useSwarmStore((s) => s.reset);
  const hardReset = useSwarmStore((s) => s.hardReset);
  const ptyExplosionNodeId = useSwarmStore((s) => s.ptyExplosionNodeId);
  const ptyExplosionSessionId = useSwarmStore((s) => (
    s.ptyExplosionNodeId ? (s.agentStates[s.ptyExplosionNodeId]?.sessionId ?? null) : null
  ));
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);
  const workflowDef = useSwarmStore((s) => s.workflowDef);
  const setWorkflowDef = useSwarmStore((s) => s.setWorkflowDef);
  const ptyExplosionNodeLabel = useMemo(() => (
    workflowDef?.nodes?.find((node) => node.id === ptyExplosionNodeId)?.data?.label || ptyExplosionNodeId || 'Agent'
  ), [workflowDef, ptyExplosionNodeId]);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const setSidePanelOpen = useSwarmStore((s) => s.setSidePanelOpen);
  const setSidePanelMode = useSwarmStore((s) => s.setSidePanelMode);
  const setAgentValidationIssuesByNodeId = useSwarmStore((s) => s.setAgentValidationIssuesByNodeId);
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
  // fileInputRef removed — file input now lives inside NodePalette
  const selectedRuntimeProvider = useSwarmStore((s) => s.selectedRuntimeProvider);
  const setSelectedRuntimeProvider = useSwarmStore((s) => s.setSelectedRuntimeProvider);
  const [runtimeModels, setRuntimeModels] = useState({ claude: '', codex: '', gemini: '' });
  const [runtimeDefaults, setRuntimeDefaults] = useState({ claude: '', codex: '', gemini: '' });
  const [runtimeAvailability, setRuntimeAvailability] = useState({ claude: false, codex: false, gemini: false });
  const [showSettings, setShowSettings] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const modelSettingsRef = useRef(null);
  useEffect(() => {
    if (!showModelSettings) return;
    const handler = (e) => {
      if (modelSettingsRef.current && !modelSettingsRef.current.contains(e.target)) {
        setShowModelSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelSettings]);
  const [showHistory, setShowHistory] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showArtifactPanel, setShowArtifactPanel] = useState(false);
  const [promptToFlowResetKey, setPromptToFlowResetKey] = useState(0);
  const [layoutNonce, setLayoutNonce] = useState(0);
  // showSavedWorkflows state removed — workflows section now lives in NodePalette
  const [runtimeCapabilities, setRuntimeCapabilities] = useState({
    claude: [],
    codex: [],
    gemini: [],
  });
  const [runtimeCapabilityError, setRuntimeCapabilityError] = useState('');
  const [streamJsonForceEnabled, setStreamJsonForceEnabled] = useState(false);
  const [streamJsonFeedback, setStreamJsonFeedback] = useState('');
  const [streamJsonFeedbackTone, setStreamJsonFeedbackTone] = useState('text-gray-400');
  const streamJsonForceTimerRef = useRef(null);
  const streamJsonFeedbackTimerRef = useRef(null);

  const { activeProjectId, projects, projectsHydrated, navigationIntent } = useAppState();
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );
  const [drilldownContext, setDrilldownContext] = useState(null);
  const projectPath = activeProject?.path ?? '';
  const activeProjectReady = Boolean(activeProjectId && activeProject);
  const isResolvingActiveProject = Boolean(activeProjectId && !activeProject && !projectsHydrated);
  const {
    workflows,
    loading: workflowsLoading,
    error: workflowsError,
    refresh: refreshWorkflows,
  } = useWorkflowList();

  const { startExecution, stopExecution } = useSwarm(workflowDef?.id);
  useInbox(activeExecutionId);

  const isExecutionActive = ['running', 'paused', 'blocked'].includes(executionStatus);
  const activeAgentEntries = useMemo(
    () => Object.entries(agentStates ?? {}).filter(([, state]) => state?.status),
    [agentStates]
  );
  const activeStreamJsonAgentIds = useMemo(
    () => activeAgentEntries
      .filter(([, state]) => isStructuredSpawnMode(state?.spawnMode) && ACTIVE_AGENT_STATUSES.includes(state.status))
      .map(([nodeId]) => nodeId),
    [activeAgentEntries]
  );
  const liveStreamJsonAgentIds = useMemo(
    () => activeAgentEntries
      .filter(([, state]) => isStructuredSpawnMode(state?.spawnMode) && LIVE_AGENT_STATUSES.includes(state.status))
      .map(([nodeId]) => nodeId),
    [activeAgentEntries]
  );
  const messageableStreamJsonAgentIds = useMemo(
    () => activeAgentEntries
      .filter(([, state]) => isStructuredSpawnMode(state?.spawnMode) && state?.acceptsMessages)
      .map(([nodeId]) => nodeId),
    [activeAgentEntries]
  );
  const activePtyAgentIds = useMemo(
    () => activeAgentEntries
      .filter(([, state]) => !isStructuredSpawnMode(state?.spawnMode) && ACTIVE_AGENT_STATUSES.includes(state.status))
      .map(([nodeId]) => nodeId),
    [activeAgentEntries]
  );
  const allStreamJsonAgentIds = useMemo(
    () => activeAgentEntries
      .filter(([, state]) => isStructuredSpawnMode(state?.spawnMode))
      .map(([nodeId]) => nodeId),
    [activeAgentEntries]
  );
  const showStreamJsonToolbar = Boolean(activeExecutionId && messageableStreamJsonAgentIds.length > 0 && activePtyAgentIds.length === 0);
  const showMissingProjectMessage = Boolean(workflowDef && projectsHydrated && !activeProjectId);
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
  handleRunRef.current = { workflowDef, activeProjectReady, executing, executionStatus, validationErrors };
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
        const canRun = r.activeProjectReady && !r.executing
          && (r.executionStatus === 'idle' || r.executionStatus === 'completed')
          && !(r.validationErrors?.filter((issue) => issue.scope === 'global' && issue.severity === 'error').length > 0);
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
    if (navigationIntent?.focus !== 'workflow-runtime') return;

    let cancelled = false;
    const targetWorkflowId = navigationIntent.workflowId ?? null;
    setDrilldownContext({
      source: navigationIntent.source ?? 'unknown',
      packId: navigationIntent.packId ?? null,
      workflowId: targetWorkflowId,
      executionId: navigationIntent.executionId ?? null,
    });

    async function loadWorkflowFromIntent() {
      if (!targetWorkflowId) {
        appDispatch({ type: 'CLEAR_NAVIGATION_INTENT' });
        return;
      }

      setSelectedWorkflowId(targetWorkflowId);
      if (workflowDef?.id === targetWorkflowId) {
        appDispatch({ type: 'CLEAR_NAVIGATION_INTENT' });
        return;
      }

      const saved = savedWorkflows.find((workflow) => workflow.id === targetWorkflowId);
      if (saved) {
        if (!cancelled) {
          setWorkflowDef(saved);
          setIsDirty(false);
          setSaveError(null);
        }
        appDispatch({ type: 'CLEAR_NAVIGATION_INTENT' });
        return;
      }

      try {
        const response = await apiGet(`/api/v1/workflows/${targetWorkflowId}`);
        if (!cancelled) {
          setWorkflowDef(response?.workflow ?? response);
          setIsDirty(false);
          setSaveError(null);
        }
      } catch {
        // Keep the context banner so the user can understand why the expected drill-down did not load.
      } finally {
        appDispatch({ type: 'CLEAR_NAVIGATION_INTENT' });
      }
    }

    void loadWorkflowFromIntent();

    return () => {
      cancelled = true;
    };
  }, [appDispatch, apiGet, navigationIntent, savedWorkflows, setWorkflowDef, workflowDef?.id]);

  useEffect(() => {
    if (!drilldownContext?.workflowId) return;
    if (
      (selectedWorkflowId && drilldownContext.workflowId !== selectedWorkflowId)
      || (workflowDef?.id && drilldownContext.workflowId !== workflowDef.id)
    ) {
      setDrilldownContext(null);
    }
  }, [drilldownContext?.workflowId, selectedWorkflowId, workflowDef?.id]);

  useEffect(() => {
    return () => {
      clearTimeout(streamJsonForceTimerRef.current);
      clearTimeout(streamJsonFeedbackTimerRef.current);
    };
  }, []);

  const setTimedStreamJsonFeedback = useCallback((message, tone = 'text-gray-400', durationMs = 3200) => {
    setStreamJsonFeedback(message);
    setStreamJsonFeedbackTone(tone);
    clearTimeout(streamJsonFeedbackTimerRef.current);
    if (durationMs > 0) {
      streamJsonFeedbackTimerRef.current = setTimeout(() => {
        setStreamJsonFeedback('');
      }, durationMs);
    }
  }, []);

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

    let runWorkflowId = workflowDef?.id;

    // Auto-create workflow on the server when the user built a canvas from scratch
    if (!runWorkflowId) {
      const { nodes, edges } = canvasStateRef.current;
      if (!nodes.length) return;
      try {
        const res = await apiPost('/api/v1/workflows', {
          name: 'Untitled Workflow',
          description: '',
          nodes,
          edges,
          settings: {},
          initialContext: {},
          projectId: activeProjectId,
        });
        const created = res?.workflow ?? res;
        setWorkflowDef(created);
        setSelectedWorkflowId(created.id);
        setIsDirty(false);
        refreshWorkflows();
        runWorkflowId = created.id;
      } catch (e) {
        console.error('[SwarmView] auto-create workflow failed:', e);
        return;
      }
    }

    setPromptToFlowResetKey((value) => value + 1);
    setExecuting(true);
    try {
      const models = {};
      if (runtimeModels.claude) models.claude = runtimeModels.claude;
      if (runtimeModels.codex) models.codex = runtimeModels.codex;
      if (runtimeModels.gemini) models.gemini = runtimeModels.gemini;
      await startExecution(activeProjectId, projectPath, selectedRuntimeProvider, Object.keys(models).length > 0 ? models : null, runWorkflowId);
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
      setStreamJsonForceEnabled(false);
      setStreamJsonFeedback('');
    } finally {
      setPausing(false);
    }
  };

  const handleStreamJsonAction = useCallback(async (mode) => {
    if (!activeExecutionId) return;

    const targetNodeIds = mode === 'reset'
      ? (activeStreamJsonAgentIds.length > 0 ? activeStreamJsonAgentIds : allStreamJsonAgentIds)
      : (liveStreamJsonAgentIds.length > 0 ? liveStreamJsonAgentIds : activeStreamJsonAgentIds);

    if (targetNodeIds.length === 0) return;

    if (mode === 'graceful') {
      clearTimeout(streamJsonForceTimerRef.current);
      setStreamJsonForceEnabled(false);
      streamJsonForceTimerRef.current = setTimeout(() => {
        setStreamJsonForceEnabled(true);
      }, 5000);
      setTimedStreamJsonFeedback('Stopping...', 'text-amber-300', 0);
    }

    setExecuting(true);
    try {
      await Promise.all(targetNodeIds.map((nodeId) => (
        apiDelete(`/api/v1/swarm/${activeExecutionId}?nodeId=${encodeURIComponent(nodeId)}&mode=${mode}`)
      )));

      if (mode === 'forced') {
        setTimedStreamJsonFeedback('Stopped', 'text-red-300');
      } else if (mode === 'reset') {
        hardReset();
        setTimedStreamJsonFeedback('Reset', 'text-emerald-300');
        setStreamJsonForceEnabled(false);
      }
    } catch (error) {
      clearTimeout(streamJsonForceTimerRef.current);
      setStreamJsonForceEnabled(false);
      setTimedStreamJsonFeedback(`Error: ${error.message}`, 'text-red-300', 5000);
    } finally {
      setExecuting(false);
    }
  }, [
    activeExecutionId,
    activeStreamJsonAgentIds,
    allStreamJsonAgentIds,
    liveStreamJsonAgentIds,
    setTimedStreamJsonFeedback,
    hardReset,
  ]);

  useEffect(() => {
    if (!showStreamJsonToolbar) {
      clearTimeout(streamJsonForceTimerRef.current);
      setStreamJsonForceEnabled(false);
      return;
    }

    if (executionStatus === 'paused') {
      clearTimeout(streamJsonForceTimerRef.current);
      setStreamJsonForceEnabled(false);
      if (streamJsonFeedback === 'Stopping...') {
        setTimedStreamJsonFeedback('Stopped', 'text-emerald-300');
      }
      return;
    }

    if (executionStatus === 'completed' || executionStatus === 'stopped') {
      clearTimeout(streamJsonForceTimerRef.current);
      setStreamJsonForceEnabled(false);
    }
  }, [executionStatus, showStreamJsonToolbar, streamJsonFeedback, setTimedStreamJsonFeedback]);

  const handleLoadWorkflow = () => {
    const selected = savedWorkflows.find((workflow) => workflow.id === selectedWorkflowId);
    if (!selected) return;

    reset();
    setWorkflowDef(selected);
    setIsDirty(false);
    setSaveError(null);
    setPromptToFlowResetKey((value) => value + 1);
  };

  // FR-V5-01: markDirty callback for SwarmCanvas
  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveError(null);
  }, []);

  // FR-V5-01: track latest canvas nodes/edges for save + FR-V5-44 validation
  // Also keep a state copy so validation re-runs when the child canvas
  // reports changes (the ref alone doesn't trigger parent re-renders).
  const [canvasNodesForValidation, setCanvasNodesForValidation] = useState([]);
  const [canvasEdgesForValidation, setCanvasEdgesForValidation] = useState([]);
  const onCanvasChange = useCallback((nodes, edges) => {
    canvasStateRef.current = { nodes, edges };
    setCanvasNodesForValidation(nodes);
    setCanvasEdgesForValidation(edges);
  }, []);

  // FR-V5-44: canvas validation — computed from latest canvas state
  const canvasValidation = useCanvasValidation(
    canvasNodesForValidation,
    canvasEdgesForValidation
  );
  // Keep validation errors in state so banners react to changes
  useEffect(() => {
    setValidationErrors(canvasValidation.errors);
  }, [canvasValidation.errors]);

  useEffect(() => {
    setAgentValidationIssuesByNodeId(canvasValidation.agentIssuesByNodeId);
    return () => setAgentValidationIssuesByNodeId({});
  }, [canvasValidation.agentIssuesByNodeId, setAgentValidationIssuesByNodeId]);

  const globalValidationIssues = canvasValidation.globalIssues ?? [];
  const blockingIssues = canvasValidation.blockingIssues ?? [];
  const blockingIssueCount = blockingIssues.length;
  const hasValidationErrors = blockingIssueCount > 0;

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
      setPromptToFlowResetKey((value) => value + 1);
      refreshWorkflows();
    } catch (e) {
      setImportError(e.message);
    }
    // Reset file input so the same file can be re-imported
    if (event.target) event.target.value = '';
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
    setPromptToFlowResetKey((value) => value + 1);
    refreshWorkflows();
  };

  const handleTidyLayout = () => {
    if (!workflowDef) return;
    setLayoutNonce((value) => value + 1);
    markDirty();
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
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-gray-950 text-white">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
        {workflowDef && editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value.slice(0, 128))}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameEditConfirm}
            className="text-sm font-semibold text-white bg-gray-800 border border-gray-600 rounded-md px-2 py-0.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 max-w-[240px]"
            maxLength={128}
          />
        ) : (
          <span
            className="text-sm font-semibold text-white cursor-pointer hover:text-blue-300 transition-colors truncate max-w-[200px]"
            onClick={handleNameEditStart}
            title={workflowDef ? 'Click to rename workflow' : ''}
          >
            {workflowDef?.name || 'Swarm Orchestrator'}{isDirty ? ' *' : ''}
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-800/60 text-gray-400 border border-gray-700/50">
          {isResolvingActiveProject
            ? 'loading...'
            : activeProject
            ? activeProject.name
            : 'No project'}
        </span>

        <div className="flex-1" />

        <div className="h-4 w-px bg-gray-700/60 mx-0.5" />

        <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <span>Runtime</span>
          <select
            value={selectedRuntimeProvider}
            onChange={(e) => setSelectedRuntimeProvider(e.target.value)}
            disabled={isExecutionActive || executing}
            className="bg-gray-800 text-white text-xs rounded-md px-2 py-1 border border-gray-600/80 disabled:opacity-50 focus:border-blue-500 outline-none"
            title="Choose the provider strategy for the next run"
          >
            <option value="auto">Auto</option>
            <option value="claude" disabled={!runtimeAvailability.claude}>Claude{runtimeAvailability.claude ? '' : ' (N/A)'}</option>
            <option value="codex" disabled={!runtimeAvailability.codex}>Codex{runtimeAvailability.codex ? '' : ' (N/A)'}</option>
            <option value="gemini" disabled={!runtimeAvailability.gemini}>Gemini{runtimeAvailability.gemini ? '' : ' (N/A)'}</option>
          </select>
        </label>

        <div className="relative" ref={modelSettingsRef}>
          <button
            onClick={() => setShowModelSettings((v) => !v)}
            disabled={isExecutionActive || executing}
            className="text-[11px] px-2 py-1 rounded-md bg-gray-800 text-gray-400 border border-gray-600/80 hover:border-gray-500 disabled:opacity-50 transition-colors"
            title="Configure model per provider"
          >
            Models {hasCustomRuntimeSelections ? '*' : ''}
          </button>
          {showModelSettings && (
            <>
            <div className="fixed inset-0 z-40" onClick={() => setShowModelSettings(false)} />
            <div ref={modelSettingsRef} className="absolute right-0 top-full mt-1 z-50 bg-gray-800/95 backdrop-blur-md border border-gray-600 rounded-xl shadow-2xl p-3 min-w-[220px]">
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
            </>
          )}
        </div>

        <div className="h-4 w-px bg-gray-700/60 mx-0.5" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            disabled={!workflowDef}
            title={!workflowDef ? 'No workflow loaded' : 'Execution history'}
            className={`text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              showHistory ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-800 border-gray-600/80 text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            History
          </button>
          <button
            onClick={() => setShowVersions((v) => !v)}
            disabled={!workflowDef}
            title={!workflowDef ? 'No workflow loaded' : 'Version history'}
            className={`text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              showVersions ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-800 border-gray-600/80 text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Versions
          </button>
          <button
            onClick={() => setShowSettings(true)}
            disabled={!workflowDef}
            title={!workflowDef ? 'No workflow loaded' : 'Workflow settings'}
            className="text-xs px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-600/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 inline -mt-px mr-0.5">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Settings
          </button>
        </div>

        <div className="h-4 w-px bg-gray-700/60 mx-0.5" />

        <button
          onClick={handleTidyLayout}
          disabled={!workflowDef}
          title={!workflowDef ? 'No workflow loaded' : 'Reorder the workflow layout'}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs px-2.5 py-1 rounded-md border border-gray-600/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Tidy
        </button>

        <button
          onClick={handleSave}
          disabled={!isDirty || !workflowDef || saving}
          title={!workflowDef ? 'No workflow loaded' : !isDirty ? 'No unsaved changes' : 'Save workflow (Ctrl+S)'}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          {saving ? '...' : 'Save'}
        </button>

        <div className="h-4 w-px bg-gray-700/60 mx-0.5" />

        {(executionStatus === 'idle' || executionStatus === 'completed') && (
          <button
            onClick={activeProjectReady && !hasValidationErrors ? handleRun : undefined}
            disabled={executing || !activeProjectReady || hasValidationErrors}
            title={
              isResolvingActiveProject
                ? 'Loading active project...'
                : !activeProjectId
                ? 'Select a project first'
                : hasValidationErrors
                ? `${blockingIssueCount} workflow blocker${blockingIssueCount !== 1 ? 's' : ''} — fix before running`
                : 'Run workflow (Ctrl+Enter)'
            }
            className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {executing ? '...' : 'Run'}
          </button>
        )}

        {executionStatus === 'running' && !showStreamJsonToolbar && (
          <button
            onClick={handlePause}
            disabled={pausing}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40"
          >
            {pausing ? '...' : 'Pause'}
          </button>
        )}

        {executionStatus === 'paused' && (
          <button
            onClick={handleResume}
            disabled={pausing}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40"
          >
            {pausing ? '...' : 'Resume'}
          </button>
        )}

        {showStreamJsonToolbar && (executionStatus === 'running' || executionStatus === 'blocked') && (
          <button
            onClick={() => handleStreamJsonAction('graceful')}
            disabled={executing}
            className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40"
          >
            {executing ? '...' : 'Stop'}
          </button>
        )}

        {showStreamJsonToolbar && streamJsonForceEnabled && liveStreamJsonAgentIds.length > 0 && (
          <button
            onClick={() => handleStreamJsonAction('forced')}
            disabled={executing}
            className="bg-red-800 hover:bg-red-700 text-white text-xs px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40"
          >
            {executing ? '...' : 'Force Stop'}
          </button>
        )}

        {showStreamJsonToolbar && messageableStreamJsonAgentIds.length > 0 && (
          <button
            onClick={() => handleStreamJsonAction('reset')}
            disabled={executing}
            className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded-md transition-colors disabled:opacity-40"
          >
            {executing ? '...' : 'Reset Session'}
          </button>
        )}

        {!showStreamJsonToolbar && (executionStatus === 'running' || executionStatus === 'paused' || executionStatus === 'blocked') && (
          <button
            onClick={handleStop}
            disabled={executing}
            className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-40"
          >
            {executing ? '...' : 'Stop'}
          </button>
        )}

        <span className={`text-[11px] capitalize ${statusColors[executionStatus] || 'text-gray-400'}`}>
          {executionStatus}
        </span>

        {showStreamJsonToolbar && streamJsonFeedback && (
          <span className={`text-[11px] ${streamJsonFeedbackTone}`}>
            {streamJsonFeedback}
          </span>
        )}

        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-800/60 text-gray-400 border border-gray-700/50">
          {providerLabel}
        </span>

        {(executionStatus === 'stopped' || executionStatus === 'completed') && (
          <button
            onClick={reset}
            className="text-xs px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-600/80 transition-colors"
          >
            Reset
          </button>
        )}

        <button
          onClick={() => setShowArtifactPanel(true)}
          disabled={!['completed', 'stopped', 'failed'].includes(executionStatus)}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title={!['completed', 'stopped', 'failed'].includes(executionStatus) ? 'Run the workflow first' : 'View workflow deliverable'}
        >
          Report
        </button>
      </div>

      {showMissingProjectMessage && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-950/40 border-b border-amber-900/60">
          Select a project in the sidebar to run this workflow.
        </div>
      )}

      {drilldownContext && (
        <div className="px-4 py-2 text-xs text-sky-200 bg-sky-950/30 border-b border-sky-900/60">
          Pack drill-down from {drilldownContext.source}: showing workflow{' '}
          <span className="font-semibold">{drilldownContext.workflowId ?? 'unavailable'}</span>.
          {drilldownContext.executionId
            ? ` Relevant execution context: ${drilldownContext.executionId}.`
            : ' No pack execution context is attached to this drill-down.'}
        </div>
      )}

      {executionStatus === 'blocked' && runtimeBlocker && (
        <div className="px-4 py-2 text-xs text-red-200 bg-red-950/50 border-b border-red-900/60 flex items-start gap-2">
          <span className="text-red-400 shrink-0 mt-px">&#9888;</span>
          <div className="min-w-0">
            <span className="font-semibold text-red-300">
              {runtimeBlocker.provider ? `${runtimeBlocker.provider[0].toUpperCase() + runtimeBlocker.provider.slice(1)} error` : 'Runtime error'}
              {runtimeBlocker.type ? ` (${runtimeBlocker.type.replace(/_/g, ' ')})` : ''}
            </span>
            {runtimeBlocker.message ? (
              <span className="ml-1.5 text-red-200/80">&mdash; {runtimeBlocker.message}</span>
            ) : (
              <span className="ml-1.5 text-red-200/60 italic">No details available from the provider.</span>
            )}
            {runtimeBlocker.provider && (
              <span className="ml-1.5 text-red-200/70">Provider: {runtimeBlocker.provider}.</span>
            )}
          </div>
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

      {globalValidationIssues.length > 0 && (executionStatus === 'idle' || executionStatus === 'completed') && (
        <div className="border-b border-amber-900/40 bg-gradient-to-r from-amber-950/25 via-amber-950/10 to-transparent px-4 py-2.5">
          <div className="flex flex-wrap items-start gap-2 text-xs">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-200">
              Validation
            </span>
            <span className="pt-0.5 text-gray-200">
              {globalValidationIssues.length} workflow issue{globalValidationIssues.length !== 1 ? 's' : ''} {globalValidationIssues.length === 1 ? 'needs' : 'need'} attention.
            </span>
            {globalValidationIssues.map((issue) => (
              <span
                key={issue.id}
                className={`rounded-full border px-2 py-0.5 ${
                  issue.severity === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-200'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                }`}
                title={issue.detail}
              >
                {issue.summary}
              </span>
            ))}
          </div>
        </div>
      )}

      <PromptToFlowBar
        resetSignal={promptToFlowResetKey}
        onWorkflowGenerated={(workflowId, animatedDef) => {
          setWorkflowDef(animatedDef);
          setSelectedWorkflowId(workflowId);
          setIsDirty(false);
          setSaveError(null);
          setPromptToFlowResetKey((value) => value + 1);
          refreshWorkflows();
        }}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ReactFlowProvider>
          <SwarmCanvas
            key={`${workflowDef?.id ?? 'none'}:${activeExecutionId ?? 'idle'}`}
            workflowDef={workflowDef}
            markDirty={markDirty}
            onCanvasChange={onCanvasChange}
            layoutNonce={layoutNonce}
            workflowProps={{
              workflows: savedWorkflows,
              selectedWorkflowId,
              onSelectWorkflow: setSelectedWorkflowId,
              onLoad: handleLoadWorkflow,
              onRefresh: refreshWorkflows,
              onDuplicate: handleDuplicate,
              onExport: handleExport,
              onImport: handleImport,
              loading: workflowsLoading,
              disabled: isExecutionActive,
              hasWorkflowDef: Boolean(workflowDef),
              error: workflowsError,
              importError,
              onDismissImportError: () => setImportError(null),
              projectLabel: isResolvingActiveProject
                ? 'Resolving project...'
                : activeProject
                ? `Workflows for ${activeProject.name}`
                : 'All saved workflows',
            }}
          />
        </ReactFlowProvider>
      </div>

      {/* Saved Workflows section moved into NodePalette sidebar */}

      {/* HITL inbox drawer removed — approvals now appear inline in ChatPanel */}

      {/* BroadcastBar removed — controls now live inside ChatPanel */}

      {ptyExplosionNodeId && activeExecutionId && (
        <PtyExplosion
          key={`${ptyExplosionNodeId}:${ptyExplosionSessionId ?? 'archived'}`}
          sessionId={ptyExplosionSessionId}
          executionId={activeExecutionId}
          nodeId={ptyExplosionNodeId}
          nodeLabel={ptyExplosionNodeLabel}
          onClose={() => setPtyExplosionNodeId(null)}
        />
      )}

      {showSettings && workflowDef && (
        <WorkflowSettingsModal
          workflowDef={workflowDef}
          onApply={(updatedSettings, updatedContext, updatedDescription) => {
            setWorkflowDef({
              ...workflowDef,
              settings: { ...(workflowDef.settings || {}), ...updatedSettings },
              initialContext: updatedContext,
              ...(updatedDescription !== undefined ? { description: updatedDescription } : {}),
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

      {showVersions && workflowDef?.id && (
        <VersionHistory
          workflowId={workflowDef.id}
          onRestore={(restored) => {
            setWorkflowDef(restored);
            setIsDirty(false);
            setSaveError(null);
            setPromptToFlowResetKey((value) => value + 1);
            refreshWorkflows();
            setShowVersions(false);
          }}
          onPreview={() => {}}
          onClose={() => setShowVersions(false)}
        />
      )}

      {showArtifactPanel && activeExecutionId && (
        <WorkflowArtifactPanel
          executionId={activeExecutionId}
          workflowName={workflowDef?.name || 'Workflow'}
          onClose={() => setShowArtifactPanel(false)}
        />
      )}
    </div>
  );
}
