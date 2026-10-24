import { FileText, Lock } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import {
  EXECUTOR_LABELS,
  milestoneLabel,
  MILESTONE_STATUS_LABELS,
  type MilestoneUpdateInput,
  type ProcurementMethod,
  type WorkMilestoneDto,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useWorkMutations } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';

interface Props {
  workId: string;
  method: ProcurementMethod;
  milestone: WorkMilestoneDto;
  onClose: () => void;
  /** Set for document-backed milestones: they are completed by recording the document. */
  onOpenDocuments?: () => void;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

/** Status, dates and reference of one milestone; the server enforces the §5.5 rules. */
export function MilestoneEditModal({
  workId,
  method,
  milestone: m,
  onClose,
  onOpenDocuments,
}: Props) {
  const { updateMilestone } = useWorkMutations();
  const locked = m.missingPrerequisites.length > 0 && m.status !== 'DONE';
  const official = m.type === 'OFFICIAL_APPROVAL';
  const byDocument = Boolean(onOpenDocuments);
  // Document-backed milestones: DONE only through the document (§5.5 rule 8).
  const statuses = byDocument
    ? m.status === 'DONE'
      ? (['DONE'] as const)
      : (['NOT_STARTED', 'IN_PROGRESS'] as const)
    : (['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const);

  const { register, handleSubmit, control } = useForm<MilestoneUpdateInput>({
    defaultValues: {
      status: m.status,
      startedAt: m.startedAt ?? '',
      completedAt: m.completedAt ?? '',
      referenceNo: m.referenceNo ?? '',
      notes: m.notes ?? '',
      note: '',
    },
  });
  const status = useWatch({ control, name: 'status' });

  const onSubmit = handleSubmit((input) =>
    updateMilestone.mutate(
      {
        id: workId,
        milestoneId: m.id,
        input: {
          ...input,
          completedAt: input.status === 'DONE' ? input.completedAt || today() : null,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${m.label} diperbarui`);
          onClose();
        },
      },
    ),
  );

  return (
    <Modal open onClose={onClose} title={m.label}>
      <form onSubmit={onSubmit} noValidate>
        <p className="text-base-content/70 mb-3 text-sm">
          Pelaksana: <b>{EXECUTOR_LABELS[m.executor]}</b>
          {m.executor !== 'IT' && ' — dicatat oleh staff IT berdasarkan hasil di luar sistem.'}
        </p>
        {locked && (
          <div role="alert" className="alert alert-soft mb-3 text-sm">
            <Lock className="size-4" />
            <span>
              Menunggu {m.missingPrerequisites.map((t) => milestoneLabel(t, method)).join(', ')}{' '}
              selesai sebelum tahap ini dapat dimulai.
            </span>
          </div>
        )}
        {byDocument && (
          <div role="note" className="alert alert-info alert-soft mb-3 text-sm">
            <FileText className="size-4" />
            <span>
              {m.status === 'DONE'
                ? 'Tahap ini selesai dari dokumennya. Ubah atau hapus dokumen untuk mengoreksinya.'
                : 'Tahap ini selesai otomatis saat dokumennya dicatat.'}
            </span>
            <button
              type="button"
              className="btn btn-xs btn-soft btn-primary"
              onClick={onOpenDocuments}
            >
              Buka dokumen
            </button>
          </div>
        )}
        <FormError error={updateMilestone.error} />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Status" required>
            <select className="select w-full" {...register('status')}>
              {statuses.map((s) => (
                <option key={s} value={s} disabled={locked && s !== 'NOT_STARTED'}>
                  {MILESTONE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={official ? 'No. Referensi / Disposisi' : 'No. Referensi'}>
            <input className="input w-full" {...register('referenceNo')} />
          </FormField>
          {status !== 'NOT_STARTED' && (
            <FormField label="Tanggal Mulai">
              <input type="date" className="input w-full" {...register('startedAt')} />
            </FormField>
          )}
          {status === 'DONE' && !byDocument && (
            <FormField label="Tanggal Selesai" hint="Kosong = hari ini">
              <input type="date" className="input w-full" {...register('completedAt')} />
            </FormField>
          )}
        </div>
        <FormField
          label={official ? 'Nama & jabatan pejabat' : 'Keterangan milestone'}
          hint={official ? 'Mis. Hartono Wibisono — VP Procurement' : undefined}
        >
          <textarea className="textarea w-full" rows={2} {...register('notes')} />
        </FormField>
        <FormField label="Catatan progres" hint="Masuk ke log update; kosong = catatan otomatis">
          <textarea className="textarea w-full" rows={2} {...register('note')} />
        </FormField>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={updateMilestone.isPending}>
            {updateMilestone.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
