import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePack, usePackList } from './usePack.js';

function UsePackHarness({ packId = 'pack-1', onUpdate }) {
  const api = usePack(packId);

  useEffect(() => {
    onUpdate(api);
  }, [api, onUpdate]);

  return null;
}

function UsePackListHarness({ onUpdate }) {
  const api = usePackList();

  useEffect(() => {
    onUpdate(api);
  }, [api, onUpdate]);

  return null;
}

describe('usePack hooks', () => {
  let fetchMock;
  let packApi;
  let listApi;

  beforeEach(() => {
    packApi = null;
    listApi = null;
    fetchMock = vi.fn((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/packs/pack-1' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pack: { id: 'pack-1', name: 'Marketing Harness', workflowId: 'wf-1' } }),
        });
      }
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ packs: [{ id: 'pack-1', name: 'Marketing Harness' }] }),
        });
      }
      if (url === '/api/v1/packs/pack-1/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ executionId: 'exec-1', status: 'running', packRun: { packId: 'pack-1' } }),
        });
      }
      if (url === '/api/v1/packs' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pack: { id: 'pack-2', name: 'Imported Harness' } }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('loads a single pack and exposes a pack-aware start helper', async () => {
    render(<UsePackHarness onUpdate={(api) => { packApi = api; }} />);

    await waitFor(() => {
      expect(packApi?.pack).toMatchObject({
        id: 'pack-1',
        name: 'Marketing Harness',
        workflowId: 'wf-1',
      });
      expect(packApi?.pack.inputSchema).toEqual({ type: 'object', properties: {}, required: [] });
      expect(packApi?.pack.knowledgeSources).toEqual([]);
    });

    await act(async () => {
      await packApi.start({
        projectId: 'proj-1',
        projectPath: 'C:/projects/demo',
        input: { brief: 'Launch a campaign' },
      });
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/packs/pack-1/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ClaudeCodeManager',
      },
      body: JSON.stringify({
        projectId: 'proj-1',
        projectPath: 'C:/projects/demo',
        input: { brief: 'Launch a campaign' },
      }),
    });
  });

  it('lists packs and appends newly created packs', async () => {
    render(<UsePackListHarness onUpdate={(api) => { listApi = api; }} />);

    await waitFor(() => {
      expect(listApi?.packs).toHaveLength(1);
    });

    await act(async () => {
      await listApi.create({ name: 'Imported Harness' });
    });

    expect(listApi.packs.map((pack) => pack.name)).toEqual(['Imported Harness', 'Marketing Harness']);
  });
});
