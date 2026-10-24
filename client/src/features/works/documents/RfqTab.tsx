import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  PROCUREMENT_METHOD_LABELS,
  rfqInputSchema,
  RFQ_METHODS,
  type RfqDto,
  type RfqInput,
  type RfqPayload,
  type WorkDetailDto,
} from '@sipita/shared';
import { documentsApi } from '@/api/documents.api';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { MoneyFields } from '@/components/ui/MoneyFields';
import { useDocumentMutation } from '@/hooks/useDocuments';
import { toast } from '@/stores/toastStore';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { AddButton, Empty } from './common';
import { formatMoney, useDeleteDialog, useDocumentAccess } from './helpers';

function RfqForm({
  work,
  rfq,
  onClose,
}: {
  work: WorkDetailDto;
  rfq: RfqDto | null;
  onClose: () => void;
}) {
  const save = useDocumentMutation((input: RfqPayload) => documentsApi.saveRfq(work.id, input));
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RfqInput, unknown, RfqPayload>({
    resolver: zodResolver(rfqInputSchema),
    defaultValues: {
      rfqNo: rfq?.rfqNo ?? '',
      method: rfq?.method ?? (work.method === 'TENDER' ? 'TENDER' : 'BIDDING'),
      periodStart: rfq?.periodStart ?? work.periodStart ?? '',
      periodEnd: rfq?.periodEnd ?? work.periodEnd ?? '',
      amount: rfq?.amount ?? work.amount,
      currency: rfq?.currency ?? work.currency,
      exchangeRate: rfq?.exchangeRate ?? work.exchangeRate,
      termOfPayment: rfq?.termOfPayment ?? '',
      loaNo: rfq?.loaNo ?? '',
      loaDate: rfq?.loaDate ?? '',
      loaProcessedBy: rfq?.loaProcessedBy ?? '',
    },
  });

  const onSubmit = handleSubmit((input) =>
    save.mutate(input, {
      onSuccess: () => {
        toast.success(input.loaNo ? 'RFQ & LoA disimpan' : 'RFQ disimpan');
        onClose();
      },
      onError: (err) => applyServerFieldErrors(err, setError),
    }),
  );

  return (
    <Modal open onClose={onClose} title={rfq ? 'Ubah RFQ & LoA' : 'Catat RFQ'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={save.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="No. RFQ" required error={errors.rfqNo?.message}>
            <input className="input w-full" {...register('rfqNo')} autoFocus />
          </FormField>
          <FormField label="Metode" required error={errors.method?.message}>
            <select className="select w-full" {...register('method')}>
              {RFQ_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PROCUREMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Term of Payment" error={errors.termOfPayment?.message}>
            <input className="input w-full" {...register('termOfPayment')} />
          </FormField>
          <FormField label="Periode Mulai" required error={errors.periodStart?.message}>
            <input type="date" className="input w-full" {...register('periodStart')} />
          </FormField>
          <FormField label="Periode Selesai" required error={errors.periodEnd?.message}>
            <input type="date" className="input w-full" {...register('periodEnd')} />
          </FormField>
          <div className="hidden md:block" />
          <MoneyFields control={control} register={register} errors={errors} />
        </div>

        <h4 className="text-base-content/70 mt-4 text-sm font-semibold">
          LoA (diproses tim di luar IT)
        </h4>
        <p className="text-base-content/60 text-xs">
          Diisi setelah MoA Hasil Tender selesai. Mengisi LoA menyelesaikan tahap LoA.
        </p>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="No. LoA" error={errors.loaNo?.message}>
            <input className="input w-full" {...register('loaNo')} />
          </FormField>
          <FormField label="Tanggal LoA" error={errors.loaDate?.message}>
            <input type="date" className="input w-full" {...register('loaDate')} />
          </FormField>
          <FormField label="LoA Diproses Oleh" error={errors.loaProcessedBy?.message}>
            <input
              className="input w-full"
              placeholder="Mis. Procurement"
              {...register('loaProcessedBy')}
            />
          </FormField>
        </div>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium">{children ?? '-'}</dd>
    </div>
  );
}

export function RfqTab({ work, rfq }: { work: WorkDetailDto; rfq: RfqDto | null }) {
  const { canWrite, canDelete } = useDocumentAccess(work);
  const [editing, setEditing] = useState(false);
  const { confirmDelete, dialog } = useDeleteDialog();

  return (
    <div className="p-4">
      {!rfq ? (
        <>
          <Empty>Belum ada RFQ.</Empty>
          {canWrite && (
            <div className="flex justify-center">
              <AddButton label="Catat RFQ" onClick={() => setEditing(true)} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex justify-end gap-1">
            {canWrite && (
              <button
                type="button"
                className="btn btn-xs btn-soft btn-primary"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3" /> {rfq.loaNo ? 'Ubah RFQ & LoA' : 'Ubah / catat LoA'}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="btn btn-xs btn-soft btn-error"
                onClick={() =>
                  confirmDelete(`RFQ ${rfq.rfqNo}`, () => documentsApi.deleteRfq(work.id))
                }
              >
                <Trash2 className="size-3" /> Hapus
              </button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Item label="No. RFQ">
              <span className="font-mono">{rfq.rfqNo}</span>
            </Item>
            <Item label="Metode">{PROCUREMENT_METHOD_LABELS[rfq.method]}</Item>
            <Item label="Periode">
              {formatDate(rfq.periodStart)} – {formatDate(rfq.periodEnd)}
            </Item>
            <Item label="Nilai">{formatMoney(rfq.amount, rfq.currency)}</Item>
            <Item label="Term of Payment">{rfq.termOfPayment}</Item>
            <Item label="Dicatat">{formatDateTime(rfq.recordedAt)}</Item>
            <Item label="No. LoA">
              {rfq.loaNo && <span className="font-mono">{rfq.loaNo}</span>}
            </Item>
            <Item label="Tanggal LoA">
              {rfq.loaDate ? (
                `${formatDate(rfq.loaDate)}${rfq.loaProcessedBy ? ` · ${rfq.loaProcessedBy}` : ''}`
              ) : (
                <span className="text-warning">Belum terbit</span>
              )}
            </Item>
          </dl>
        </>
      )}
      {editing && <RfqForm work={work} rfq={rfq} onClose={() => setEditing(false)} />}
      {dialog}
    </div>
  );
}
