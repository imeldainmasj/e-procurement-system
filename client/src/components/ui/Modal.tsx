import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { cn } from '@/utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Rendered in the modal-action row. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClass = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' } as const;

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('modal-box', sizeClass[size])}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
        {footer && <div className="modal-action">{footer}</div>}
      </div>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Tutup" />
    </div>
  );
}
