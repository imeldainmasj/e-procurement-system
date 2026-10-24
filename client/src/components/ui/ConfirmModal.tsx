import { useState } from 'react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  variant?: 'primary' | 'error' | 'warning' | 'success';
  loading?: boolean;
  /** Shows a mandatory reason textarea (e.g. reject). */
  requireReason?: boolean;
  /** Shows an optional comment textarea (e.g. approve). */
  optionalReason?: boolean;
  reasonLabel?: string;
}

const btnClass = {
  primary: 'btn-primary',
  error: 'btn-error',
  warning: 'btn-warning',
  success: 'btn-success',
} as const;

/** The dialog body only mounts while open, so the reason starts empty every time. */
export function ConfirmModal(props: ConfirmModalProps) {
  return props.open ? <ConfirmDialog {...props} /> : null;
}

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  variant = 'primary',
  loading = false,
  requireReason = false,
  optionalReason = false,
  reasonLabel = 'Alasan',
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const reasonMissing = requireReason && reason.trim() === '';

  const close = onClose;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close} disabled={loading}>
            Batal
          </button>
          <button
            type="button"
            className={`btn ${btnClass[variant]}`}
            disabled={loading || reasonMissing}
            onClick={() =>
              onConfirm(requireReason || optionalReason ? reason.trim() || undefined : undefined)
            }
          >
            {loading && <span className="loading loading-spinner loading-sm" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-base-content/80">{message}</div>
      {(requireReason || optionalReason) && (
        <fieldset className="fieldset mt-4">
          <legend className="fieldset-legend">
            {reasonLabel}
            {requireReason ? ' *' : ' (opsional)'}
          </legend>
          <textarea
            className="textarea w-full"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </fieldset>
      )}
    </Modal>
  );
}
