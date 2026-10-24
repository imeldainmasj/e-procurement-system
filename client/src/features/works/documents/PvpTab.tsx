import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  PVP_DECISION_LABELS,
  PVP_DECISIONS,
  PVP_STATUS_LABELS,
  PVP_STATUSES,
  pvpApprovalInputSchema,
  pvpInputSchema,
  type PvpApprovalDto,
  type PvpApprovalInput,
  type PvpApprovalPayload,
  type PvpDto,
  type PvpInput,
  type PvpPayload,
  type WorkDetailDto,
} from '@sipita/shared';
import { documentsApi } from '@/api/documents.api';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDocumentMutation } from '@/hooks/useDocuments';
import { toast } from '@/stores/toastStore';
import { formatDate } from '@/utils/formatDate';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { AddButton, Empty, RowActions } from './common';
import { TABLE_HEAD, useDeleteDialog, useDocumentAccess } from './helpers';

function FormActions({ pending, onClose }: { pending: boolean; onClose: () => void }) {
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

function PvpForm({
  work,
  pvp,
  onClose,
}: {
  work: WorkDetailDto;
  pvp: PvpDto | null;
  onClose: () => void;
}) {
  const save = useDocumentMutation((input: PvpPayload) => documentsApi.savePvp(work.id, input));
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PvpInput, unknown, PvpPayload>({
    resolver: zodResolver(pvpInputSchema),
    defaultValues: {
      pvpDate: pvp?.pvpDate ?? '',
      status: pvp?.status ?? 'PENDING',
      notes: pvp?.notes ?? '',
    },
  });
  return (
    <Modal open onClose={onClose} title={pvp ? 'Ubah PVP Forum' : 'Catat PVP Forum'} size="sm">
      <form
        onSubmit={handleSubmit((input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success('PVP Forum disimpan');
              onClose();
            },
            onError: (err) => applyServerFieldErrors(err, setError),
          }),
        )}
        noValidate
      >
        <FormError error={save.error} />
        <FormField label="Tanggal PVP" required error={errors.pvpDate?.message}>
          <input type="date" className="input w-full" {...register('pvpDate')} autoFocus />
        </FormField>
        <FormField
          label="Status"
          required
          error={errors.status?.message}
          hint={`Disetujui membutuhkan minimal ${pvp?.minApprovals ?? 2} approval direktur yang tercatat`}
        >
          <select className="select w-full" {...register('status')}>
            {PVP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PVP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Catatan" error={errors.notes?.message}>
          <textarea className="textarea w-full" rows={2} {...register('notes')} />
        </FormField>
        <FormActions pending={save.isPending} onClose={onClose} />
      </form>
    </Modal>
  );
}

function ApprovalForm({
  work,
  approval,
  onClose,
}: {
  work: WorkDetailDto;
  approval: PvpApprovalDto | null;
  onClose: () => void;
}) {
  const save = useDocumentMutation((input: PvpApprovalPayload) =>
    documentsApi.saveApproval(work.id, input, approval?.id),
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PvpApprovalInput, unknown, PvpApprovalPayload>({
    resolver: zodResolver(pvpApprovalInputSchema),
    defaultValues: {
      directorName: approval?.directorName ?? '',
      decision: approval?.decision ?? 'APPROVED',
      approvalDate: approval?.approvalDate ?? '',
      notes: approval?.notes ?? '',
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={approval ? 'Ubah Approval Direktur' : 'Catat Approval Direktur'}
      size="sm"
    >
      <form
        onSubmit={handleSubmit((input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success('Approval direktur disimpan');
              onClose();
            },
            onError: (err) => applyServerFieldErrors(err, setError),
          }),
        )}
        noValidate
      >
        <FormError error={save.error} />
        <FormField
          label="Nama Direktur"
          required
          error={errors.directorName?.message}
          hint="Direktur bukan pengguna SIPITA; ditulis sebagai teks"
        >
          <input className="input w-full" {...register('directorName')} autoFocus />
        </FormField>
        <FormField label="Keputusan" required error={errors.decision?.message}>
          <select className="select w-full" {...register('decision')}>
            {PVP_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {PVP_DECISION_LABELS[d]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Tanggal Approval" required error={errors.approvalDate?.message}>
          <input type="date" className="input w-full" {...register('approvalDate')} />
        </FormField>
        <FormField label="Catatan" error={errors.notes?.message}>
          <input className="input w-full" {...register('notes')} />
        </FormField>
        <FormActions pending={save.isPending} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function PvpTab({ work, pvp }: { work: WorkDetailDto; pvp: PvpDto | null }) {
  const { canWrite, canDelete } = useDocumentAccess(work);
  const [editingForum, setEditingForum] = useState(false);
  const [approval, setApproval] = useState<PvpApprovalDto | 'new' | null>(null);
  const { confirmDelete, dialog } = useDeleteDialog();

  return (
    <div className="p-4">
      {!work.pvpRequired && (
        <div role="note" className="alert alert-soft mb-3 text-sm">
          PVP Forum tidak wajib untuk pekerjaan ini (nilai/kenaikan di bawah ambang).
        </div>
      )}
      {!pvp ? (
        <>
          <Empty>Belum ada data PVP Forum.</Empty>
          {canWrite && (
            <div className="flex justify-center">
              <AddButton label="Catat PVP Forum" onClick={() => setEditingForum(true)} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">PVP {formatDate(pvp.pvpDate)}</span>
              <StatusBadge status={pvp.status} kind="pvp" />
              <span
                className={`badge badge-sm badge-soft ${pvp.approvedCount >= pvp.minApprovals ? 'badge-success' : 'badge-warning'}`}
              >
                {pvp.approvedCount} / {pvp.minApprovals} direktur setuju
              </span>
            </div>
            <div className="flex gap-1">
              {canWrite && (
                <>
                  <AddButton label="Approval Direktur" onClick={() => setApproval('new')} />
                  <button
                    type="button"
                    className="btn btn-xs btn-soft btn-primary"
                    onClick={() => setEditingForum(true)}
                  >
                    <Pencil className="size-3" /> Ubah PVP
                  </button>
                </>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="btn btn-xs btn-soft btn-error"
                  onClick={() => confirmDelete('PVP Forum', () => documentsApi.deletePvp(work.id))}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          </div>
          {pvp.notes && <p className="text-base-content/70 mb-2 text-sm">{pvp.notes}</p>}
          {pvp.approvals.length === 0 ? (
            <Empty>Belum ada approval direktur.</Empty>
          ) : (
            <table className="table-sm table">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th>Direktur</th>
                  <th>Keputusan</th>
                  <th>Tanggal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pvp.approvals.map((a) => (
                  <tr key={a.id} className="hover:bg-base-200/40">
                    <td>
                      {a.directorName}
                      {a.notes && <div className="text-base-content/60 text-xs">{a.notes}</div>}
                    </td>
                    <td>
                      <StatusBadge status={a.decision} label={PVP_DECISION_LABELS[a.decision]} />
                    </td>
                    <td>{formatDate(a.approvalDate)}</td>
                    <td>
                      <RowActions
                        label={a.directorName}
                        onEdit={canWrite ? () => setApproval(a) : undefined}
                        onDelete={
                          canDelete
                            ? () =>
                                confirmDelete(`Approval ${a.directorName}`, () =>
                                  documentsApi.deleteApproval(work.id, a.id),
                                )
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {editingForum && <PvpForm work={work} pvp={pvp} onClose={() => setEditingForum(false)} />}
      {approval && (
        <ApprovalForm
          work={work}
          approval={approval === 'new' ? null : approval}
          onClose={() => setApproval(null)}
        />
      )}
      {dialog}
    </div>
  );
}
