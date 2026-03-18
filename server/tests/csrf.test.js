// tests/csrf.test.js
// Unit tests for the CSRF middleware (DEC-008)
// Tests that mutating methods require X-Requested-With: ClaudeCodeManager

import { describe, it, expect, vi } from 'vitest';
import { csrfMiddleware } from '../middleware/csrf.js';

// Build a minimal mock request / response / next for Express middleware testing
function makeReq(method, headers = {}) {
  return {
    method,
    headers,
  };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

describe('csrfMiddleware', () => {
  describe('safe methods — should always pass through', () => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    for (const method of safeMethods) {
      it(`should call next() for ${method} without the header`, () => {
        const req = makeReq(method, {});
        const res = makeRes();
        const next = vi.fn();
        csrfMiddleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res._status).toBeNull();
      });
    }
  });

  describe('mutating methods — should require the CSRF header', () => {
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    for (const method of mutatingMethods) {
      it(`should return 403 for ${method} with no CSRF header`, () => {
        const req = makeReq(method, {});
        const res = makeRes();
        const next = vi.fn();
        csrfMiddleware(req, res, next);
        expect(res._status).toBe(403);
        expect(next).not.toHaveBeenCalled();
      });

      it(`should return 403 for ${method} with wrong header value`, () => {
        const req = makeReq(method, { 'x-requested-with': 'XMLHttpRequest' });
        const res = makeRes();
        const next = vi.fn();
        csrfMiddleware(req, res, next);
        expect(res._status).toBe(403);
        expect(next).not.toHaveBeenCalled();
      });

      it(`should call next() for ${method} with correct CSRF header`, () => {
        const req = makeReq(method, { 'x-requested-with': 'ClaudeCodeManager' });
        const res = makeRes();
        const next = vi.fn();
        csrfMiddleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(res._status).toBeNull();
      });
    }
  });

  describe('error cases', () => {
    it('should return 403 when header value is empty string', () => {
      const req = makeReq('POST', { 'x-requested-with': '' });
      const res = makeRes();
      const next = vi.fn();
      csrfMiddleware(req, res, next);
      expect(res._status).toBe(403);
    });

    it('should return 403 when header value is case-variant (ClaudeCodemanager)', () => {
      // Spec says exact match "ClaudeCodeManager" — case matters
      const req = makeReq('POST', { 'x-requested-with': 'ClaudeCodemanager' });
      const res = makeRes();
      const next = vi.fn();
      csrfMiddleware(req, res, next);
      expect(res._status).toBe(403);
    });

    it('should exempt WebSocket upgrade requests', () => {
      const req = makeReq('GET', {
        upgrade: 'websocket',
        'x-requested-with': undefined,
      });
      const res = makeRes();
      const next = vi.fn();
      csrfMiddleware(req, res, next);
      // GET is already safe-method exempt, but explicit upgrade check should also pass
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('response body', () => {
    it('should return { error: "CSRF validation failed" } on rejection', () => {
      const req = makeReq('POST', {});
      const res = makeRes();
      const next = vi.fn();
      csrfMiddleware(req, res, next);
      expect(res._body).toEqual({ error: 'CSRF validation failed' });
    });
  });
});
