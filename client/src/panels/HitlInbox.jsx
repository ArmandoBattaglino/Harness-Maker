// client/src/panels/HitlInbox.jsx
// HITL (Human-in-the-Loop) approval panel — bottom drawer in SwarmView.
// Shows pending approval requests with Approve/Reject actions.
import { useState } from 'react';
import { useSwarmStore } from '../store/SwarmContext';
import { apiPost } from '../hooks/useApi.js';

// Badge styling per approval type
const TYPE_BADGE = {
  circuit_breaker: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  user_requested:  'bg-blue-500/20 text-blue-300 border-blue-500/40',
};

function typeBadgeClass(type) {
  return TYPE_BADGE[type] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// InboxItem — a single pending approval card
// ---------------------------------------------------------------------------
function InboxItem({ inboxEntry, executionId, onResolved }) {
  // Each entry in the store is the full WS message: { type, nodeId, item: {...} }
  const item = inboxEntry.item ?? inboxEntry;

  const [approving, setApproving] = useState(false);
  const [showTextarea, setShowTextarea] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState(null);

  const itemId = item.id;
  const agentName = item.agentName || inboxEntry.nodeId || item.nodeId || 'Unknown Agent';
  const itemType = item.type || 'user_requested';
  const message = item.message || 'Approval required';
  const timestamp = item.timestamp;

  const handleApproveClick = () => {
    setError(null);
    setShowTextarea(true);
  };

  const handleApproveConfirm = async () => {
    if (!executionId || !itemId) {
      setError('No active execution — cannot approve/reject.');
      return;
    }
    setApproving(true);
    setError(null);
    try {
      await apiPost(`/api/v1/swarm/${executionId}/inbox/${itemId}/approve`, {
        resumeText: resumeText.trim() || undefined,
      });
      onResolved(inboxEntry);
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
    if (!executionId || !itemId) {
      setError('No active execution — cannot approve/reject.');
      return;
    }
    setRejecting(true);
    setError(null);
    try {
      await apiPost(`/api/v1/swarm/${executionId}/inbox/${itemId}/reject`, {});
      onResolved(inboxEntry);
    } catch (e) {
      setError(e.message);
      setRejecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 bg-gray-800 rounded-lg p-3 border border-gray-700">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white truncate max-w-[140px]">
          {agentName}
        </span>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeBadgeClass(itemType)}`}
        >
          {itemType.replace('_', ' ')}
        </span>
        {timestamp && (
          <span className="text-[10px] text-gray-500 ml-auto shrink-0">
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>

      {/* Message */}
      <p className="text-xs text-gray-300 leading-relaxed">{message}</p>

      {/* Inline textarea for resume text (shown after Approve click) */}
      {showTextarea && (
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Optional resume instructions for the agent..."
          rows={3}
          maxLength={8192}
          className="w-full text-xs bg-gray-700 text-white rounded px-2 py-1.5
                     border border-gray-600 focus:border-green-500 focus:outline-none
                     placeholder-gray-500 resize-none"
        />
      )}

      {/* Error */}
      {error && (
        <span className="text-[10px] text-red-400">{error}</span>
      )}

      {/* Action buttons */}
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
              ✓ Approve
            </button>
            <button
              onClick={handleReject}
              disabled={rejecting}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded
                         bg-red-700 hover:bg-red-600 text-white transition-colors
                         disabled:opacity-40 shrink-0"
            >
              {rejecting ? '...' : '✗ Reject'}
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
              {approving ? '...' : '✓ Confirm'}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// getPendingCount — exported helper for tab badge
// ---------------------------------------------------------------------------
export function getPendingCount(inboxItems) {
  if (!Array.isArray(inboxItems)) return 0;
  return inboxItems.filter((entry) => {
    const item = entry.item ?? entry;
    return !item.status || item.status === 'pending';
  }).length;
}

// ---------------------------------------------------------------------------
// HitlInbox — main export
// ---------------------------------------------------------------------------
export default function HitlInbox() {
  const inboxItems = useSwarmStore((s) => s.inboxItems);
  const resolveInboxItem = useSwarmStore((s) => s.resolveInboxItem);
  const activeExecutionId = useSwarmStore((s) => s.activeExecutionId);

  // Filter to pending items only
  const pendingItems = inboxItems.filter((entry) => {
    const item = entry.item ?? entry;
    return !item.status || item.status === 'pending';
  });

  const handleResolved = (entry) => {
    const item = entry.item ?? entry;
    resolveInboxItem(item.id);
  };

  // Empty state
  if (pendingItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-500">
        <span className="text-2xl">✓</span>
        <span className="text-sm">No pending approvals</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {pendingItems.map((entry) => {
        const item = entry.item ?? entry;
        const key = item.id || `${entry.nodeId}-${item.timestamp || Math.random()}`;
        return (
          <InboxItem
            key={key}
            inboxEntry={entry}
            executionId={activeExecutionId}
            onResolved={handleResolved}
          />
        );
      })}
    </div>
  );
}
