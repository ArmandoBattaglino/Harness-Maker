// useJob.js — manages the full lifecycle of a single job run
// Handles: POST /api/v1/jobs → SSE stream → result → cancel

import { useState, useRef, useCallback } from 'react';
import { apiPost, apiDelete } from './useApi.js';

// Status values: 'idle' | 'running' | 'done' | 'cancelled' | 'error'

export default function useJob(projectId) {
  const [status, setStatus] = useState('idle');
  const [streamEvents, setStreamEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);

  const esRef = useRef(null);
  const jobIdRef = useRef(null);

  const closeEventSource = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const startJob = useCallback(
    async ({ prompt, allowedTools, maxTurns }) => {
      if (!projectId) return;
      if (status === 'running') return;

      // Reset state for a fresh run
      setStatus('running');
      setStreamEvents([]);
      setResult(null);
      setError(null);
      setJobId(null);
      closeEventSource();

      let createdJobId;
      try {
        const data = await apiPost('/api/v1/jobs', {
          projectId,
          prompt,
          allowedTools: allowedTools || 'all',
          maxTurns: maxTurns ? Number(maxTurns) : 10,
        });
        createdJobId = data.jobId;
      } catch (err) {
        setStatus('error');
        setError(err.message || 'Failed to start job');
        return;
      }

      setJobId(createdJobId);
      jobIdRef.current = createdJobId;

      // Open SSE connection
      const es = new EventSource(`/api/v1/jobs/${createdJobId}/stream`);
      esRef.current = es;

      es.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          data = { type: 'raw', data: event.data };
        }

        if (data.type === 'done') {
          setResult(data.result ?? null);
          setStatus('done');
          closeEventSource();
        } else if (data.type === 'cancelled') {
          setStatus('cancelled');
          closeEventSource();
        } else {
          setStreamEvents((prev) => [...prev, data]);
        }
      };

      es.onerror = () => {
        setStatus('error');
        setError('SSE stream error — connection lost');
        closeEventSource();
      };
    },
    [projectId, status, closeEventSource]
  );

  const cancelJob = useCallback(async () => {
    const id = jobIdRef.current;
    if (!id) return;
    closeEventSource();
    try {
      await apiDelete(`/api/v1/jobs/${id}`);
    } catch {
      // Best-effort cancellation — the SSE stream will signal cancelled
    }
    setStatus('cancelled');
  }, [closeEventSource]);

  const reset = useCallback(() => {
    closeEventSource();
    setStatus('idle');
    setStreamEvents([]);
    setResult(null);
    setError(null);
    setJobId(null);
    jobIdRef.current = null;
  }, [closeEventSource]);

  return { startJob, cancelJob, reset, status, streamEvents, result, error, jobId };
}
