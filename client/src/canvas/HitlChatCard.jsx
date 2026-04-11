// client/src/canvas/HitlChatCard.jsx
// Inline HITL approval card rendered inside the ChatPanel.
// Supports plain approve/reject and multiple-choice options (V13.1).
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
  const { nodeId, text, timestamp, hitlItemId, hitlType, hitlOptions } = message;
  const resolveInboxItem = useSwarmStore((s) => s.resolveInboxItem);
  const inboxItems = useSwarmStore((s) => s.inboxItems);
  const resolvedHitlIds = useSwarmStore((s) => s.resolvedHitlIds || []);

  const hasOptions = Array.isArray(hitlOptions) && hitlOptions.length > 0;

  const [showTextarea, setShowTextarea] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [selectedOptions, setSelectedOptions] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [resolvedAction, setResolvedAction] = useState(null);
  const [error, setError] = useState(null);
  const sendingRef = useRef(false);

  const stillPending = inboxItems.some((entry) => {
    const item = entry.item ?? entry;
    return item.id === hitlItemId;
  });

  const wasResolved = resolvedHitlIds.includes(hitlItemId);
  const isActionable = stillPending && !wasResolved;
  const badgeClass = TYPE_BADGE[hitlType] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';

  const toggleOption = (opt) => {
    setSelectedOptions((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  const canApprove = hasOptions
    ? selectedOptions.size > 0 || resumeText.trim().length > 0
    : true;

  const handleApproveClick = () => {
    if (hasOptions) {
      handleSend();
    } else {
      setError(null);
      setShowTextarea(true);
    }
  };

  const handleSend = async () => {
    if (!executionId || !hitlItemId || sendingRef.current) return;
    sendingRef.current = true;
    setApproving(true);
    setError(null);
    try {
      const body = {};
      if (resumeText.trim()) body.resumeText = resumeText.trim();
      if (selectedOptions.size > 0) body.selectedOptions = [...selectedOptions];
      await apiPost(`/api/v1/swarm/${executionId}/inbox/${hitlItemId}/approve`, body);
      resolveInboxItem(hitlItemId);
      setResolvedAction('approved');
    } catch (e) {
      setError(e.message);
      setApproving(false);
      sendingRef.current = false;
    }
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
      sendingRef.current = false;
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
      sendingRef.current = false;
    }
  };

  return (
    <div className="px-2 py-1">
      <div className="rounded-lg border-2 border-orange-500/60 bg-orange-950/30 px-3 py-2 overflow-hidden min-w-0">
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
            {/* Multiple-choice options */}
            {hasOptions && (
              <div className="flex flex-col gap-1.5 mb-2">
                {hitlOptions.map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border cursor-pointer
                      transition-colors select-none
                      ${selectedOptions.has(opt)
                        ? 'bg-orange-500/20 border-orange-500/60 text-orange-100'
                        : 'bg-gray-800/60 border-gray-600 text-gray-300 hover:border-gray-500'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptions.has(opt)}
                      onChange={() => toggleOption(opt)}
                      className="accent-orange-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="break-words">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Textarea: always visible when options present, toggled otherwise */}
            {(hasOptions || showTextarea) && (
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder={hasOptions ? 'Additional notes (optional)...' : 'Optional instructions for the agent...'}
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
              {hasOptions ? (
                <>
                  <button
                    onClick={handleSend}
                    disabled={approving || !canApprove}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded
                               bg-green-700 hover:bg-green-600 text-white transition-colors
                               disabled:opacity-40 shrink-0"
                  >
                    {approving ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={rejecting || approving}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded
                               bg-red-700 hover:bg-red-600 text-white transition-colors
                               disabled:opacity-40 shrink-0"
                  >
                    {rejecting ? '...' : 'Reject'}
                  </button>
                </>
              ) : !showTextarea ? (
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
