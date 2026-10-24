import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  MEMO_TYPE_LABELS,
  memoInputSchema,
  memoTypesFor,
  type MemoDto,
  type MemoInput,
  type MemoPayload,
  type WorkDetailDto,
} from '@sipita/shared';
import { documentsApi } from '@/api/documents.api';
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

function MemoForm({
  work,
  memo,
  onClose,
}: {
  work: WorkDetailDto;
  memo: MemoDto | null;
  onClose: () => void;
}) {
  const types = memoTypesFor(work.method);
  const save = useDocumentMutation((input: MemoPayload) =>
    documentsApi.saveMemo(work.id, input, memo?.id),
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MemoInput, unknown, MemoPayload>({
    resolver: zodResolver(memoInputSchema),
    defaultValues: {
      memoNo: memo?.memoNo ?? '',
      memoType: memo?.memoType ?? types[0],
      title: memo?.title ?? '',
      memoDate: memo?.memoDate ?? '',
      requesterName: memo?.requesterName ?? '',
      amount: memo?.amount ?? null,
      currency: memo?.currency ?? work.currency,
      exchangeRate: memo?.exchangeRate ?? work.exchangeRate,
      notes: memo?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit((input) =>
    save.mutate(input, {
      onSuccess: () => {
        toast.success(memo ? 'Memo diperbarui' : 'Memo dicatat');
        onClose();
      },
      onError: (err) => applyServerFieldErrors(err, setError),
    }),
  );

  return (
    <Modal open onClose={onClose} title={memo ? 'Ubah Memo / MoA' : 'Catat Memo / MoA'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={save.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="Jenis Memo" required error={errors.memoType?.message}>
            <select className="select w-full" {...register('memoType')}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {MEMO_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="No. Memo" required error={errors.memoNo?.message}>
            <input className="input w-full" {...register('memoNo')} autoFocus />
          </FormField>
          <FormField label="Tanggal Memo" required error={errors.memoDate?.message}>
            <input type="date" className="input w-full" {...register('memoDate')} />
          </FormField>
          <FormField
            label="Judul Memo"
            required
            error={errors.title?.message}
            className="md:col-span-2"
          >
            <input className="input w-full" {...register('title')} />
          </FormField>
          <FormField label="Requestor Memo" error={errors.requesterName?.message}>
            <input className="input w-full" {...register('requesterName')} />
          </FormField>
          <MoneyFields control={control} register={register} errors={errors} required={false} />
          <FormField label="Catatan" error={errors.notes?.message} className="md:col-span-3">
            <textarea className="textarea w-full" rows={2} {...register('notes')} />
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

export function MemoTab({ work, memos }: { work: WorkDetailDto; memos: MemoDto[] }) {
  const { canWrite, canDelete } = useDocumentAccess(work);
  const [editing, setEditing] = useState<MemoDto | 'new' | null>(null);
  const { confirmDelete, dialog } = useDeleteDialog();

  return (
    <div>
      {canWrite && (
        <div className="flex justify-end p-3">
          <AddButton label="Catat Memo / MoA" onClick={() => setEditing('new')} />
        </div>
      )}
      {memos.length === 0 ? (
        <Empty>Belum ada memo atau MoA.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead className={TABLE_HEAD}>
              <tr>
                <th>Jenis</th>
                <th>No. & Judul</th>
                <th>Tanggal</th>
                <th className="text-right">Nilai</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {memos.map((m) => (
                <tr key={m.id} className="hover:bg-base-200/40">
                  <td>
                    <span className="badge badge-sm badge-soft badge-primary whitespace-nowrap">
                      {MEMO_TYPE_LABELS[m.memoType]}
                    </span>
                  </td>
                  <td>
                    <div className="font-mono text-xs">{m.memoNo}</div>
                    <div>{m.title}</div>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(m.memoDate)}</td>
                  <td className="text-right whitespace-nowrap">
                    {formatMoney(m.amount, m.currency)}
                  </td>
                  <td>
                    <RowActions
                      label={m.memoNo}
                      onEdit={canWrite ? () => setEditing(m) : undefined}
                      onDelete={
                        canDelete
                          ? () =>
                              confirmDelete(`Memo ${m.memoNo}`, () =>
                                documentsApi.deleteMemo(work.id, m.id),
                              )
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <MemoForm
          work={work}
          memo={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {dialog}
    </div>
  );
}
