// client/src/canvas/PtyExplosion.jsx
// Full-screen PTY terminal overlay for direct agent interaction.
// Uses Terminal.jsx UNCHANGED — never creates a new xterm instance (DEC-009).
// Task #71.2 adds the Escape key handler.
import Terminal from '../components/Terminal';

export default function PtyExplosion({ sessionId, onClose }) {
  if (!sessionId) return null;

  return (
    <div
      className="pty-explosion-overlay"
      role="dialog"
      aria-label="PTY Explosion — direct terminal access"
    >
      {/* Header */}
      <div className="pty-explosion-header">
        <span className="pty-explosion-title terminal-text">
          PTY Explosion — Session {sessionId.slice(0, 8)}
        </span>
        <button
          onClick={onClose}
          className="pty-explosion-close"
          aria-label="Close PTY Explosion (Escape)"
        >
          x (Esc)
        </button>
      </div>

      {/* Terminal — reuses existing Terminal.jsx instance unchanged */}
      <div className="pty-explosion-body">
        <Terminal sessionId={sessionId} />
      </div>
    </div>
  );
}
