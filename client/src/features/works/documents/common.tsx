import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-xs btn-soft btn-secondary" onClick={onClick}>
      <Plus className="size-3" /> {label}
    </button>
  );
}

export function RowActions({
  onEdit,
  onDelete,
  label,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onEdit}
          aria-label={`Ubah ${label}`}
        >
          <Pencil className="size-4" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="btn btn-ghost btn-xs text-error"
          onClick={onDelete}
          aria-label={`Hapus ${label}`}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-base-content/60 py-6 text-center text-sm">{children}</p>;
}
