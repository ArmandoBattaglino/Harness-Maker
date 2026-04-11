import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProvider } from '../store/AppContext.jsx';
import PackBuilderView from './PackBuilderView.jsx';

const workflow = {
  id: 'wf-1',
  name: 'Campaign Workflow',
  description: 'Create a campaign',
  nodes: [{ id: 'agent-a', type: 'agent', data: { label: 'Agent A' } }],
  edges: [],
};

const pack = {
  id: 'pack-1',
  name: 'Campaign Workflow Harness',
  description: 'Create a campaign',
  category: 'general',
  workflowId: 'wf-1',
  packVersion: '0.1.0',
  status: 'draft',
  engineCompatibility: '^1.0.0',
  visibility: 'private',
  runtimePolicy: { provider: 'auto', requiresProjectBinding: true, allowBuilderDebug: true },
  dependencies: [{ id: 'linked-workflow', type: 'workflow', targetId: 'wf-1', version: 'current', required: true }],
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  knowledgeSources: [],
  behaviorRules: [],
  outputSchema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false },
  artifactDefinitions: [{ id: 'final-report', name: 'Final report', sourceType: 'aggregatedArtifact', format: 'markdown', required: true }],
  visibleSteps: [],
  completionCriteria: ['Pack run reaches a terminal completed state'],
};

describe('PackBuilderView', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn((url, options = {}) => {
      const method = options.method ?? 'GET';
      if (url === '/api/v1/workflows' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ workflows: [workflow] }) });
      }
      if (url === '/api/v1/packs' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ packs: [] }) });
      }
      if (url === '/api/v1/packs' && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ pack }) });
      }
      if (url === '/api/v1/packs/pack-1' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ pack }) });
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
    });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('creates a guided pack draft and exposes all authoring surfaces', async () => {
    render(
      <AppProvider>
        <PackBuilderView />
      </AppProvider>
    );

    expect(await screen.findByText('Vertical harness authoring')).toBeTruthy();
    fireEvent.click(screen.getByText('Create draft from workflow'));

    expect(await screen.findByDisplayValue('Campaign Workflow Harness')).toBeTruthy();
    expect(screen.getByText('Overview + workflow link')).toBeTruthy();
    expect(screen.getByText('Input schema')).toBeTruthy();
    expect(screen.getByText('Knowledge/context injection')).toBeTruthy();
    expect(screen.getByText('Prompt/behavior rules')).toBeTruthy();
    expect(screen.getByText('Outputs + artifacts')).toBeTruthy();
    expect(screen.getByText('Runtime + dependencies')).toBeTruthy();
    expect(screen.getByText('Visible steps + operator preview')).toBeTruthy();

    fireEvent.click(screen.getByText('Add text input'));
    fireEvent.click(screen.getByText('Add inline context'));
    fireEvent.click(screen.getByText('Add behavior rule'));
    fireEvent.click(screen.getByText('Map visible step'));

    await waitFor(() => {
      expect(screen.getByText(/field1:/)).toBeTruthy();
      expect(screen.getByText(/Inline context/)).toBeTruthy();
      expect(screen.getByText(/Behavior rule:/)).toBeTruthy();
      expect(screen.getByText(/Step 1:/)).toBeTruthy();
      expect(screen.getByText(/Operator preview:/)).toBeTruthy();
    });
  });
});
