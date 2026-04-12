import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProvider, useAppDispatch } from '../store/AppContext.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';
import PackLibraryView from './PackLibraryView.jsx';

const pack = {
  id: 'pack-1',
  name: 'Marketing Harness',
  description: 'Run marketing workflow',
  category: 'marketing',
  workflowId: 'wf-1',
  packVersion: '1.0.0',
  status: 'draft',
  inputSchema: {
    type: 'object',
    properties: {
      brief: { type: 'string', title: 'Brief', 'x-packField': { help: 'Campaign brief' } },
    },
    required: ['brief'],
  },
  artifactDefinitions: [{ id: 'artifact-1', name: 'Report', format: 'markdown' }],
  visibleSteps: [{ id: 'step-1', label: 'Draft', status: 'configured' }],
};

const secondPack = {
  ...pack,
  id: 'pack-2',
  name: 'Sales Harness',
  description: 'Run sales workflow',
  inputSchema: {
    type: 'object',
    properties: {
      headline: { type: 'string', title: 'Headline', 'x-packField': { help: 'Sales headline' } },
    },
    required: ['headline'],
  },
  artifactDefinitions: [{ id: 'artifact-2', name: 'Sales report', format: 'markdown' }],
  visibleSteps: [{ id: 'step-2', label: 'Pitch', status: 'configured' }],
};

describe('PackLibraryView', () => {
  let fetchMock;

  beforeEach(() => {
    resetSwarmStore();
    fetchMock = vi.fn((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ packs: [pack] }) });
      }
      if (url === '/api/v1/packs/pack-1' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack }) });
      }
      if (url === '/api/v1/projects' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ projects: [] }) });
      }
      if (url === '/api/v1/packs/pack-1/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-pack-1',
            workflowId: 'wf-1',
            status: 'running',
            packRun: { packId: 'pack-1', packVersion: '1.0.0', visibleSteps: [{ id: 'step-1', label: 'Draft', status: 'running' }] },
            packResult: { packId: 'pack-1', outputs: {}, artifacts: [{ id: 'artifact-1', name: 'Report', status: 'pending' }] },
          }),
        });
      }
      if (url === '/api/v1/packs/pack-2/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-pack-2',
            workflowId: 'wf-1',
            status: 'running',
            packRun: { packId: 'pack-2', packVersion: '1.0.0', visibleSteps: [{ id: 'step-2', label: 'Pitch', status: 'running' }] },
            packResult: { packId: 'pack-2', outputs: {}, artifacts: [{ id: 'artifact-2', name: 'Sales report', status: 'pending' }] },
          }),
        });
      }
      if (url === '/api/v1/swarm/exec-pack-1/status' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-pack-1',
            workflowId: 'wf-1',
            status: 'completed',
            packRun: { packId: 'pack-1', packVersion: '1.0.0', visibleSteps: [{ id: 'step-1', label: 'Draft', status: 'completed' }] },
          }),
        });
      }
      if (String(url).startsWith('/api/v1/swarm/executions/exec-pack-1/results') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-pack-1',
            status: 'completed',
            packRun: { packId: 'pack-1', packVersion: '1.0.0', visibleSteps: [{ id: 'step-1', label: 'Draft', status: 'completed' }] },
            packResult: { packId: 'pack-1', outputs: { result: 'done' }, artifacts: [{ id: 'artifact-1', name: 'Report', status: 'ready' }] },
          }),
        });
      }
      if (url === '/api/v1/packs/pack-1/export' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ bundle: { manifest: { packId: 'pack-1', packVersion: '1.0.0' } } }) });
      }
      if (url === '/api/v1/packs/pack-1/install' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ install: { packId: 'pack-1' } }) });
      }
      if (url === '/api/v1/packs/pack-1/fork' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ pack: { ...pack, id: 'pack-fork', name: 'Marketing Harness (Fork)' } }) });
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('renders pack detail, generated run form, monitor, and debug drawer', async () => {
    useSwarmStore.setState({
      packRun: null,
      packResult: null,
    });

    render(
      <AppProvider>
        <PackLibraryView />
      </AppProvider>
    );

    expect(await screen.findByText('Marketing Harness')).toBeTruthy();
    expect(await screen.findByText('Pack Detail')).toBeTruthy();
    expect(screen.getByText('Run form')).toBeTruthy();
    expect(screen.getByText('Run monitor')).toBeTruthy();
    expect(screen.getByLabelText(/Brief/i)).toBeTruthy();
    expect(screen.getByText('Choose a project before launching this pack.')).toBeTruthy();

    fireEvent.click(screen.getByText('Advanced debug'));
    expect(await screen.findByText(/\"executionId\": null/)).toBeTruthy();

    fireEvent.click(screen.getByText('Export bundle'));
    expect(await screen.findByText('Exported pack-1@1.0.0')).toBeTruthy();
    fireEvent.click(screen.getByText('Install locally'));
    expect(await screen.findByText('Installed pack-1')).toBeTruthy();
    fireEvent.click(screen.getByText('Fork draft'));
    expect(await screen.findByText('Forked Marketing Harness (Fork)')).toBeTruthy();
  });

  it('launches with explicit projectId, projectPath, and generated input payload', async () => {
    render(
      <AppProvider>
        <SeedProjects />
        <PackLibraryView />
      </AppProvider>
    );

    expect(await screen.findByText('Pack Detail')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Launch the spring campaign' } });
    fireEvent.click(screen.getByText('Launch pack'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/packs/pack-1/start', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          projectPath: 'C:/projects/one',
          input: { brief: 'Launch the spring campaign' },
        }),
      }));
      expect(useSwarmStore.getState().packRun.packId).toBe('pack-1');
      expect(useSwarmStore.getState().packResult.outputs.result).toBe('done');
      expect(screen.getByText('Started execution exec-pack-1')).toBeTruthy();
    });
  });

  it('shows launch errors and clears stale pack runtime state on failed start', async () => {
    useSwarmStore.setState({
      packRun: { packId: 'pack-1', visibleSteps: [{ id: 'stale-step', label: 'Stale', status: 'completed' }] },
      packResult: { packId: 'pack-1', outputs: { result: 'stale' }, artifacts: [{ id: 'stale-artifact', name: 'Stale', status: 'ready' }] },
    });
    fetchMock.mockImplementation((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ packs: [pack] }) });
      }
      if (url === '/api/v1/packs/pack-1' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack }) });
      }
      if (url === '/api/v1/projects' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ projects: [] }) });
      }
      if (url === '/api/v1/packs/pack-1/start' && method === 'POST') {
        return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: 'Input validation failed' }) });
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });

    render(
      <AppProvider>
        <SeedProjects />
        <PackLibraryView />
      </AppProvider>
    );

    expect(await screen.findByText('Pack Detail')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Launch the spring campaign' } });
    fireEvent.click(screen.getByText('Launch pack'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Input validation failed');
    expect(useSwarmStore.getState().packRun).toBeNull();
    expect(useSwarmStore.getState().packResult).toBeNull();
    expect(screen.queryByText(/Started execution/)).toBeNull();
  });

  it('clears launch errors when the selected pack changes', async () => {
    fetchMock.mockImplementation((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ packs: [pack, secondPack] }) });
      }
      if (url === '/api/v1/packs/pack-1' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack }) });
      }
      if (url === '/api/v1/packs/pack-2' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack: secondPack }) });
      }
      if (url === '/api/v1/projects' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ projects: [] }) });
      }
      if (url === '/api/v1/packs/pack-1/start' && method === 'POST') {
        return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: 'Input validation failed' }) });
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });

    render(
      <AppProvider>
        <SeedProjects />
        <PackLibraryView />
      </AppProvider>
    );

    expect(await screen.findByText('Pack Detail')).toBeTruthy();
    fireEvent.click(screen.getByText('Launch pack'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Input validation failed');

    fireEvent.click(screen.getByText('Sales Harness'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('clears pack-local input and local execution state when switching packs', async () => {
    fetchMock.mockImplementation((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ packs: [pack, secondPack] }) });
      }
      if (url === '/api/v1/packs/pack-1' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack }) });
      }
      if (url === '/api/v1/packs/pack-2' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack: secondPack }) });
      }
      if (url === '/api/v1/projects' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ projects: [] }) });
      }
      if (url === '/api/v1/packs/pack-1/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-pack-1',
            workflowId: 'wf-1',
            status: 'running',
            packRun: { packId: 'pack-1', packVersion: '1.0.0', visibleSteps: [{ id: 'step-1', label: 'Draft', status: 'running' }] },
            packResult: { packId: 'pack-1', outputs: {}, artifacts: [{ id: 'artifact-1', name: 'Report', status: 'pending' }] },
          }),
        });
      }
      if (url === '/api/v1/packs/pack-2/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-pack-2',
            workflowId: 'wf-1',
            status: 'running',
            packRun: { packId: 'pack-2', packVersion: '1.0.0', visibleSteps: [{ id: 'step-2', label: 'Pitch', status: 'running' }] },
            packResult: { packId: 'pack-2', outputs: {}, artifacts: [{ id: 'artifact-2', name: 'Sales report', status: 'pending' }] },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });

    render(
      <AppProvider>
        <SeedProjects />
        <PackLibraryView />
      </AppProvider>
    );

    expect(await screen.findByText('Pack Detail')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Marketing-only brief' } });
    fireEvent.click(screen.getByText('Launch pack'));

    expect(await screen.findByText('Started execution exec-pack-1')).toBeTruthy();
    fireEvent.click(screen.getByText('Advanced debug'));
    expect(await screen.findByText(/"packId": "pack-1"/)).toBeTruthy();

    fireEvent.click(screen.getByText('Sales Harness'));

    await waitFor(() => {
      expect(screen.queryByText('Started execution exec-pack-1')).toBeNull();
      expect(screen.queryByText(/"packId": "pack-1"/)).toBeNull();
    });

    fireEvent.change(screen.getByLabelText(/Headline/i), { target: { value: 'Close the quarter strong' } });
    fireEvent.click(screen.getByText('Launch pack'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/packs/pack-2/start', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          projectId: 'proj-1',
          projectPath: 'C:/projects/one',
          input: { headline: 'Close the quarter strong' },
        }),
      }));
      expect(screen.getByText('Started execution exec-pack-2')).toBeTruthy();
    });
  });
});

function SeedProjects() {
  const dispatch = useAppDispatch();
  React.useEffect(() => {
    dispatch({
      type: 'SET_PROJECTS',
      payload: [{ id: 'proj-1', name: 'Project One', path: 'C:/projects/one' }],
    });
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: 'proj-1' });
  }, [dispatch]);
  return null;
}
