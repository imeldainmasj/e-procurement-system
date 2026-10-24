import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

const base = { onClose: vi.fn(), title: 'Tolak', message: 'Yakin?', confirmLabel: 'Tolak' };

describe('<ConfirmModal>', () => {
  it('requires a reason before confirming and passes it trimmed', () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...base} open requireReason onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'Tolak' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Anggaran habis ' } });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('Anggaran habis');
  });

  it('allows confirming without an optional comment', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal {...base} open optionalReason confirmLabel="Setujui" onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('starts empty again after being closed and reopened', () => {
    const { rerender } = render(<ConfirmModal {...base} open requireReason onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'lama' } });
    rerender(<ConfirmModal {...base} open={false} requireReason onConfirm={vi.fn()} />);
    rerender(<ConfirmModal {...base} open requireReason onConfirm={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
