// useInbox.js — HITL inbox polling and approval/rejection hook.
import { useCallback, useEffect } from 'react';
import { useSwarmStore } from '../store/SwarmContext';

/**
 * Normalize inbox item shape to consistent structure.
 * Ensures items from REST and WS endpoints have the same shape: { id, type, agentId, status, payload }
 *
 * @param {Object} item - Raw item from API or WS
 * @returns {Object} Normalized item
 */
function normalizeInboxItem(item) {
  return {
    id: item?.id || '',
    type: item?.type || 'hitl',
    agentId: item?.agentId || item?.agent_id || '',
    status: item?.status || 'pending',
    payload: item?.payload || item?.resume_text || item?.resumeText || '',
  };
}

/**
 * Hook for managing HITL inbox items.
 * - Loads inbox items on mount and periodically polls when WS is disconnected
 * - Provides approve/reject actions
 * - Filters inbox to show only pending items
 * - Normalizes item shapes from REST and WS sources
 *
 * @param {string} executionId - The active execution ID
 * @returns {{ inboxItems, approve, reject }}
 */
export function useInbox(executionId) {
  // Filter by pending status and normalize item shapes
  const inboxItems = useSwarmStore((s) =>
    (s.inboxItems || [])
      .map(normalizeInboxItem)
      .filter((i) => i.status === 'pending')
  );
  const wsConnected = useSwarmStore((s) => s.wsConnected);
  const resolveInboxItem = useSwarmStore((s) => s.resolveInboxItem);

  // Load inbox items from server
  const loadInbox = useCallback(async () => {
    if (!executionId) return;

    try {
      const res = await fetch(`/api/v1/swarm/${executionId}/inbox`);
      if (res.ok) {
        const data = await res.json();
        // Normalize items and update store via Zustand action (not direct mutation)
        const items = (data.items ?? []).map(normalizeInboxItem);
        useSwarmStore.setState({ inboxItems: items });
      }
    } catch (err) {
      console.error('[useInbox] loadInbox error:', err);
    }
  }, [executionId]);

  // Initial load on mount and polling when WS disconnected
  useEffect(() => {
    loadInbox();

    if (!wsConnected) {
      const interval = setInterval(loadInbox, 10000);
      return () => clearInterval(interval);
    }
  }, [executionId, wsConnected, loadInbox]);

  // Approve an inbox item
  const approve = useCallback(
    async (itemId, resumeText = '') => {
      if (!executionId) return;

      try {
        const res = await fetch(`/api/v1/swarm/${executionId}/inbox/${itemId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'ClaudeCodeManager',
          },
          body: JSON.stringify({ resumeText }),
        });

        if (res.ok) {
          resolveInboxItem(itemId);
        } else {
          console.error('[useInbox] approve failed:', res.status, res.statusText);
        }
      } catch (err) {
        console.error('[useInbox] approve error:', err);
      }
    },
    [executionId, resolveInboxItem]
  );

  // Reject an inbox item
  const reject = useCallback(
    async (itemId) => {
      if (!executionId) return;

      try {
        const res = await fetch(`/api/v1/swarm/${executionId}/inbox/${itemId}/reject`, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'ClaudeCodeManager',
          },
        });

        if (res.ok) {
          resolveInboxItem(itemId);
        } else {
          console.error('[useInbox] reject failed:', res.status, res.statusText);
        }
      } catch (err) {
        console.error('[useInbox] reject error:', err);
      }
    },
    [executionId, resolveInboxItem]
  );

  return { inboxItems, approve, reject };
}

export default useInbox;
