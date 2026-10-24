import { useState } from 'react';
import {
  VENDOR_STATUS_LABELS,
  VENDOR_STATUSES,
  type VendorDto,
  type VendorStatus,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useVendorMutations } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';

const HINTS: Record<VendorStatus, string> = {
  ACTIVE: 'Dapat dipilih untuk penawaran dan PO.',
  UNDER_REVIEW: 'Dokumen sedang diverifikasi; belum dapat dipilih.',
  INACTIVE: 'Tidak lagi bekerja sama, data tetap tersimpan.',
  BLACKLISTED: 'Diblokir karena pelanggaran. Wajib mencantumkan alasan.',
};

export function VendorStatusModal({ vendor, onClose }: { vendor: VendorDto; onClose: () => void }) {
  const { changeStatus } = useVendorMutations();
  const [status, setStatus] = useState<VendorStatus>(vendor.status);
  const [reason, setReason] = useState('');
  const reasonRequired = status === 'BLACKLISTED';
  const invalid = status === vendor.status || (reasonRequired && reason.trim() === '');

  const save = () =>
    changeStatus.mutate(
      { id: vendor.id, input: { status, reason } },
      {
        onSuccess: () => {
          toast.success(`Status ${vendor.name} menjadi ${VENDOR_STATUS_LABELS[status]}`);
          onClose();
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Ubah Status Vendor"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className={`btn ${status === 'BLACKLISTED' ? 'btn-error' : 'btn-primary'}`}
            disabled={invalid || changeStatus.isPending}
            onClick={save}
          >
            {changeStatus.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {VENDOR_STATUSES.map((s) => (
          <label
            key={s}
            className={`border-base-300 rounded-box flex cursor-pointer items-start gap-3 border p-3 ${status === s ? 'border-primary bg-primary/5' : ''}`}
          >
            <input
              type="radio"
              name="vendor-status"
              className="radio radio-sm mt-0.5"
              checked={status === s}
              onChange={() => setStatus(s)}
            />
            <span>
              <span className="font-medium">
                {VENDOR_STATUS_LABELS[s]}
                {s === vendor.status && (
                  <span className="text-base-content/60 text-xs font-normal"> (saat ini)</span>
                )}
              </span>
              <span className="text-base-content/60 block text-xs">{HINTS[s]}</span>
            </span>
          </label>
        ))}
      </div>
      <FormField
        label={`Alasan${reasonRequired ? '' : ' (opsional)'}`}
        required={reasonRequired}
        className="mt-3"
      >
        <textarea
          className="textarea w-full"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
