// useWorkflow.js — CRUD hook for workflow definitions
// Talks to /api/v1/workflows REST API.

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from './useApi.js';

const API_BASE = '/api/v1/workflows';

// useWorkflow(id) — fetch, update, and remove a single workflow by ID.
export function useWorkflow(workflowId) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`${API_BASE}/${workflowId}`);
      setWorkflow(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (patch) => {
    if (!workflowId) return;
    const updated = await apiPut(`${API_BASE}/${workflowId}`, patch);
    setWorkflow(updated);
    return updated;
  }, [workflowId]);

  const remove = useCallback(async () => {
    if (!workflowId) return;
    await apiDelete(`${API_BASE}/${workflowId}`);
    setWorkflow(null);
  }, [workflowId]);

  return { workflow, loading, error, refresh, update, remove };
}

// useWorkflowList() — fetch all workflows and create new ones.
export function useWorkflowList() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(API_BASE);
      setWorkflows(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (workflowDef) => {
    const created = await apiPost(API_BASE, workflowDef);
    setWorkflows((prev) => [...prev, created]);
    return created;
  }, []);

  return { workflows, loading, error, refresh, create };
}
