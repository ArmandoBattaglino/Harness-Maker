import { useCallback, useEffect, useState } from 'react';

import { apiDelete, apiGet, apiPost, apiPut } from './useApi.js';

const API_BASE = '/api/v1/packs';

function unwrapPack(payload) {
  return payload?.pack ?? payload ?? null;
}

export function usePack(packId) {
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!packId) return null;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`${API_BASE}/${packId}`);
      const nextPack = unwrapPack(data);
      setPack(nextPack);
      return nextPack;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(async (patch) => {
    const data = await apiPut(`${API_BASE}/${packId}`, patch);
    const nextPack = unwrapPack(data);
    setPack(nextPack);
    return nextPack;
  }, [packId]);

  const remove = useCallback(async () => {
    await apiDelete(`${API_BASE}/${packId}`);
    setPack(null);
  }, [packId]);

  const publish = useCallback(async () => {
    const data = await apiPost(`${API_BASE}/${packId}/publish`, {});
    const nextPack = unwrapPack(data);
    setPack(nextPack);
    return nextPack;
  }, [packId]);

  const dryRun = useCallback(async (input) => (
    apiPost(`${API_BASE}/${packId}/dry-run`, { input })
  ), [packId]);

  const start = useCallback(async ({ projectId, projectPath, input, runtimeProvider, runtimeModels }) => (
    apiPost(`${API_BASE}/${packId}/start`, { projectId, projectPath, input, runtimeProvider, runtimeModels })
  ), [packId]);

  return { pack, loading, error, refresh, update, remove, publish, dryRun, start };
}

export function usePackList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(API_BASE);
      const nextPacks = Array.isArray(data) ? data : (data?.packs ?? []);
      setPacks(nextPacks);
      return nextPacks;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async (payload) => {
    const data = await apiPost(API_BASE, payload);
    const pack = unwrapPack(data);
    setPacks((current) => [pack, ...current]);
    return pack;
  }, []);

  const importBundle = useCallback(async (bundle) => {
    const data = await apiPost(`${API_BASE}/import`, { bundle });
    const pack = unwrapPack(data);
    setPacks((current) => [pack, ...current]);
    return data;
  }, []);

  return { packs, loading, error, refresh, create, importBundle };
}
