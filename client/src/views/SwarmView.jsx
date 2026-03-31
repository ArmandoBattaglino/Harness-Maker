// client/src/views/SwarmView.jsx
// Layout shell for the Swarm Orchestrator — toolbar + canvas.
import { useState, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import SwarmCanvas from '../canvas/SwarmCanvas';
import PromptToFlowBar from '../canvas/PromptToFlowBar';
import BroadcastBar from '../canvas/BroadcastBar';
import PtyExplosion from '../canvas/PtyExplosion';
import HitlInbox, { getPendingCount } from '../panels/HitlInbox';
import { useSwarmStore } from '../store/SwarmContext';
import { useSwarm } from '../hooks/useSwarm';
import { useAppState } from '../store/AppContext';
import { apiPost } from '../hooks/useApi.js';

// Status indicator color map
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
  const interAgentFeed = useSwarmStore((s) => s.interAgentFeed);
  const setPaused = useSwarmStore((s) => s.setPaused);
  const setResumed = useSwarmStore((s) => s.setResumed);
  const reset = useSwarmStore((s) => s.reset);
  const ptyExplosionNodeId = useSwarmStore((s) => s.ptyExplosionNodeId);
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);

  const [workflowDef, setWorkflowDef] = useState(null);
  // Task #100 — HITL inbox drawer toggle
  const [inboxOpen, setInboxOpen] = useState(false);
  // Task #101 — loading state for run/stop
  const [executing, setExecuting] = useState(false);
  // Task #103 — loading state for pause/resume
  const [pausing, setPausing] = useState(false);
  // BUG-3 — error shown when run is attempted without a project selected
  const [runError, setRunError] = useState('');

  // Task #101 — project context for startExecution
  const { activeProjectId, projects } = useAppState();
  const projectPath = projects.find((p) => p.id === activeProjectId)?.path ?? '';

  // Task #101 — useSwarm hook (workflowId comes from workflowDef once generated)
  const { startExecution, stopExecution } = useSwarm(workflowDef?.id);

  // Task #100 — pending HITL count for badge
  const pendingCount = getPendingCount(inboxItems);

  // Escape key handler — close PTY explosion overlay if it's open
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

  // Task #101 — Run handler
  const handleRun = async () => {
    if (!activeProjectId) {
      setRunError('Select a project first before running a workflow.');
      return;
    }
    setRunError('');
    setExecuting(true);
    try {
      await startExecution(activeProjectId, projectPath);
    } finally {
      setExecuting(false);
    }
  };

  // Task #101 — Stop handler
  const handleStop = async () => {
    setExecuting(true);
    try {
      await stopExecution(activeExecutionId);
    } finally {
      setExecuting(false);
    }
  };

  // Task #103 — Pause handler
  const handlePause = async () => {
    setPausing(true);
    try {
      await apiPost(`/api/v1/swarm/${activeExecutionId}/pause`, {});
      setPaused();
    } finally {
      setPausing(false);
    }
  };

  // Task #103 — Resume handler
  const handleResume = async () => {
    setPausing(true);
    try {
      await apiPost(`/api/v1/swarm/${activeExecutionId}/resume`, {});
      setResumed();
    } finally {
      setPausing(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-gray-950 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="text-sm font-semibold text-white">Swarm Orchestrator</span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Task #100 — HITL inbox badge button */}
        <button
          onClick={(e) => { e.stopPropagation(); setInboxOpen((o) => !o); }}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            pendingCount > 0 ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {'\uD83D\uDCE5'} HITL{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>

        {/* Run button — always visible when idle; disabled with hint if preconditions not met */}
        {executionStatus === 'idle' && (
          <button
            onClick={workflowDef && activeProjectId ? handleRun : undefined}
            disabled={executing || !workflowDef || !activeProjectId}
            title={
              !activeProjectId
                ? 'Select a project first'
                : !workflowDef
                ? 'Generate a workflow below first'
                : 'Run workflow'
            }
            className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {executing ? '...' : 'Run'}
          </button>
        )}

        {/* Task #103 — Pause button: running */}
        {executionStatus === 'running' && (
          <button
            onClick={handlePause}
            disabled={pausing}
            className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40"
          >
            {pausing ? '...' : 'Pause'}
          </button>
        )}

        {/* Task #103 — Resume button: paused */}
        {executionStatus === 'paused' && (
          <button
            onClick={handleResume}
            disabled={pausing}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40"
          >
            {pausing ? '...' : 'Resume'}
          </button>
        )}

        {/* Task #101 — Stop button: running or paused */}
        {(executionStatus === 'running' || executionStatus === 'paused') && (
          <button
            onClick={handleStop}
            disabled={executing}
            className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-40"
          >
            {executing ? '...' : 'Stop'}
          </button>
        )}

        {/* Execution status indicator */}
        <span className={`text-xs capitalize ${statusColors[executionStatus] || 'text-gray-400'}`}>
          ● {executionStatus}
        </span>

        {/* Reset button — only when stopped */}
        {executionStatus === 'stopped' && (
          <button
            onClick={reset}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* BUG-3 — run error when no project selected */}
      {runError && (
        <div className="text-xs text-red-400 px-4 py-1 bg-gray-900">{runError}</div>
      )}

      {/* Prompt-to-Flow bar */}
      <PromptToFlowBar
        onWorkflowGenerated={(workflowId, animatedDef) => {
          setWorkflowDef(animatedDef);
        }}
      />

      {/* Canvas area — takes remaining height. Task #102: InterAgentFeed is mounted inside SwarmCanvas */}
      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <SwarmCanvas workflowDef={workflowDef} />
        </ReactFlowProvider>
      </div>

      {/* Task #100 — HITL inbox drawer (above BroadcastBar) */}
      {inboxOpen && (
        <div className="border-t border-gray-700 bg-gray-900 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <span className="text-xs font-semibold text-gray-300">HITL Approvals</span>
            <button onClick={() => setInboxOpen(false)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>
          <HitlInbox />
        </div>
      )}

      {/* Broadcast bar — only visible during active execution */}
      <BroadcastBar />

      {/* PTY Explosion overlay — full-screen terminal for direct agent interaction */}
      {ptyExplosionNodeId && (
        <PtyExplosion
          sessionId={ptyExplosionNodeId}
          onClose={() => setPtyExplosionNodeId(null)}
        />
      )}
    </div>
  );
}
