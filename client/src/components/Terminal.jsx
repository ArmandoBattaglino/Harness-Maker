import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useSession } from '../hooks/useSession.js';
import 'xterm/css/xterm.css';

const TERM_OPTIONS = {
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  theme: { background: '#1a1a1a' },
};

// Debounce helper — returns a function that delays invoking fn by wait ms
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export default function Terminal({ sessionId, projectPath }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const prevSessionIdRef = useRef(null);

  // Handle incoming PTY data — write to xterm
  function handleData(data) {
    if (termRef.current) {
      termRef.current.write(data);
    }
  }

  const { send, resize } = useSession(sessionId, handleData);

  // Mount: create one Terminal instance for the lifetime of this component
  useEffect(() => {
    const term = new XTerm(TERM_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      term.open(containerRef.current);
      // Initial fit after DOM paint
      requestAnimationFrame(() => {
        fitAddon.fit();
      });
    }

    return () => {
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // intentionally empty — one instance per mount

  // Session change: reset terminal when sessionId changes
  useEffect(() => {
    if (!termRef.current) return;
    if (prevSessionIdRef.current !== null && prevSessionIdRef.current !== sessionId) {
      termRef.current.reset();
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  // ResizeObserver: fit terminal to container and notify PTY
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const debouncedFit = debounce(() => {
      if (!fitAddonRef.current || !termRef.current) return;
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = termRef.current;
        resize(cols, rows);
      } catch (_) {
        // fitAddon can throw if terminal not yet rendered
      }
    }, 100);

    const observer = new ResizeObserver(debouncedFit);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [resize]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ overflow: 'hidden', backgroundColor: '#1a1a1a' }}
    />
  );
}
