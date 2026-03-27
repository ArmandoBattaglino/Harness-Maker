// server/utils/ssrfGuard.js
// SEC-V3-03: SSRF prevention guard.
// Blocks server-initiated outbound requests to private/loopback IP ranges.
// Used by TriggerManager.js RSS polling before any outbound fetch.
// Returns false for any hostname that resolves to a private/loopback address.
// NOTE: This check operates on the hostname string only (no DNS lookup).
// It blocks private IP literals and "localhost".  It does NOT block
// hostnames that indirectly resolve to private IPs — that would require
// dns.lookup(), which is an async network operation we deliberately omit
// to keep this guard synchronous and safe for all call sites.

/**
 * Returns true if the URL string appears safe to request from the server.
 * Returns false for:
 *   - Unparseable URLs
 *   - Loopback: 127.x.x.x, ::1, localhost
 *   - Private IPv4 ranges: 10.x.x.x, 172.16.x-172.31.x, 192.168.x.x
 *   - Unspecified: 0.0.0.0
 *   - Link-local: 169.254.x.x
 *   - IPv4-mapped IPv6 of any blocked range
 *
 * @param {string} urlString
 * @returns {boolean}
 */
export function isSafeUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    // Unparseable URL — reject
    return false;
  }

  const hostname = parsed.hostname;

  // Reject empty hostname
  if (!hostname) return false;

  // Reject "localhost" and any case variant
  if (hostname.toLowerCase() === 'localhost') return false;

  // Strip IPv6 brackets if present: [::1] → ::1
  const host = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // --- IPv6 loopback ---
  if (host === '::1') return false;
  if (host.toLowerCase() === '::1') return false;

  // IPv4-mapped IPv6: ::ffff:x.x.x.x
  const ipv4MappedMatch = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) {
    return _isPublicIPv4(ipv4MappedMatch[1]);
  }

  // --- Pure IPv4 ---
  if (_isIPv4(host)) {
    return _isPublicIPv4(host);
  }

  // Non-IP hostname (domain name) — allow
  // We do not do DNS resolution here.  A later mitigation (allowlist) can
  // be added in TriggerManager.js if needed.
  return true;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the string looks like a bare IPv4 address (four octets).
 */
function _isIPv4(host) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Returns true if the IPv4 address is a public (routable) address.
 * Returns false for loopback, private, link-local, and unspecified ranges.
 *
 * Blocked ranges:
 *   0.0.0.0/8         — unspecified
 *   10.0.0.0/8        — private
 *   127.0.0.0/8       — loopback
 *   169.254.0.0/16    — link-local (APIPA)
 *   172.16.0.0/12     — private (172.16.x - 172.31.x)
 *   192.168.0.0/16    — private
 */
function _isPublicIPv4(ip) {
  const parts = ip.split('.').map(Number);

  // Validate all parts are valid octets
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false; // malformed — reject
  }

  const [a, b] = parts;

  if (a === 0)   return false; // 0.0.0.0/8 — unspecified
  if (a === 10)  return false; // 10.0.0.0/8 — private
  if (a === 127) return false; // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 — link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 — private
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 — private

  return true;
}
