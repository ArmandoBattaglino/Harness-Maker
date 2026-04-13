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
