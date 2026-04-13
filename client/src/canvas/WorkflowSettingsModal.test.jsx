import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowSettingsModal from './WorkflowSettingsModal.jsx';

describe('WorkflowSettingsModal workflow-native interface contracts', () => {
  it('edits workflow inputs, outputs, artifacts, and applies them with existing settings/context', () => {
    const onApply = vi.fn();
    render(
      <WorkflowSettingsModal
        workflowDef={{
          description: 'Existing goal',
          settings: { mode: 'autonomous', budgetTokens: 100000 },
          initialContext: { currentTask: 'Do the work' },
          inputContract: [],
          outputContract: { outputs: [], artifacts: [] },
        }}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Interface' }));
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add' })[0]);

    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'brief' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Brief' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'textarea' } });
    fireEvent.click(screen.getByLabelText('Required'));
    fireEvent.change(screen.getByLabelText('Help text'), { target: { value: 'Campaign brief' } });

    fireEvent.click(screen.getAllByRole('button', { name: '+ Add' })[1]);
    fireEvent.change(screen.getAllByLabelText('Key')[1], { target: { value: 'result' } });
    fireEvent.change(screen.getAllByLabelText('Label')[1], { target: { value: 'Result' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'finalText' } });

    fireEvent.click(screen.getAllByRole('button', { name: '+ Add' })[2]);
    fireEvent.change(screen.getAllByLabelText('Key')[2], { target: { value: 'report' } });
    fireEvent.change(screen.getAllByLabelText('Label')[2], { target: { value: 'Report' } });
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'markdown' } });
    fireEvent.change(screen.getAllByLabelText('Source')[1], { target: { value: 'aggregatedArtifact' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'autonomous', budgetTokens: 100000 }),
      { currentTask: 'Do the work' },
      'Existing goal',
      [expect.objectContaining({
        key: 'brief',
        label: 'Brief',
        type: 'textarea',
        required: true,
        helpText: 'Campaign brief',
      })],
      {
        outputs: [expect.objectContaining({ key: 'result', label: 'Result', source: 'finalText' })],
        artifacts: [expect.objectContaining({ key: 'report', label: 'Report', source: 'aggregatedArtifact', format: 'markdown' })],
      }
    );
  });

  it('loads existing contracts and preserves the wave-one pack-authority guidance copy', () => {
    render(
      <WorkflowSettingsModal
        workflowDef={{
          description: 'Existing goal',
          inputContract: [{ key: 'audience', label: 'Audience', type: 'text', required: true }],
          outputContract: {
            outputs: [{ key: 'summary', label: 'Summary', source: 'finalText' }],
            artifacts: [{ key: 'report', label: 'Report', source: 'aggregatedArtifact', format: 'markdown' }],
          },
        }}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Interface' }));

    expect(screen.getByDisplayValue('audience')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Summary')).toBeInTheDocument();
    expect(screen.getByText(/Pack runs remain pack-authoritative/i)).toBeInTheDocument();
  });
});
