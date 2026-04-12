import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
