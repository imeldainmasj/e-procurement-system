import { X } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

const variantClass = {
  success: 'alert-success',
  error: 'alert-error',
  info: 'alert-info',
  warning: 'alert-warning',
} as const;

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="toast toast-end toast-top z-50" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cn('alert shadow-lg', variantClass[t.variant])}>
          <span>{t.message}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            onClick={() => dismiss(t.id)}
            aria-label="Tutup"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
