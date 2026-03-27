// server/services/BudgetTracker.js
// Soft budget tracker for swarm executions.
// Does NOT stop execution — emits advisory signal only (FR-V3-18).

class BudgetTracker {
  constructor() {
    this._sessionChars = new Map();   // sessionId -> total char count
    this._executionSessions = new Map(); // executionId -> Set<sessionId>
  }

  /**
   * Rough token estimate: 1 token ≈ 4 chars.
   */
  estimate(charCount) {
    return Math.ceil(charCount / 4);
  }

  /**
   * Track output chunk for a session.
   */
  track(sessionId, outputChunk) {
    const current = this._sessionChars.get(sessionId) || 0;
    this._sessionChars.set(sessionId, current + outputChunk.length);
  }

  /**
   * Register a session under an execution (for getTotal).
   */
  registerSession(executionId, sessionId) {
    if (!this._executionSessions.has(executionId)) {
      this._executionSessions.set(executionId, new Set());
    }
    this._executionSessions.get(executionId).add(sessionId);
  }

  /**
   * Get total estimated tokens for all sessions in an execution.
   */
  getTotal(executionId) {
    const sessions = this._executionSessions.get(executionId) || new Set();
    let total = 0;
    for (const sid of sessions) {
      total += this._sessionChars.get(sid) || 0;
    }
    return this.estimate(total);
  }

  /**
   * Check if budget has been exceeded.
   * @returns {{ exceeded: boolean, estimatedUsed: number }}
   */
  checkBudget(executionId, limitTokens) {
    const estimatedUsed = this.getTotal(executionId);
    return { exceeded: estimatedUsed >= limitTokens, estimatedUsed };
  }

  /**
   * Clear tracking data for an execution (called on stopExecution).
   */
  clearExecution(executionId) {
    const sessions = this._executionSessions.get(executionId) || new Set();
    for (const sid of sessions) {
      this._sessionChars.delete(sid);
    }
    this._executionSessions.delete(executionId);
  }
}

export default BudgetTracker;
