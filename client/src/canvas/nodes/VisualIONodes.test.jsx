import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InputNode from './InputNode.jsx';
import OutputExtractorNode from './OutputExtractorNode.jsx';
import { useSwarmStore } from '../../store/SwarmContext.jsx';
import { resetSwarmStore } from '../../test/resetSwarmStore.js';

import React from 'react';

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    Handle: () => React.createElement('div', { 'data-testid': 'handle' }),
    Position: { Top: 'top', Bottom: 'bottom' },
  };
});

describe('Visual I/O node validation badges', () => {
  beforeEach(() => {
    resetSwarmStore();
  });

  it('shows and opens validation badge for InputNode', () => {
    useSwarmStore.setState({
      agentValidationIssuesByNodeId: {
        'input-a': [{ id: 'input:input-a:no-fields', nodeId: 'input-a', severity: 'error', summary: 'No fields', detail: 'Need at least one field.' }],
      },
    });

    render(<InputNode id="input-a" data={{ label: 'Input A', fields: [] }} selected={false} />);

    fireEvent.click(screen.getByLabelText('1 issue — click to review'));
    expect(screen.getByText('Need at least one field.')).toBeInTheDocument();
  });

  it('shows and opens validation badge for OutputExtractorNode', () => {
    useSwarmStore.setState({
      agentValidationIssuesByNodeId: {
        'extract-a': [{ id: 'output:extract-a:no-source', nodeId: 'extract-a', severity: 'error', summary: 'No source', detail: 'Connect an upstream agent.' }],
      },
    });

    render(<OutputExtractorNode id="extract-a" data={{ label: 'Extractor', format: 'markdown' }} selected={false} />);

    fireEvent.click(screen.getByLabelText('1 issue — click to review'));
    expect(screen.getByText('Connect an upstream agent.')).toBeInTheDocument();
  });
});

