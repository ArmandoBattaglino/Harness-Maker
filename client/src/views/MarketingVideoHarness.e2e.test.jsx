import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProvider, useAppDispatch } from '../store/AppContext.jsx';
import { useSwarmStore } from '../store/SwarmContext.jsx';
import { resetSwarmStore } from '../test/resetSwarmStore.js';
import PackLibraryView from './PackLibraryView.jsx';

const marketingPack = {
  id: 'marketing-video-pack',
  name: 'Marketing Video Campaign Harness',
  description: 'Creates script, storyboard, shot list, CTA, social variants, and compliance notes.',
  category: 'marketing',
  workflowId: 'workflow-marketing-video',
  packVersion: '1.0.0',
  status: 'draft',
  inputSchema: {
    type: 'object',
    properties: {
      productName: { type: 'string', title: 'Product name', 'x-packField': { fieldType: 'text', help: 'Product being promoted' } },
      productDescription: { type: 'string', title: 'Product description', 'x-packField': { fieldType: 'textarea', help: 'Long product context' } },
      targetAudience: { type: 'string', title: 'Target audience', 'x-packField': { fieldType: 'text' } },
      primaryPlatform: { type: 'string', title: 'Primary platform', enum: ['instagram', 'tiktok', 'youtube_shorts'], 'x-packField': { fieldType: 'enum' } },
      videoLengthSeconds: { type: 'integer', title: 'Video length seconds', 'x-packField': { fieldType: 'json' } },
      callToAction: { type: 'string', title: 'Call to action', 'x-packField': { fieldType: 'text' } },
    },
    required: ['productName', 'productDescription', 'targetAudience', 'primaryPlatform', 'videoLengthSeconds', 'callToAction'],
  },
  artifactDefinitions: [
    { id: 'marketing-video-plan', name: 'Marketing Video Plan', format: 'markdown' },
  ],
  visibleSteps: [
    { id: 'strategy', label: 'Strategy', status: 'configured' },
    { id: 'script', label: 'Script', status: 'configured' },
    { id: 'storyboard', label: 'Storyboard', status: 'configured' },
  ],
};

function SeedProjects() {
  const dispatch = useAppDispatch();
  React.useEffect(() => {
    dispatch({
      type: 'SET_PROJECTS',
      payload: [{ id: 'project-marketing', name: 'Marketing Project', path: 'C:/projects/marketing' }],
    });
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: 'project-marketing' });
  }, [dispatch]);
  return null;
}

describe('Marketing Video Harness operator flow', () => {
  let fetchMock;

  beforeEach(() => {
    resetSwarmStore();
    fetchMock = vi.fn((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ packs: [marketingPack] }) });
      }
      if (url === '/api/v1/packs/marketing-video-pack' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack: marketingPack }) });
      }
      if (url === '/api/v1/packs/marketing-video-pack/start' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-marketing-video',
            workflowId: 'workflow-marketing-video',
            status: 'running',
            packRun: { packId: marketingPack.id, packVersion: '1.0.0', visibleSteps: [{ id: 'strategy', label: 'Strategy', status: 'running' }] },
            packResult: { packId: marketingPack.id, outputs: {}, artifacts: [] },
          }),
        });
      }
      if (url === '/api/v1/swarm/exec-marketing-video/status' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-marketing-video',
            workflowId: 'workflow-marketing-video',
            status: 'completed',
            packRun: {
              packId: marketingPack.id,
              packVersion: '1.0.0',
              visibleSteps: [
                { id: 'strategy', label: 'Strategy', status: 'completed' },
                { id: 'script', label: 'Script', status: 'completed' },
                { id: 'storyboard', label: 'Storyboard', status: 'completed' },
              ],
            },
          }),
        });
      }
      if (String(url).startsWith('/api/v1/swarm/executions/exec-marketing-video/results') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            executionId: 'exec-marketing-video',
            status: 'completed',
            packRun: { packId: marketingPack.id, packVersion: '1.0.0', visibleSteps: [{ id: 'strategy', label: 'Strategy', status: 'completed' }] },
            packResult: {
              packId: marketingPack.id,
              outputs: {
                result: 'creative brief, video script, storyboard, shot list, CTA, social variants, compliance notes',
              },
              artifacts: [{ id: 'marketing-video-plan', name: 'Marketing Video Plan', status: 'ready' }],
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('fills a generated marketing-video form, launches with project binding, and hydrates final pack results', async () => {
    render(
      <AppProvider>
        <SeedProjects />
        <PackLibraryView />
      </AppProvider>
    );

    expect(await screen.findByText('Marketing Video Campaign Harness')).toBeTruthy();
    expect(await screen.findByText('Pack Detail')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Product name/i), { target: { value: 'VoltLite E-Bike' } });
    fireEvent.change(screen.getByLabelText(/Product description/i), { target: { value: 'A lightweight e-bike for urban commuters. '.repeat(20) } });
    fireEvent.change(screen.getByLabelText(/Target audience/i), { target: { value: 'Urban professionals' } });
    fireEvent.change(screen.getByLabelText(/Primary platform/i), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText(/Video length seconds/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/Call to action/i), { target: { value: 'Book a test ride' } });
    fireEvent.click(screen.getByText('Launch pack'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/packs/marketing-video-pack/start', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          projectId: 'project-marketing',
          projectPath: 'C:/projects/marketing',
          input: {
            productName: 'VoltLite E-Bike',
            productDescription: 'A lightweight e-bike for urban commuters. '.repeat(20),
            targetAudience: 'Urban professionals',
            primaryPlatform: 'instagram',
            videoLengthSeconds: 30,
            callToAction: 'Book a test ride',
          },
        }),
      }));
      expect(useSwarmStore.getState().packResult.outputs.result).toContain('storyboard');
      expect(screen.getByText('Started execution exec-marketing-video')).toBeTruthy();
    });
  });
});
