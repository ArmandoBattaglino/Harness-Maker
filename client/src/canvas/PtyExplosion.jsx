// client/src/canvas/PtyExplosion.jsx
// Full-screen PTY terminal overlay for direct agent interaction.
// Falls back to a saved transcript view when the live session is already closed.
import { useEffect, useState } from 'react';
import Terminal from '../components/Terminal';
import { apiGet } from '../hooks/useApi.js';
import { stripAnsi } from '../utils/stripAnsi';

export default function PtyExplosion({ sessionId, executionId, nodeId, nodeLabel, onClose }) {
  const [archivedOutput, setArchivedOutput] = useState('');
  const [loadingArchivedOutput, setLoadingArchivedOutput] = useState(false);
  const [archivedOutputError, setArchivedOutputError] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (sessionId || !executionId || !nodeId) {
      setArchivedOutput('');
      setLoadingArchivedOutput(false);
      setArchivedOutputError('');
      return () => {};
    }

    setLoadingArchivedOutput(true);
    setArchivedOutputError('');

    apiGet(`/api/v1/swarm/${executionId}/agent/${nodeId}/output`)
      .then((res) => {
        if (cancelled) return;
        setArchivedOutput(stripAnsi(res?.output || ''));
      })
      .catch((err) => {
        if (cancelled) return;
        setArchivedOutputError(err.message || 'Could not load archived output.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingArchivedOutput(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [executionId, nodeId, sessionId]);

  if (!sessionId && !executionId) return null;

  return (
    <div
      className="pty-explosion-overlay"
      role="dialog"
      aria-label="PTY Explosion direct terminal access"
    >
      <div className="pty-explosion-header">
        <span className="pty-explosion-title terminal-text">
          {sessionId
            ? `PTY Explosion - ${nodeLabel || 'Agent'} - Session ${sessionId.slice(0, 8)}`
            : `PTY Explosion - ${nodeLabel || 'Agent'} - Saved Transcript`}
        </span>
        <button
          onClick={onClose}
          className="pty-explosion-close"
          aria-label="Close PTY Explosion (Escape)"
        >
          x (Esc)
        </button>
      </div>

      <div className="pty-explosion-body">
        {sessionId ? (
          <Terminal sessionId={sessionId} />
        ) : (
          <div className="h-full overflow-auto bg-[#0b1220] p-4 font-mono text-xs leading-6 text-slate-200">
            {loadingArchivedOutput && <div className="text-slate-400">Loading saved terminal output...</div>}
            {!loadingArchivedOutput && archivedOutputError && (
              <div className="text-red-300">{archivedOutputError}</div>
            )}
            {!loadingArchivedOutput && !archivedOutputError && (
              <pre className="whitespace-pre-wrap break-all">{archivedOutput || 'No saved terminal output for this agent.'}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
