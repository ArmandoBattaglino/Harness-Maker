import { useEffect, useRef, useCallback } from 'react';

const WS_BASE = `ws://127.0.0.1:${window.location.port || 3000}`;

export function useSession(sessionId, onData) {
  const wsRef = useRef(null);
  const connectedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const unmountedRef = useRef(false);
  // Track whether this is a retry (reconnect once on unexpected close)
  const isRetryRef = useRef(false);

  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }));
    }
  }, []);

  const resize = useCallback((cols, rows) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    if (!sessionId) {
      // Close any existing connection when sessionId cleared
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
        connectedRef.current = false;
      }
      return;
    }

    function connect(isRetry) {
      if (unmountedRef.current) return;

      // Close existing socket before opening a new one
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect loop
        wsRef.current.close(1000);
        wsRef.current = null;
      }

      const url = `${WS_BASE}/ws?sessionId=${encodeURIComponent(sessionId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      isRetryRef.current = isRetry;

      ws.onopen = () => {
        if (unmountedRef.current) {
          ws.close(1000);
          return;
        }
        connectedRef.current = true;
        isRetryRef.current = false;
      };

      ws.onmessage = (event) => {
        if (unmountedRef.current) return;
        // Server sends raw PTY bytes — pass directly to xterm
        if (typeof event.data === 'string') {
          onDataRef.current(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then((text) => {
            if (!unmountedRef.current) onDataRef.current(text);
          });
        } else if (event.data instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(event.data);
          onDataRef.current(text);
        }
      };

      ws.onclose = (event) => {
        connectedRef.current = false;
        wsRef.current = null;

        // Reconnect once on unexpected close (not a deliberate 1000 or 1001)
        if (
          !unmountedRef.current &&
          !isRetryRef.current &&
          event.code !== 1000 &&
          event.code !== 1001
        ) {
          isRetryRef.current = true;
          reconnectTimerRef.current = setTimeout(() => {
            if (!unmountedRef.current) connect(true);
          }, 1000);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror — let it handle retry
      };
    }

    isRetryRef.current = false;
    connect(false);

    return () => {
      unmountedRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      connectedRef.current = false;
    };
  }, [sessionId]);

  return { send, resize };
}
