// client/src/views/SwarmView.jsx
// Layout shell for the Swarm Orchestrator — toolbar + canvas.
import { useState, useEffect, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import SwarmCanvas from '../canvas/SwarmCanvas';
import PromptToFlowBar from '../canvas/PromptToFlowBar';
import BroadcastBar from '../canvas/BroadcastBar';
import PtyExplosion from '../canvas/PtyExplosion';
import HitlInbox, { getPendingCount } from '../panels/HitlInbox';
import { useSwarmStore } from '../store/SwarmContext';
import { useSwarm } from '../hooks/useSwarm';
import { useInbox } from '../hooks/useInbox.js';
import { useWorkflowList } from '../hooks/useWorkflow.js';
import { useAppState } from '../store/AppContext';
import { apiPost } from '../hooks/useApi.js';

const statusColors = {
  idle: 'text-gray-400',
  running: 'text-blue-400 animate-pulse',
  paused: 'text-yellow-400',
  stopped: 'text-red-400',
};

export default function SwarmView() {
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);
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
  const isExecutionActive = executionStatus === 'running' || executionStatus === 'paused';
  const savedWorkflows = useMemo(() => {
    return workflows
      .filter((workflow) => !activeProjectId || !workflow.projectId || workflow.projectId === activeProjectId)
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });
  }, [workflows, activeProjectId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && ptyExplosionNodeId !== null) {
        e.preventDefault();
        setPtyExplosionNodeId(null);
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

  const handleRun = async () => {
    setExecuting(true);
    try {
      await startExecution(activeProjectId, projectPath);
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
  };

  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="text-sm font-semibold text-white">Swarm Orchestrator</span>
        <div className="flex-1" />

        <button
          onClick={(e) => { e.stopPropagation(); setInboxOpen((open) => !open); }}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            pendingCount > 0 ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {'\uD83D\uDCE5'} HITL{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>

        {(executionStatus === 'idle' || executionStatus === 'completed') && (
          <button
            onClick={workflowDef && activeProjectId ? handleRun : undefined}
            disabled={executing || !workflowDef || !activeProjectId}
            title={
              !activeProjectId
                ? 'Select a project first'
                : !workflowDef
                ? 'Generate or load a workflow first'
                : 'Run workflow'
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

        {(executionStatus === 'running' || executionStatus === 'paused') && (
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

        {(executionStatus === 'stopped' || executionStatus === 'completed') && (
          <button
            onClick={reset}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <PromptToFlowBar
        onWorkflowGenerated={(workflowId, animatedDef) => {
          setWorkflowDef(animatedDef);
          setSelectedWorkflowId(workflowId);
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
          {savedWorkflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
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

      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <SwarmCanvas workflowDef={workflowDef} />
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
          sessionId={ptyExplosionNodeId}
          onClose={() => setPtyExplosionNodeId(null)}
        />
      )}
    </div>
  );
}
