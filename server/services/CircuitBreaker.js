// server/services/CircuitBreaker.js
// Advisory circuit breaker for swarm handoff loops.
// Does NOT stop execution — emits advisory signal only (FR-V3-17).

class CircuitBreaker {
  /**
   * Check if the handoff counter for an edge has exceeded the threshold.
   * @param {string} edgeId - edge identifier
   * @param {number} counter - current handoff count for this edge
   * @param {number} threshold - max allowed handoffs (default 10)
   * @returns {boolean} true if threshold exceeded (advisory only — caller emits WS event)
   */
  check(edgeId, counter, threshold = 10) {
    return counter >= threshold;
  }
}

export default CircuitBreaker;
