import { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useInbox } from './useInbox.js';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';

function UseInboxHarness({ executionId = 'exec-1', onUpdate }) {
  const inboxApi = useInbox(executionId);

  useEffect(() => {
    onUpdate(inboxApi);
  }, [inboxApi, onUpdate]);

  return null;
}

describe('useInbox client contracts', () => {
  let inboxApi;
  let fetchMock;

  beforeEach(() => {
    resetSwarmStore();
    inboxApi = null;
    fetchMock = vi.fn(() => Promise.reject(new Error('Unexpected fetch')));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.fetch;
  });

  it('does not mutate inbox state when inbox loading fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    useSwarmStore.setState({
      inboxItems: [
        { id: 'existing-1', status: 'pending', agentId: 'node-a' },
      ],
      wsConnected: true,
    });
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<UseInboxHarness onUpdate={(api) => { inboxApi = api; }} />);

    await waitFor(() => {
      expect(inboxApi?.inboxItems).toEqual([
        {
          id: 'existing-1',
          type: 'user_requested',
          agentId: 'node-a',
          status: 'pending',
          payload: '',
        },
      ]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
  });

  it('normalizes REST inbox items and exposes only pending entries', async () => {
    useSwarmStore.setState({ wsConnected: true });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            item: {
              id: 'wrapped-1',
              type: 'approval',
              nodeId: 'node-a',
              status: 'pending',
              resume_text: 'continue',
            },
          },
          {
            id: 'flat-2',
            type: 'user_requested',
            agent_id: 'node-b',
            status: 'pending',
            resumeText: 'resume me',
          },
          {
            id: 'resolved-3',
            type: 'user_requested',
            agentId: 'node-c',
            status: 'approved',
          },
        ],
      }),
    });

    render(<UseInboxHarness onUpdate={(api) => { inboxApi = api; }} />);

    await waitFor(() => {
      expect(inboxApi?.inboxItems).toEqual([
        {
          id: 'wrapped-1',
          type: 'approval',
          agentId: 'node-a',
          status: 'pending',
          payload: 'continue',
        },
        {
          id: 'flat-2',
          type: 'user_requested',
          agentId: 'node-b',
          status: 'pending',
          payload: 'resume me',
        },
      ]);
    });
  });

  it('polls every 10 seconds only while websocket is disconnected', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<UseInboxHarness onUpdate={(api) => { inboxApi = api; }} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(inboxApi).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => {
      useSwarmStore.getState().setWsConnected(true);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('approves inbox items with the mutation header and resolves them locally', async () => {
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/inbox')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              { id: 'item-1', status: 'pending', agentId: 'node-a' },
            ],
          }),
        });
      }
      if (String(url).endsWith('/inbox/item-1/approve')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseInboxHarness executionId="exec-approve" onUpdate={(api) => { inboxApi = api; }} />);

    await waitFor(() => {
      expect(inboxApi?.inboxItems).toHaveLength(1);
    });

    await act(async () => {
      await inboxApi.approve('item-1', 'continue now');
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/swarm/exec-approve/inbox/item-1/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ClaudeCodeManager',
      },
      body: JSON.stringify({ resumeText: 'continue now' }),
    });
    expect(useSwarmStore.getState().resolvedHitlIds).toContain('item-1');
    expect(useSwarmStore.getState().inboxItems).toEqual([]);
  });

  it('does not resolve inbox items when approve returns a non-ok response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/inbox')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              { id: 'item-approve-fail', status: 'pending', agentId: 'node-a' },
            ],
          }),
        });
      }
      if (String(url).endsWith('/inbox/item-approve-fail/approve')) {
        return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseInboxHarness executionId="exec-approve-fail" onUpdate={(api) => { inboxApi = api; }} />);

    await waitFor(() => {
      expect(inboxApi?.inboxItems).toHaveLength(1);
    });

    await act(async () => {
      await inboxApi.approve('item-approve-fail', 'resume');
    });

    expect(useSwarmStore.getState().resolvedHitlIds).not.toContain('item-approve-fail');
    expect(useSwarmStore.getState().inboxItems).toEqual([
      {
        id: 'item-approve-fail',
        type: 'user_requested',
        agentId: 'node-a',
        status: 'pending',
        payload: '',
      },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useInbox] approve failed:', 500, 'Server Error');

    consoleErrorSpy.mockRestore();
  });

  it('rejects inbox items with the mutation header and resolves them locally', async () => {
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/inbox')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              { id: 'item-2', status: 'pending', agentId: 'node-b' },
            ],
          }),
        });
      }
      if (String(url).endsWith('/inbox/item-2/reject')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseInboxHarness executionId="exec-reject" onUpdate={(api) => { inboxApi = api; }} />);

    await waitFor(() => {
      expect(inboxApi?.inboxItems).toHaveLength(1);
    });

    await act(async () => {
      await inboxApi.reject('item-2');
    });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/swarm/exec-reject/inbox/item-2/reject', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'ClaudeCodeManager',
      },
    });
    expect(useSwarmStore.getState().resolvedHitlIds).toContain('item-2');
    expect(useSwarmStore.getState().inboxItems).toEqual([]);
  });

  it('does not resolve inbox items when reject returns a non-ok response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation((url) => {
      if (String(url).endsWith('/inbox')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              { id: 'item-reject-fail', status: 'pending', agentId: 'node-b' },
            ],
          }),
        });
      }
      if (String(url).endsWith('/inbox/item-reject-fail/reject')) {
        return Promise.resolve({ ok: false, status: 409, statusText: 'Conflict' });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<UseInboxHarness executionId="exec-reject-fail" onUpdate={(api) => { inboxApi = api; }} />);

    await waitFor(() => {
      expect(inboxApi?.inboxItems).toHaveLength(1);
    });

    await act(async () => {
      await inboxApi.reject('item-reject-fail');
    });

    expect(useSwarmStore.getState().resolvedHitlIds).not.toContain('item-reject-fail');
    expect(useSwarmStore.getState().inboxItems).toEqual([
      {
        id: 'item-reject-fail',
        type: 'user_requested',
        agentId: 'node-b',
        status: 'pending',
        payload: '',
      },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[useInbox] reject failed:', 409, 'Conflict');

    consoleErrorSpy.mockRestore();
  });
});
