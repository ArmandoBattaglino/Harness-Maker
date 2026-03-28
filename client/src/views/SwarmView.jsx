// client/src/views/SwarmView.jsx
// Layout shell for the Swarm Orchestrator — toolbar + canvas.
import { useState, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import SwarmCanvas from '../canvas/SwarmCanvas';
import PromptToFlowBar from '../canvas/PromptToFlowBar';
import BroadcastBar from '../canvas/BroadcastBar';
import PtyExplosion from '../canvas/PtyExplosion';
import { useSwarmStore } from '../store/SwarmContext';

// Status indicator color map
const statusColors = {
  idle: 'text-gray-400',
  running: 'text-blue-400 animate-pulse',
  stopped: 'text-red-400',
};

export default function SwarmView() {
  const executionStatus = useSwarmStore((s) => s.executionStatus);
  const reset = useSwarmStore((s) => s.reset);
  const ptyExplosionNodeId = useSwarmStore((s) => s.ptyExplosionNodeId);
  const setPtyExplosionNodeId = useSwarmStore((s) => s.setPtyExplosionNodeId);
  const [workflowDef, setWorkflowDef] = useState(null);

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

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="text-sm font-semibold text-white">Swarm Orchestrator</span>

        {/* Spacer */}
        <div className="flex-1" />

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

      {/* Prompt-to-Flow bar */}
      <PromptToFlowBar
        onWorkflowGenerated={(workflowId, animatedDef) => {
          setWorkflowDef(animatedDef);
        }}
      />

      {/* Canvas area — takes remaining height */}
      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <SwarmCanvas workflowDef={workflowDef} />
        </ReactFlowProvider>
      </div>

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
