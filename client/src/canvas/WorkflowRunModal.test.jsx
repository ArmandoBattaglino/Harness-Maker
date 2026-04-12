import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowRunModal from './WorkflowRunModal.jsx';

describe('WorkflowRunModal direct workflow user flow', () => {
  it('validates required fields and submits typed workflow inputs', () => {
    const onSubmit = vi.fn();
    render(
      <WorkflowRunModal
        workflowName="Workflow Heart"
        inputContract={[
          { key: 'brief', label: 'Brief', type: 'textarea', required: true, helpText: 'Campaign brief' },
          { key: 'count', label: 'Count', type: 'integer', defaultValue: 2 },
          { key: 'approved', label: 'Approved', type: 'boolean', defaultValue: false },
          { key: 'tone', label: 'Tone', type: 'enum', options: ['formal', 'friendly'], defaultValue: 'friendly' },
        ]}
        outputContract={{
          outputs: [{ key: 'result', label: 'Result' }],
          artifacts: [{ key: 'report', label: 'Report' }],
        }}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Brief is required.');

    fireEvent.change(screen.getByLabelText(/Brief/i), { target: { value: 'Launch X' } });
    fireEvent.change(screen.getByLabelText(/Count/i), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText(/Approved/i));
    fireEvent.change(screen.getByLabelText(/Tone/i), { target: { value: 'formal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    expect(onSubmit).toHaveBeenCalledWith({
      brief: 'Launch X',
      count: 7,
      approved: true,
      tone: 'formal',
    });
  });

  it('blocks invalid json input and submits parsed json when valid', () => {
    const onSubmit = vi.fn();
    render(
      <WorkflowRunModal
        workflowName="Workflow Heart"
        inputContract={[
          { key: 'payload', label: 'Payload', type: 'json', required: true, helpText: 'JSON payload' },
        ]}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Payload/i), { target: { value: '{bad json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Payload must be valid JSON.');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Payload/i), { target: { value: '{"ok":true}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    expect(onSubmit).toHaveBeenCalledWith({ payload: { ok: true } });
  });

  it('groups visual Input node fields and submits safe image metadata references', () => {
    const onSubmit = vi.fn();
    render(
      <WorkflowRunModal
        workflowName="Visual Workflow"
        inputContract={[
          {
            key: 'brief',
            label: 'Brief',
            type: 'textarea',
            required: true,
            inputNodeId: 'input-1',
            groupLabel: 'Client Brief',
            groupPrompt: 'Provide a brief and a reference image.',
          },
          {
            key: 'reference_image',
            label: 'Reference image',
            type: 'image',
            required: true,
            inputNodeId: 'input-1',
            groupLabel: 'Client Brief',
          },
        ]}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Client Brief')).toBeInTheDocument();
    expect(screen.getByText('Provide a brief and a reference image.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Brief/), { target: { value: 'Launch X' } });
    fireEvent.change(screen.getByLabelText(/Reference image/), {
      target: {
        files: [
          new File(['image-bytes'], 'reference.png', { type: 'image/png' }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    expect(onSubmit).toHaveBeenCalledWith({
      brief: 'Launch X',
      reference_image: expect.objectContaining({
        assetId: expect.stringContaining('pending-run-reference.png'),
        name: 'reference.png',
        mimeType: 'image/png',
        size: 11,
        previewUrl: '',
      }),
    });
  });
});
