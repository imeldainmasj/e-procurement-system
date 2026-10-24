import { Ban, ClipboardCheck, PackageCheck, PackageX, Pencil, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  canCancelPr,
  canCompleteStockCheck,
  canEditPr,
  canStartStockCheck,
  formatRupiah,
  type PrDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Modal } from '@/components/ui/Modal';
import { usePrMutations } from '@/hooks/usePurchaseRequests';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';

type Dialog = 'submit' | 'delete' | 'start' | 'stock' | 'cancel' | null;

/** Action buttons allowed for the current user, using the same rules as the server. */
export function PrActions({ pr }: { pr: PrDto }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const m = usePrMutations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [stockAvailable, setStockAvailable] = useState<boolean | null>(null);
  const [stockNotes, setStockNotes] = useState('');

  if (!user) return null;
  const ref = { requesterId: pr.requester.id, status: pr.status };
  const actor = { id: user.id, roles: user.roles };
  const close = () => setDialog(null);
  const onError = (err: unknown) => toast.error(getErrorMessage(err));

  const can = {
    edit: canEditPr(ref, actor),
    start: canStartStockCheck(ref, actor),
    complete: canCompleteStockCheck(ref, actor),
    cancel: canCancelPr(ref, actor),
  };
  if (!Object.values(can).some(Boolean)) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit && (
        <>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog('submit')}
          >
            <Send className="size-4" /> Ajukan
          </button>
          <Link to={`/pengajuan/${pr.id}/ubah`} className="btn btn-outline btn-sm">
            <Pencil className="size-4" /> Ubah
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-error"
            onClick={() => setDialog('delete')}
          >
            <Trash2 className="size-4" /> Hapus
          </button>
        </>
      )}
      {can.start && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog('start')}>
          <ClipboardCheck className="size-4" /> Mulai Cek Stok
        </button>
      )}
      {can.complete && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setStockAvailable(null);
            setStockNotes('');
            setDialog('stock');
          }}
        >
          <ClipboardCheck className="size-4" /> Input Hasil Cek Stok
        </button>
      )}
      {can.cancel && (
        <button
          type="button"
          className="btn btn-ghost btn-sm text-error"
          onClick={() => setDialog('cancel')}
        >
          <Ban className="size-4" /> Batalkan
        </button>
      )}

      <ConfirmModal
        open={dialog === 'submit'}
        onClose={close}
        loading={m.submit.isPending}
        title="Ajukan Pengajuan"
        confirmLabel="Ajukan"
        message={
          <>
            Ajukan pengajuan senilai <b>{formatRupiah(pr.estimatedTotal)}</b>? Setelah diajukan,
            pengajuan tidak dapat diubah lagi.
          </>
        }
        onConfirm={() =>
          m.submit.mutate(pr.id, {
            onSuccess: (res) => toast.success(`Pengajuan ${res.number} berhasil diajukan`),
            onError,
            onSettled: close,
          })
        }
      />
      <ConfirmModal
        open={dialog === 'delete'}
        onClose={close}
        loading={m.remove.isPending}
        variant="error"
        title="Hapus Draft"
        confirmLabel="Hapus"
        message="Draft pengajuan ini akan dihapus permanen."
        onConfirm={() =>
          m.remove.mutate(pr.id, {
            onSuccess: () => {
              toast.success('Draft dihapus');
              navigate('/pengajuan');
            },
            onError,
            onSettled: close,
          })
        }
      />
      <ConfirmModal
        open={dialog === 'start'}
        onClose={close}
        loading={m.startStockCheck.isPending}
        title="Mulai Cek Stok"
        confirmLabel="Mulai"
        message={
          <>
            Tandai pengajuan <b>{pr.number}</b> sedang dicek ketersediaannya di gudang?
          </>
        }
        onConfirm={() =>
          m.startStockCheck.mutate(pr.id, {
            onSuccess: () => toast.success('Cek stok dimulai'),
            onError,
            onSettled: close,
          })
        }
      />
      <ConfirmModal
        open={dialog === 'cancel'}
        onClose={close}
        loading={m.cancel.isPending}
        variant="error"
        requireReason
        reasonLabel="Alasan pembatalan"
        title="Batalkan Pengajuan"
        confirmLabel="Batalkan Pengajuan"
        message={
          <>
            Batalkan pengajuan <b>{pr.number}</b>? Tindakan ini tidak dapat diurungkan.
          </>
        }
        onConfirm={(reason) =>
          m.cancel.mutate(
            { id: pr.id, reason: reason ?? '' },
            { onSuccess: () => toast.success('Pengajuan dibatalkan'), onError, onSettled: close },
          )
        }
      />

      <Modal
        open={dialog === 'stock'}
        onClose={close}
        title="Hasil Cek Stok"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={close}>
              Batal
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={stockAvailable === null || m.completeStockCheck.isPending}
              onClick={() =>
                m.completeStockCheck.mutate(
                  { id: pr.id, input: { available: stockAvailable!, notes: stockNotes } },
                  {
                    onSuccess: (res) =>
                      toast.success(
                        res.status === 'FULFILLED_FROM_STOCK'
                          ? 'Pengajuan dipenuhi dari stok'
                          : 'Pengajuan diteruskan ke proses approval',
                      ),
                    onError,
                    onSettled: close,
                  },
                )
              }
            >
              {m.completeStockCheck.isPending && (
                <span className="loading loading-spinner loading-sm" />
              )}
              Simpan
            </button>
          </>
        }
      >
        <p className="text-base-content/80 mb-3 text-sm">
          Keputusan berlaku untuk seluruh pengajuan. Jika ada item yang tidak tersedia, pilih
          &quot;Tidak tersedia&quot; agar pengajuan diproses melalui approval.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <label
            className={`border-base-300 rounded-box flex cursor-pointer items-start gap-3 border p-3 ${stockAvailable === true ? 'border-success bg-success/5' : ''}`}
          >
            <input
              type="radio"
              name="stock"
              className="radio radio-success radio-sm mt-1"
              checked={stockAvailable === true}
              onChange={() => setStockAvailable(true)}
            />
            <span>
              <span className="flex items-center gap-1 font-medium">
                <PackageCheck className="size-4" /> Semua tersedia
              </span>
              <span className="text-base-content/60 text-xs">
                Dipenuhi dari stok gudang, tanpa approval.
              </span>
            </span>
          </label>
          <label
            className={`border-base-300 rounded-box flex cursor-pointer items-start gap-3 border p-3 ${stockAvailable === false ? 'border-warning bg-warning/5' : ''}`}
          >
            <input
              type="radio"
              name="stock"
              className="radio radio-warning radio-sm mt-1"
              checked={stockAvailable === false}
              onChange={() => setStockAvailable(false)}
            />
            <span>
              <span className="flex items-center gap-1 font-medium">
                <PackageX className="size-4" /> Tidak tersedia
              </span>
              <span className="text-base-content/60 text-xs">
                Lanjut ke Memo Internal & approval berjenjang.
              </span>
            </span>
          </label>
        </div>
        <fieldset className="fieldset mt-3">
          <legend className="fieldset-legend">Catatan</legend>
          <textarea
            className="textarea w-full"
            rows={2}
            placeholder="mis. lokasi rak, item yang tersedia sebagian"
            value={stockNotes}
            onChange={(e) => setStockNotes(e.target.value)}
          />
        </fieldset>
      </Modal>
    </div>
  );
}
