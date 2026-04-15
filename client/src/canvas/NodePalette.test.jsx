import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NodePalette from './NodePalette.jsx';

describe('NodePalette visual I/O cards', () => {
  it('shows Input Block and Output Extractor without removing existing cards', () => {
    render(<NodePalette />);

    expect(screen.getByText('Agent Node')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Webhook Trigger')).toBeInTheDocument();
    expect(screen.getByText('Input Block')).toBeInTheDocument();
    expect(screen.getByText('Output Extractor')).toBeInTheDocument();
  });

  it('separates Build node creation from Workflows management controls', () => {
    render(
      <NodePalette
        workflowProps={{
          workflows: [{ id: 'wf-1', name: 'Workflow One', updatedAt: '2026-04-14T00:00:00.000Z' }],
          selectedWorkflowId: '',
          onSelectWorkflow: vi.fn(),
          onLoad: vi.fn(),
          onRefresh: vi.fn(),
          onDuplicate: vi.fn(),
          onExport: vi.fn(),
          onImport: vi.fn(),
          loading: false,
          disabled: false,
          hasWorkflowDef: true,
          error: null,
          importError: null,
          onDismissImportError: vi.fn(),
          projectLabel: 'All saved workflows',
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Build' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workflows' })).toBeInTheDocument();
    expect(screen.getByText('Agent Node')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Workflows' }));

    expect(screen.queryByText('Agent Node')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('emits the canonical workflowInput drag type for new Input Blocks', () => {
    render(<NodePalette />);
    const card = screen.getByText('Input Block').closest('[draggable="true"]');
    const setData = vi.fn();

    fireEvent.dragStart(card, {
      dataTransfer: {
        setData,
        effectAllowed: 'move',
      },
    });

    expect(setData).toHaveBeenCalledWith('application/reactflow-type', 'workflowInput');
  });
});
