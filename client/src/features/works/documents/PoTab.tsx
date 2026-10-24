import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  paymentTermInputSchema,
  poInputSchema,
  PO_TYPE_LABELS,
  PO_TYPES,
  type PaymentTermDto,
  type PaymentTermInput,
  type PaymentTermPayload,
  type PoInput,
  type PoPayload,
  type PurchaseOrderDto,
  type WorkDetailDto,
} from '@sipita/shared';
import { documentsApi } from '@/api/documents.api';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { MoneyFields } from '@/components/ui/MoneyFields';
import { useDocumentMutation } from '@/hooks/useDocuments';
import { toast } from '@/stores/toastStore';
import { formatDate } from '@/utils/formatDate';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { AddButton, Empty, RowActions } from './common';
import { formatMoney, TABLE_HEAD, useDeleteDialog, useDocumentAccess } from './helpers';

function Actions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return (
    <div className="modal-action">
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        Batal
      </button>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending && <span className="loading loading-spinner loading-sm" />}
        Simpan
      </button>
    </div>
  );
}

function PoForm({
  work,
  po,
  onClose,
}: {
  work: WorkDetailDto;
  po: PurchaseOrderDto | null;
  onClose: () => void;
}) {
  const save = useDocumentMutation((input: PoPayload) =>
    documentsApi.savePo(work.id, input, po?.id),
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PoInput, unknown, PoPayload>({
    resolver: zodResolver(poInputSchema),
    defaultValues: {
      poNo: po?.poNo ?? '',
      poType: po?.poType ?? (work.procurementType === 'RENEWAL_LICENSE' ? 'RENEWAL' : 'NEW'),
      poName: po?.poName ?? work.title,
      poDate: po?.poDate ?? '',
      amount: po?.amount ?? work.amount,
      currency: po?.currency ?? work.currency,
      exchangeRate: po?.exchangeRate ?? work.exchangeRate,
      requesterName: po?.requesterName ?? '',
      previousPoNo: po?.previousPoNo ?? '',
      previousPoAmount: po?.previousPoAmount ?? null,
      previousPoCurrency: po?.previousPoCurrency ?? '',
    },
  });

  return (
    <Modal open onClose={onClose} title={po ? `Ubah PO ${po.poNo}` : 'Catat PO'} size="lg">
      <form
        onSubmit={handleSubmit((input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success('PO disimpan');
              onClose();
            },
            onError: (err) => applyServerFieldErrors(err, setError),
          }),
        )}
        noValidate
      >
        <p className="text-base-content/60 mb-2 text-xs">
          PO hanya dapat dicatat setelah MoA sesuai metode dan MoA Biaya selesai.
        </p>
        <FormError error={save.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="No. PO" required error={errors.poNo?.message}>
            <input className="input w-full" {...register('poNo')} autoFocus />
          </FormField>
          <FormField label="Tipe PO" required error={errors.poType?.message}>
            <select className="select w-full" {...register('poType')}>
              {PO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PO_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tanggal PO" required error={errors.poDate?.message}>
            <input type="date" className="input w-full" {...register('poDate')} />
          </FormField>
          <FormField
            label="Nama PO"
            required
            error={errors.poName?.message}
            className="md:col-span-2"
          >
            <input className="input w-full" {...register('poName')} />
          </FormField>
          <FormField label="Requestor PO" error={errors.requesterName?.message}>
            <input className="input w-full" {...register('requesterName')} />
          </FormField>
          <MoneyFields control={control} register={register} errors={errors} label="Nilai PO" />
          <FormField label="No. PO Sebelumnya" error={errors.previousPoNo?.message}>
            <input className="input w-full" {...register('previousPoNo')} />
          </FormField>
          <FormField label="Nilai PO Sebelumnya" error={errors.previousPoAmount?.message}>
            <Controller
              control={control}
              name="previousPoAmount"
              render={({ field }) => (
                <CurrencyInput value={field.value as number | null} onChange={field.onChange} />
              )}
            />
          </FormField>
          <FormField label="Mata Uang PO Sebelumnya" error={errors.previousPoCurrency?.message}>
            <input
              className="input w-full uppercase"
              placeholder="IDR"
              {...register('previousPoCurrency')}
            />
          </FormField>
        </div>
        <Actions pending={save.isPending} onClose={onClose} />
      </form>
    </Modal>
  );
}

function TermForm({
  work,
  po,
  term,
  onClose,
}: {
  work: WorkDetailDto;
  po: PurchaseOrderDto;
  term: PaymentTermDto | null;
  onClose: () => void;
}) {
  const save = useDocumentMutation((input: PaymentTermPayload) =>
    documentsApi.saveTerm(work.id, po.id, input, term?.id),
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PaymentTermInput, unknown, PaymentTermPayload>({
    resolver: zodResolver(paymentTermInputSchema),
    defaultValues: {
      sequence: term?.sequence ?? po.paymentTerms.length + 1,
      description: term?.description ?? '',
      percentage: term?.percentage ?? null,
      amount: term?.amount ?? null,
      dueDate: term?.dueDate ?? '',
      isPaid: term?.isPaid ?? false,
    },
  });
  return (
    <Modal open onClose={onClose} title={term ? 'Ubah Termin' : 'Tambah Termin Pembayaran'}>
      <form
        onSubmit={handleSubmit((input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success('Termin disimpan');
              onClose();
            },
            onError: (err) => applyServerFieldErrors(err, setError),
          }),
        )}
        noValidate
      >
        <FormError error={save.error} />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Urutan" required error={errors.sequence?.message}>
            <input type="number" min={1} className="input w-full" {...register('sequence')} />
          </FormField>
          <FormField label="Jatuh Tempo" error={errors.dueDate?.message}>
            <input type="date" className="input w-full" {...register('dueDate')} />
          </FormField>
          <FormField
            label="Deskripsi"
            required
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <input className="input w-full" {...register('description')} autoFocus />
          </FormField>
          <FormField
            label="Persentase (%)"
            error={errors.percentage?.message}
            hint="Kosongkan bila nilai diisi langsung"
          >
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              className="input w-full"
              {...register('percentage')}
            />
          </FormField>
          <FormField
            label={`Nilai (${po.currency})`}
            error={errors.amount?.message}
            hint="Kosong = persentase × nilai PO"
          >
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <CurrencyInput
                  currency={po.currency}
                  value={field.value as number | null}
                  onChange={field.onChange}
                />
              )}
            />
          </FormField>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-success toggle-sm"
            {...register('isPaid')}
          />
          <span className="text-sm">Sudah dibayar</span>
        </label>
        <Actions pending={save.isPending} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function PoTab({
  work,
  purchaseOrders,
}: {
  work: WorkDetailDto;
  purchaseOrders: PurchaseOrderDto[];
}) {
  const { canWrite, canDelete } = useDocumentAccess(work);
  const [editing, setEditing] = useState<PurchaseOrderDto | 'new' | null>(null);
  const [term, setTerm] = useState<{ po: PurchaseOrderDto; term: PaymentTermDto | null } | null>(
    null,
  );
  const { confirmDelete, dialog } = useDeleteDialog();

  return (
    <div className="space-y-4 p-4">
      {canWrite && (
        <div className="flex justify-end">
          <AddButton label="Catat PO" onClick={() => setEditing('new')} />
        </div>
      )}
      {purchaseOrders.length === 0 && <Empty>Belum ada PO.</Empty>}
      {purchaseOrders.map((po) => {
        const paid = po.paymentTerms.filter((t) => t.isPaid).reduce((sum, t) => sum + t.amount, 0);
        return (
          <div key={po.id} className="border-base-300 rounded border">
            <div className="bg-base-200/60 flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <span className="font-mono font-medium">{po.poNo}</span>
                <span className="badge badge-sm badge-soft badge-primary ms-2">
                  {PO_TYPE_LABELS[po.poType]}
                </span>
                <div className="text-base-content/70 text-sm">
                  {po.poName} · {formatDate(po.poDate)} · {formatMoney(po.amount, po.currency)}
                  {po.previousPoNo && ` · PO sebelumnya ${po.previousPoNo}`}
                </div>
                {po.agreement && (
                  <div className="text-xs">Agreement: {po.agreement.agreementNo}</div>
                )}
              </div>
              <RowActions
                label={po.poNo}
                onEdit={canWrite ? () => setEditing(po) : undefined}
                onDelete={
                  canDelete
                    ? () =>
                        confirmDelete(`PO ${po.poNo}`, () => documentsApi.deletePo(work.id, po.id))
                    : undefined
                }
              />
            </div>
            <table className="table-sm table">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th>Termin</th>
                  <th>Deskripsi</th>
                  <th className="text-right">Nilai</th>
                  <th>Jatuh Tempo</th>
                  <th>Status</th>
                  <th className="text-right">
                    {canWrite && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => setTerm({ po, term: null })}
                        aria-label="Tambah termin"
                      >
                        <Plus className="size-3" /> Termin
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {po.paymentTerms.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-base-content/60 text-center text-sm">
                      Belum ada term of payment.
                    </td>
                  </tr>
                )}
                {po.paymentTerms.map((t) => (
                  <tr key={t.id} className="hover:bg-base-200/40">
                    <td>{t.sequence}</td>
                    <td>
                      {t.description}
                      {t.percentage !== null && (
                        <span className="text-base-content/60"> ({t.percentage}%)</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {formatMoney(t.amount, po.currency)}
                    </td>
                    <td>{formatDate(t.dueDate)}</td>
                    <td>
                      <span
                        className={`badge badge-sm badge-soft ${t.isPaid ? 'badge-success' : 'badge-warning'}`}
                      >
                        {t.isPaid ? 'Dibayar' : 'Belum'}
                      </span>
                    </td>
                    <td>
                      <RowActions
                        label={`termin ${t.sequence}`}
                        onEdit={canWrite ? () => setTerm({ po, term: t }) : undefined}
                        onDelete={
                          canDelete
                            ? () =>
                                confirmDelete(`Termin ${t.sequence} PO ${po.poNo}`, () =>
                                  documentsApi.deleteTerm(work.id, po.id, t.id),
                                )
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              {po.paymentTerms.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={6} className="text-base-content/70 text-right text-xs">
                      Terbayar {formatMoney(paid, po.currency)} dari{' '}
                      {formatMoney(po.amount, po.currency)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        );
      })}
      {editing && (
        <PoForm
          work={work}
          po={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {term && <TermForm work={work} po={term.po} term={term.term} onClose={() => setTerm(null)} />}
      {dialog}
    </div>
  );
}
