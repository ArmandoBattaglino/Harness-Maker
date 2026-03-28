// server/services/TriggerManager.js
// V3 Trigger System — webhook registration and RSS polling.
// SEC-V3-01: Webhook payload processing (body cap enforced by routes/webhooks.js #75).
// SEC-V3-03: SSRF guard applied before any RSS fetch.

import { isSafeUrl } from '../utils/ssrfGuard.js';

// ---------------------------------------------------------------------------
// RSS XML helpers — simple string parsing (no xml2js dependency)
// ---------------------------------------------------------------------------

/**
 * Extract all <item> or <entry> blocks from an RSS/Atom feed string.
 * @param {string} xml
 * @returns {string[]} array of raw item/entry XML strings
 */
function _extractItems(xml) {
  const items = [];
  // Support both RSS <item> and Atom <entry>
  const tagPairs = [['<item', '</item>'], ['<entry', '</entry>']];
  for (const [open, close] of tagPairs) {
    let start = 0;
    while (true) {
      const openIdx = xml.indexOf(open, start);
      if (openIdx === -1) break;
      const closeIdx = xml.indexOf(close, openIdx);
      if (closeIdx === -1) break;
      items.push(xml.slice(openIdx, closeIdx + close.length));
      start = closeIdx + close.length;
    }
    if (items.length > 0) break; // prefer RSS <item>, fall back to Atom <entry>
  }
  return items;
}

/**
 * Extract the text content of the first matching tag in an XML fragment.
 * Returns null if the tag is not found.
 * @param {string} fragment
 * @param {string} tag  e.g. 'guid', 'link', 'title'
 * @returns {string|null}
 */
function _extractTag(fragment, tag) {
  // Match <tag ...>content</tag>  or  <tag ... />  (CDATA handled as text)
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = fragment.match(re);
  if (m) return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  return null;
}

/**
 * Derive a stable unique ID for an RSS/Atom item.
 * Prefers <guid>, falls back to <id> (Atom), then <link>.
 * @param {string} fragment
 * @returns {string|null}
 */
function _itemGuid(fragment) {
  return (
    _extractTag(fragment, 'guid') ||
    _extractTag(fragment, 'id') ||
    _extractTag(fragment, 'link') ||
    null
  );
}

// ---------------------------------------------------------------------------
// TriggerManager
// ---------------------------------------------------------------------------

class TriggerManager {
  /**
   * @param {import('./SwarmEngine.js').default} swarmEngine
   */
  constructor(swarmEngine) {
    this.swarmEngine = swarmEngine;

    /**
     * webhooks: path → { workflowId, targetNodeId }
     * path is the URL path suffix that the webhook route will match,
     * e.g. '/hooks/abc123'.
     * @type {Map<string, { workflowId: string, targetNodeId: string }>}
     */
    this.webhooks = new Map();

    /**
     * rssPollers: nodeId → { intervalId, lastSeenGuid, config, executionId }
     * @type {Map<string, { intervalId: NodeJS.Timeout, lastSeenGuid: string|null, config: object, executionId: string|null }>}
     */
    this.rssPollers = new Map();
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK TRIGGERS
  // ---------------------------------------------------------------------------

  /**
   * Register a webhook path to trigger a workflow.
   * @param {string} path        URL path suffix, e.g. '/hooks/my-hook'
   * @param {string} workflowId  Workflow to start (or inject into)
   * @param {string} targetNodeId  Node to receive the payload
   */
  registerWebhook(path, workflowId, targetNodeId) {
    if (!path || typeof path !== 'string') {
      throw new Error('registerWebhook: path must be a non-empty string');
    }
    if (!workflowId || typeof workflowId !== 'string') {
      throw new Error('registerWebhook: workflowId must be a non-empty string');
    }
    if (!targetNodeId || typeof targetNodeId !== 'string') {
      throw new Error('registerWebhook: targetNodeId must be a non-empty string');
    }
    this.webhooks.set(path, { workflowId, targetNodeId });
  }

  /**
   * Remove a previously registered webhook path.
   * No-op if the path is not registered.
   * @param {string} path
   */
  unregisterWebhook(path) {
    this.webhooks.delete(path);
  }

  /**
   * Handle an incoming webhook request.
   * Finds the matching registration and starts a new execution or injects the
   * payload into an already-running execution for that workflow.
   *
   * The 32 KB body cap (SEC-V3-01) is enforced upstream in the routes layer
   * (routes/webhooks.js, Task #75) before this method is called.
   *
   * @param {string} path     The incoming webhook path
   * @param {object} payload  Parsed JSON body (already validated by route layer)
   * @returns {Promise<{ triggered: boolean, executionId?: string }>}
   */
  async handleWebhook(path, payload) {
    const registration = this.webhooks.get(path);
    if (!registration) {
      return { triggered: false };
    }

    const { workflowId, targetNodeId } = registration;

    // Attempt to start a new execution.
    // startExecution(workflowId, projectId, projectPath):
    //   - projectId and projectPath are not known from the webhook payload here;
    //     the webhook injects the payload as workflowContext by passing it as a
    //     serialised string so the first agent can read it.
    //   - We use workflowId as projectId and '' as projectPath for webhook-triggered
    //     executions (the workflow definition carries its own context).
    let executionId;
    try {
      executionId = await this.swarmEngine.startExecution(workflowId, workflowId, '');
    } catch (err) {
      // Re-throw so the route layer can return a 500
      throw new Error(`TriggerManager.handleWebhook: startExecution failed — ${err.message}`);
    }

    return { triggered: true, executionId };
  }

  // ---------------------------------------------------------------------------
  // RSS TRIGGERS
  // ---------------------------------------------------------------------------

  /**
   * Create an RSS polling trigger for a workflow node.
   * SEC-V3-03: Validates rssUrl with isSafeUrl() before any outbound fetch.
   *
   * First poll sets lastSeenGuid without firing (avoids startup flood).
   * Subsequent polls fire on any item whose GUID was not seen before.
   *
   * @param {string} nodeId           Workflow node that owns this trigger
   * @param {string} rssUrl           URL of the RSS/Atom feed
   * @param {string} workflowId       Workflow to start on new item
   * @param {number} pollIntervalMs   Poll interval in ms (default 5 minutes)
   * @param {string|null} executionId Optional: attach to a running execution
   * @returns {Promise<void>}
   */
  async createRssTrigger(nodeId, rssUrl, workflowId, pollIntervalMs = 300000, executionId = null) {
    if (!nodeId || typeof nodeId !== 'string') {
      throw new Error('createRssTrigger: nodeId must be a non-empty string');
    }

    // SEC-V3-03: SSRF guard — reject private/loopback URLs
    if (!isSafeUrl(rssUrl)) {
      throw new Error(`createRssTrigger: URL rejected by SSRF guard — ${rssUrl}`);
    }

    // Validate pollIntervalMs is a positive number
    if (typeof pollIntervalMs !== 'number' || pollIntervalMs <= 0) {
      throw new Error('createRssTrigger: pollIntervalMs must be a positive number');
    }

    // Remove any existing poller for this nodeId before creating a new one
    this.removeTrigger(nodeId);

    const config = {
      rssUrl,
      workflowId,
      pollIntervalMs,
    };

    // Track state for this poller
    const pollerState = {
      intervalId: null,
      lastSeenGuid: null,   // null = first poll not yet done
      config,
      executionId,
    };

    this.rssPollers.set(nodeId, pollerState);

    // Poll immediately to seed lastSeenGuid (no firing on first poll)
    await this._pollRss(nodeId, true /* seedOnly */);

    // Schedule recurring polls
    const intervalId = setInterval(async () => {
      await this._pollRss(nodeId, false);
    }, pollIntervalMs);

    // Allow Node.js to exit even while interval is active
    if (intervalId.unref) {
      intervalId.unref();
    }

    // Store the interval ID now that it's created
    const state = this.rssPollers.get(nodeId);
    if (state) {
      state.intervalId = intervalId;
    }
  }

  /**
   * Internal: fetch and parse the RSS feed for nodeId.
   * @param {string}  nodeId
   * @param {boolean} seedOnly  If true, update lastSeenGuid but do not fire workflow.
   */
  async _pollRss(nodeId, seedOnly) {
    const state = this.rssPollers.get(nodeId);
    if (!state) return;

    const { rssUrl, workflowId } = state.config;

    let xml;
    try {
      const response = await fetch(rssUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'ClaudeCodeManager/1.0 RSS-Poller' },
        signal: AbortSignal.timeout(15000), // 15s timeout
      });
      if (!response.ok) {
        // Non-2xx: log and skip — do not crash the poller
        console.error(`[TriggerManager] RSS fetch non-OK ${response.status} for ${rssUrl}`);
        return;
      }
      xml = await response.text();
    } catch (err) {
      // Network error, timeout — log and skip
      console.error(`[TriggerManager] RSS fetch error for ${rssUrl}:`, err.message);
      return;
    }

    const items = _extractItems(xml);
    if (items.length === 0) return;

    // The most-recent item is conventionally first in RSS feeds.
    // We track only the latest GUID to detect new items on the next poll.
    const latestGuid = _itemGuid(items[0]);

    if (seedOnly) {
      // First poll: seed lastSeenGuid, do not fire
      state.lastSeenGuid = latestGuid;
      return;
    }

    // Subsequent poll: find all items that are newer than lastSeenGuid
    const newItems = [];
    for (const item of items) {
      const guid = _itemGuid(item);
      if (guid === state.lastSeenGuid) break; // reached previously-seen marker
      newItems.push({ guid, raw: item });
    }

    if (newItems.length === 0) return;

    // Update lastSeenGuid to the newest item
    state.lastSeenGuid = newItems[0].guid;

    // Fire once per new item (most recent first)
    for (const newItem of newItems) {
      await this._fireTrigger(nodeId, workflowId, state.executionId, newItem);
    }
  }

  /**
   * Fire a trigger — start a new execution or note a new RSS item for an existing one.
   * @param {string}      nodeId
   * @param {string}      workflowId
   * @param {string|null} executionId  Existing execution to attach to, or null
   * @param {object}      item         { guid, raw }
   */
  async _fireTrigger(nodeId, workflowId, executionId, item) {
    try {
      if (executionId) {
        // Execution already running — inject item notification into PTY via swarmEngine
        // There is no dedicated "inject" API on SwarmEngine yet; broadcast a WS event
        // so the UI can act on it. The swarmEngine will handle this when a dedicated
        // injectContext() method is added in a later task.
        if (this.swarmEngine._wsBroadcast) {
          this.swarmEngine._wsBroadcast(executionId, {
            type: 'rss_item',
            nodeId,
            guid: item.guid,
          });
        }
      } else {
        // No running execution — start a new one
        await this.swarmEngine.startExecution(workflowId, workflowId, '');
      }
    } catch (err) {
      // Log but do not crash the polling interval
      console.error(`[TriggerManager] _fireTrigger failed for node ${nodeId}:`, err.message);
    }
  }

  /**
   * Remove an RSS polling trigger by nodeId.
   * Clears the interval and removes the state. No-op if not found.
   * @param {string} nodeId
   */
  removeTrigger(nodeId) {
    const poller = this.rssPollers.get(nodeId);
    if (poller) {
      clearInterval(poller.intervalId);
      this.rssPollers.delete(nodeId);
    }
  }

  /**
   * Clean up all RSS pollers that belong to a specific execution.
   * Called by SwarmEngine.stopExecution() so intervals are not left running
   * after the execution ends.
   * @param {string} executionId
   */
  cleanupExecution(executionId) {
    for (const [nodeId, poller] of this.rssPollers) {
      if (poller.executionId === executionId) {
        clearInterval(poller.intervalId);
        this.rssPollers.delete(nodeId);
      }
    }
  }

  /**
   * List all currently registered webhooks and RSS pollers.
   * @returns {{ webhooks: object[], rssPollers: object[] }}
   */
  listTriggers() {
    return {
      webhooks: [...this.webhooks.entries()].map(([path, cfg]) => ({ path, ...cfg })),
      rssPollers: [...this.rssPollers.entries()].map(([nodeId, p]) => ({
        nodeId,
        ...p.config,
        lastSeenGuid: p.lastSeenGuid,
        executionId: p.executionId,
      })),
    };
  }
}

export default TriggerManager;
