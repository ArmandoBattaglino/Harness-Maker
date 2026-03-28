// useInbox.js — HITL inbox polling and approval/rejection hook.
import { useCallback, useEffect } from 'react';
import { useSwarmStore } from '../store/SwarmContext';

/**
 * Hook for managing HITL inbox items.
 * - Loads inbox items on mount and periodically polls when WS is disconnected
 * - Provides approve/reject actions
 * - Filters inbox to show only pending items
 *
 * @param {string} executionId - The active execution ID
 * @returns {{ inboxItems, approve, reject }}
 */
export function useInbox(executionId) {
  const inboxItems = useSwarmStore((s) => s.inboxItems?.filter((i) => i.status === 'pending') ?? []);
  const wsConnected = useSwarmStore((s) => s.wsConnected);
  const resolveInboxItem = useSwarmStore((s) => s.resolveInboxItem);

  // Load inbox items from server
  const loadInbox = useCallback(async () => {
    if (!executionId) return;

    try {
      const res = await fetch(`/api/v1/swarm/${executionId}/inbox`);
      if (res.ok) {
        const data = await res.json();
        // Update store with fetched items (assume they come as pending by default from server)
        const items = data.items ?? [];
        // Re-synchronize inboxItems in store with server state
        useSwarmStore.getState().inboxItems = items;
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
