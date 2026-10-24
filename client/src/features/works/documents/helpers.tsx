import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { WorkDetailDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { usePermission } from '@/hooks/usePermission';
import { toast } from '@/stores/toastStore';
import { formatCurrency } from '@/utils/formatCurrency';

/** What the current user may do with this work's documents (server checks again). */
export function useDocumentAccess(work: WorkDetailDto) {
  const { can } = usePermission();
  return {
    canWrite: work.access.canEdit && can('WORK', 'update'),
    canDelete: work.access.canDelete && can('WORK', 'delete'),
  };
}

/** "Rp 1.250.000" for IDR, "USD 20.000" otherwise. */
export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return '-';
  if (!currency || currency === 'IDR') return formatCurrency(amount);
  return `${currency} ${amount.toLocaleString('id-ID')}`;
}

export const TABLE_HEAD = 'bg-base-200/60 text-base-content/60 text-xs uppercase';

/** Delete confirmation for one document; the server may refuse (dependent milestones). */
export function useDeleteDialog() {
  const [target, setTarget] = useState<{ label: string; run: () => Promise<unknown> } | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const dialog: ReactNode = (
    <ConfirmModal
      open={target !== null}
      onClose={() => setTarget(null)}
      loading={loading}
      variant="error"
      title="Hapus Dokumen"
      confirmLabel="Hapus"
      message={
        <>
          Hapus <b>{target?.label}</b>? Milestone terkait kembali menjadi Berjalan. Penghapusan
          ditolak jika tahap sesudahnya sudah berjalan.
        </>
      }
      onConfirm={() => {
        if (!target) return;
        setLoading(true);
        target
          .run()
          .then(() => {
            toast.success(`${target.label} dihapus`);
            return Promise.all(
              ['works', 'agreements', 'vendors'].map((key) =>
                queryClient.invalidateQueries({ queryKey: [key] }),
              ),
            );
          })
          .catch((err: unknown) => toast.error(getErrorMessage(err)))
          .finally(() => {
            setLoading(false);
            setTarget(null);
          });
      }}
    />
  );
  return {
    confirmDelete: (label: string, run: () => Promise<unknown>) => setTarget({ label, run }),
    dialog,
  };
}
