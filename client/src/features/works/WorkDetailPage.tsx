import {
  ArrowLeft,
  ArrowRight,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Trash2,
  UserRoundCog,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MILESTONE_STATUS_LABELS,
  PK_RESULT_LABELS,
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  type WorkDetailDto,
  type WorkMilestoneDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataIssueBadge } from '@/components/ui/DataIssueBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { MilestoneTrack } from '@/components/ui/MilestoneTrack';
import { Modal } from '@/components/ui/Modal';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useUserOptions } from '@/hooks/useMasterData';
import { useSettings } from '@/hooks/useSettings';
import { useWork, useWorkMutations, useWorkUpdates } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';
import { downloadAttachment } from '@/utils/attachments';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { CurrentStages } from './WorkListPage';
import { MilestoneEditModal } from './components/MilestoneEditModal';
import { UpdateProgressModal } from './components/UpdateProgressModal';
import { WorkFormModal } from './components/WorkFormModal';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium break-words">{children ?? '-'}</dd>
    </div>
  );
}

function Summary({ work }: { work: WorkDetailDto }) {
  return (
    <SectionCard title="Ringkasan">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Jenis">{PROCUREMENT_TYPE_LABELS[work.procurementType]}</Field>
        <Field label="Kategori">{PROJECT_CATEGORY_LABELS[work.category]}</Field>
        <Field label="Metode">{PROCUREMENT_METHOD_LABELS[work.method]}</Field>
        <Field label="Tahun Pengadaan">{work.procurementYear}</Field>
        <Field label="Nilai">
          {work.currency === 'IDR' ? (
            formatCurrency(work.amountIdr)
          ) : (
            <>
              {work.currency} {work.amount.toLocaleString('id-ID')}
              <div className="text-base-content/60 text-xs font-normal">
                {formatCurrency(work.amountIdr)} (kurs {work.exchangeRate.toLocaleString('id-ID')})
              </div>
            </>
          )}
        </Field>
        <Field label="Tahun Sebelumnya">
          {work.previousPurchaseAmount === null ? (
            'Pengadaan baru'
          ) : (
            <>
              {formatCurrency(work.previousPurchaseAmount)}
              {work.increasePercent !== null && (
                <div
                  className={`text-xs ${work.increasePercent > 0 ? 'text-error' : 'text-success'}`}
                >
                  {work.increasePercent > 0 ? '+' : ''}
                  {work.increasePercent.toLocaleString('id-ID')}%
                </div>
              )}
            </>
          )}
        </Field>
        <Field label="PVP Forum">{work.pvpRequired ? 'Wajib' : 'Tidak wajib'}</Field>
        <Field label="Periode">
          {work.periodStart || work.periodEnd
            ? `${formatDate(work.periodStart)} – ${formatDate(work.periodEnd)}`
            : null}
        </Field>
        <Field label="PIC">{work.pic.name}</Field>
        <Field label="Vendor">
          {work.vendor && (
            <Link to={`/vendor/${work.vendor.id}`} className="link link-hover">
              {work.vendor.name}
            </Link>
          )}
        </Field>
        <Field label="Direktorat Peminta">{work.requesterDirectorate?.name}</Field>
        <Field label="Update Terakhir">{formatDateTime(work.lastUpdatedAt)}</Field>
        {work.method === 'SPECIAL_EXTENSION' && (
          <>
            <Field label="Kontrak Sumber">
              {work.sourceAgreement &&
                `${work.sourceAgreement.agreementNo} (s.d. ${formatDate(work.sourceAgreement.periodEnd)})`}
            </Field>
            <Field label="Hasil PK">{work.pkResult && PK_RESULT_LABELS[work.pkResult]}</Field>
          </>
        )}
      </dl>
      {work.notes && (
        <p className="text-base-content/80 mt-3 text-sm whitespace-pre-line">{work.notes}</p>
      )}
    </SectionCard>
  );
}

function ProgressLog({ work }: { work: WorkDetailDto }) {
  const [page, setPage] = useState(1);
  const updates = useWorkUpdates(work.id, page);
  const [adding, setAdding] = useState(false);
  const totalPages = Math.max(1, Math.ceil((updates.data?.meta.total ?? 0) / 20));

  return (
    <SectionCard
      title="Log Update"
      description="Catatan progres tidak dapat diubah; koreksi ditulis sebagai catatan baru."
      actions={
        work.access.canEdit && (
          <button
            type="button"
            className="btn btn-xs btn-soft btn-primary"
            onClick={() => setAdding(true)}
          >
            <MessageSquarePlus className="size-3" /> Update progres
          </button>
        )
      }
    >
      {updates.isPending ? (
        <div className="skeleton h-32 w-full" />
      ) : updates.data?.data.length === 0 ? (
        <EmptyState title="Belum ada catatan progres" />
      ) : (
        <ul className="timeline timeline-vertical timeline-compact timeline-snap-icon">
          {updates.data?.data.map((u, i, all) => (
            <li key={u.id}>
              {i > 0 && <hr className="bg-base-300" />}
              <div className="timeline-middle">
                <span className="bg-primary block size-2 rounded-full" />
              </div>
              <div className="timeline-end mb-4 w-full">
                <div className="text-base-content/60 text-xs">
                  {formatDateTime(u.createdAt)} · {u.author.name}
                  {u.milestone && ` · ${u.milestone.label}`}
                </div>
                {u.statusFrom && u.statusTo && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs">
                    <StatusBadge status={u.statusFrom} kind="milestone" />
                    <ArrowRight className="size-3" />
                    <StatusBadge status={u.statusTo} kind="milestone" />
                  </div>
                )}
                <p className="text-sm whitespace-pre-line">{u.note}</p>
                {u.attachment && (
                  <button
                    type="button"
                    className="link link-primary flex items-center gap-1 text-xs"
                    onClick={() =>
                      downloadAttachment(u.attachment!.id, u.attachment!.fileName).catch((err) =>
                        toast.error(getErrorMessage(err)),
                      )
                    }
                  >
                    <Paperclip className="size-3" /> {u.attachment.fileName}
                  </button>
                )}
              </div>
              {i < all.length - 1 && <hr className="bg-base-300" />}
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <div className="join mt-2">
          <button
            type="button"
            className="join-item btn btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </button>
          <span className="join-item btn btn-sm btn-disabled">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="join-item btn btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
      {adding && (
        <UpdateProgressModal
          workId={work.id}
          workTitle={work.title}
          milestones={work.milestones}
          onClose={() => setAdding(false)}
        />
      )}
    </SectionCard>
  );
}

function ReassignModal({ work, onClose }: { work: WorkDetailDto; onClose: () => void }) {
  const users = useUserOptions();
  const { reassign } = useWorkMutations();
  const [picId, setPicId] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open onClose={onClose} title="Ganti PIC" size="sm">
      <p className="text-base-content/70 text-sm">
        PIC saat ini: <b>{work.pic.name}</b>
      </p>
      <FormField label="PIC baru" required>
        <select className="select w-full" value={picId} onChange={(e) => setPicId(e.target.value)}>
          <option value="">— Pilih —</option>
          {users.data
            ?.filter((u) => u.id !== work.pic.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </FormField>
      <FormField label="Alasan" hint="Opsional, dicatat di log update">
        <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
      <div className="modal-action">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Batal
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!picId || reassign.isPending}
          onClick={() =>
            reassign.mutate(
              { id: work.id, input: { picId, note } },
              {
                onSuccess: () => {
                  toast.success('PIC diganti');
                  onClose();
                },
                onError: (err) => toast.error(getErrorMessage(err)),
              },
            )
          }
        >
          Simpan
        </button>
      </div>
    </Modal>
  );
}

export function WorkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workQuery = useWork(id);
  const settings = useSettings();
  const { remove } = useWorkMutations();
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'reassign' | null>(null);
  const [editing, setEditing] = useState<WorkMilestoneDto | null>(null);

  if (workQuery.isPending) return <div className="skeleton h-96 w-full" />;
  if (workQuery.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(workQuery.error)}</span>
        <Link to="/pekerjaan" className="btn btn-sm">
          Kembali
        </Link>
      </div>
    );
  }
  const work = workQuery.data;
  const done = work.milestones.filter((m) => m.status === 'DONE').length;
  const applicable = work.milestones.filter((m) => m.status !== 'NOT_APPLICABLE').length;
  const closed = work.status === 'COMPLETED' || work.status === 'CANCELLED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/pekerjaan"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Semua pekerjaan
          </Link>
          <h1 className="text-lg font-semibold">{work.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{work.code}</span>
            <StatusBadge status={work.status} kind="work" />
            <CurrentStages work={work} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {work.access.canEdit && (
            <button
              type="button"
              className="btn btn-soft btn-primary btn-sm"
              onClick={() => setDialog('edit')}
            >
              <Pencil className="size-4" /> Ubah
            </button>
          )}
          {work.access.canReassign && (
            <button
              type="button"
              className="btn btn-soft btn-primary btn-sm"
              onClick={() => setDialog('reassign')}
            >
              <UserRoundCog className="size-4" /> Ganti PIC
            </button>
          )}
          {work.access.canDelete && (
            <Can feature="WORK" action="delete">
              <button
                type="button"
                className="btn btn-soft btn-error btn-sm"
                onClick={() => setDialog('delete')}
              >
                <Trash2 className="size-4" /> Hapus
              </button>
            </Can>
          )}
        </div>
      </div>

      <DataIssueBadge
        issues={work.issues}
        stale={work.isStale}
        staleDays={settings.data?.STALE_WORK_DAYS}
        expanded
      />

      <SectionCard
        title="Milestone"
        description={
          work.access.canEdit && !closed
            ? 'Klik tahap untuk mengubah status. Tahap yang terkunci menunggu prasyaratnya.'
            : undefined
        }
        actions={
          <span className="badge badge-soft badge-primary">
            {done} / {applicable} {MILESTONE_STATUS_LABELS.DONE.toLowerCase()}
          </span>
        }
      >
        <MilestoneTrack
          method={work.method}
          milestones={work.milestones}
          onSelect={work.access.canEdit && !closed ? setEditing : undefined}
        />
      </SectionCard>

      <Summary work={work} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProgressLog work={work} />
        </div>
        <SectionCard title="Dokumen">
          <EmptyState
            title="Dokumen pengadaan"
            description="Memo & MoA, RFQ & LoA, PVP, PO & TOP, Agreement/Addendum tersedia pada tahap berikutnya."
          />
        </SectionCard>
      </div>

      {dialog === 'edit' && <WorkFormModal work={work} onClose={() => setDialog(null)} />}
      {dialog === 'reassign' && <ReassignModal work={work} onClose={() => setDialog(null)} />}
      {editing && (
        <MilestoneEditModal
          workId={work.id}
          method={work.method}
          milestone={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        loading={remove.isPending}
        variant="error"
        title="Hapus Pekerjaan"
        confirmLabel="Hapus"
        message={
          <>
            Hapus pekerjaan <b>{work.code}</b>? Data dan riwayatnya tetap tersimpan di audit log,
            tetapi tidak tampil lagi di daftar dan report.
          </>
        }
        onConfirm={() =>
          remove.mutate(work.id, {
            onSuccess: () => {
              toast.success('Pekerjaan dihapus');
              navigate('/pekerjaan');
            },
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDialog(null),
          })
        }
      />
    </div>
  );
}
