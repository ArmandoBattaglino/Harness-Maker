// client/src/canvas/HitlChatCard.jsx
// Inline HITL approval card rendered inside the ChatPanel.
// Shows agent request, approve/reject actions, and optional resume text.
import { useState, useRef } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiPost } from '../hooks/useApi.js';

const TYPE_BADGE = {
  circuit_breaker: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  user_requested: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
};

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HitlChatCard({ message, agentLabel, executionId }) {
  const { nodeId, text, timestamp, hitlItemId, hitlType } = message;
  const resolveInboxItem = useSwarmStore((s) => s.resolveInboxItem);
  const inboxItems = useSwarmStore((s) => s.inboxItems);
  const resolvedHitlIds = useSwarmStore((s) => s.resolvedHitlIds || []);

  const [showTextarea, setShowTextarea] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [resolvedAction, setResolvedAction] = useState(null);
  const [error, setError] = useState(null);
  const sendingRef = useRef(false); // sync guard against rapid double-clicks

  // Check if item is still pending in the inbox
  const stillPending = inboxItems.some((entry) => {
    const item = entry.item ?? entry;
    return item.id === hitlItemId;
  });

  // Derive resolved state from store (survives remount) OR local action
  const wasResolved = resolvedHitlIds.includes(hitlItemId);
  const isActionable = stillPending && !wasResolved;
  const badgeClass = TYPE_BADGE[hitlType] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';

  const handleApproveClick = () => {
    setError(null);
    setShowTextarea(true);
  };

  const handleApproveConfirm = async () => {
    if (!executionId || !hitlItemId || sendingRef.current) return;
    sendingRef.current = true;
    setApproving(true);
    setError(null);
    try {
      await apiPost(`/api/v1/swarm/${executionId}/inbox/${hitlItemId}/approve`, {
        resumeText: resumeText.trim() || undefined,
      });
      resolveInboxItem(hitlItemId);
      setResolvedAction('approved');
    } catch (e) {
      setError(e.message);
      setApproving(false);
    }
  };

  const handleApproveCancel = () => {
    setShowTextarea(false);
    setResumeText('');
    setError(null);
  };

  const handleReject = async () => {
    if (!executionId || !hitlItemId || sendingRef.current) return;
    sendingRef.current = true;
    setRejecting(true);
    setError(null);
    try {
      await apiPost(`/api/v1/swarm/${executionId}/inbox/${hitlItemId}/reject`, {});
      resolveInboxItem(hitlItemId);
      setResolvedAction('rejected');
    } catch (e) {
      setError(e.message);
      setRejecting(false);
    }
  };

  return (
    <div className="px-2 py-1">
      <div className="rounded-lg border-2 border-orange-500/60 bg-orange-950/30 px-3 py-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold text-orange-400">
            {agentLabel || nodeId?.slice(0, 12) || 'Agent'}
          </span>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${badgeClass}`}>
            {(hitlType || 'approval').replace('_', ' ')}
          </span>
          <span className="text-[10px] text-gray-600">{formatTime(timestamp)}</span>
          {wasResolved && (
            <span className={`text-[9px] ml-auto px-1.5 py-0.5 rounded font-medium ${
              resolvedAction === 'approved'
                ? 'bg-green-500/20 text-green-300'
                : resolvedAction === 'rejected'
                ? 'bg-red-500/20 text-red-300'
                : 'bg-gray-500/20 text-gray-300'
            }`}>
              {resolvedAction || 'resolved'}
            </span>
          )}
          {!isActionable && !wasResolved && (
            <span className="text-[9px] ml-auto text-gray-500 italic">resolved</span>
          )}
        </div>

        {/* Message */}
        <div className="text-[12px] whitespace-pre-wrap break-words leading-5 text-orange-100 mb-2">
          {text || 'Approval required'}
        </div>

        {/* Actions — only if still actionable */}
        {isActionable && (
          <>
            {showTextarea && (
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Optional instructions for the agent..."
                rows={2}
                maxLength={8192}
                className="w-full text-xs bg-gray-800 text-white rounded px-2 py-1.5
                           border border-gray-600 focus:border-orange-500 focus:outline-none
                           placeholder-gray-500 resize-none mb-2"
              />
            )}

            {error && (
              <div className="text-[10px] text-red-400 mb-1">{error}</div>
            )}

            <div className="flex items-center gap-2">
              {!showTextarea ? (
                <>
                  <button
                    onClick={handleApproveClick}
                    disabled={rejecting}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded
                               bg-green-700 hover:bg-green-600 text-white transition-colors
                               disabled:opacity-40 shrink-0"
                  >
                    Approve
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={rejecting}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded
                               bg-red-700 hover:bg-red-600 text-white transition-colors
                               disabled:opacity-40 shrink-0"
                  >
                    {rejecting ? '...' : 'Reject'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleApproveConfirm}
                    disabled={approving}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded
                               bg-green-700 hover:bg-green-600 text-white transition-colors
                               disabled:opacity-40 shrink-0"
                  >
                    {approving ? '...' : 'Confirm'}
                  </button>
                  <button
                    onClick={handleApproveCancel}
                    disabled={approving}
                    className="text-xs px-2.5 py-1 rounded bg-gray-600 hover:bg-gray-500
                               text-gray-200 transition-colors disabled:opacity-40 shrink-0"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
