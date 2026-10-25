import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ArrowLeft, Save, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IMPORT_PHASE_LABELS, type ImportBatchDto, type ImportConflictDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { importsApi } from '@/api/imports.api';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useImportBatch, useImportIssues, useImportMutation } from '@/hooks/useImports';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/formatDate';
import { BatchStatus } from './ImportPage';

const TABLE_LABELS: Record<string, string> = {
  Vendor: 'Vendor',
  Work: 'Pekerjaan',
  Memo: 'Memo & MoA',
  Rfq: 'RFQ',
  PvpForum: 'PVP',
  PvpApproval: 'Approval direktur',
  WorkMilestone: 'Approval pejabat',
  PurchaseOrder: 'PO',
  PoPaymentTerm: 'Termin PO',
  Agreement: 'Agreement',
  Addendum: 'Addendum',
};

function Summary({ batch }: { batch: ImportBatchDto }) {
  const cells: [string, number, string][] = [
    ['Total baris', batch.totalRows, ''],
    ['Valid', batch.validRows, 'text-success'],
    ['Peringatan (tetap masuk)', batch.warningRows, 'text-warning'],
    ['Error (ditolak)', batch.errorRows, 'text-error'],
  ];
  return (
    <div className="card">
      <div className="divide-base-300 bg-base-200/60 grid grid-cols-2 divide-x divide-dashed text-center md:grid-cols-4">
        {cells.map(([label, value, tone]) => (
          <div key={label} className="p-4">
            <div className={cn('text-2xl font-semibold', tone)}>
              {value.toLocaleString('id-ID')}
            </div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Issues({ batch }: { batch: ImportBatchDto }) {
  const [filter, setFilter] = useState<{ level?: string; sheet?: string; page: number }>({
    page: 1,
  });
  const params = { ...filter, limit: 100 };
  const issues = useImportIssues(batch.id, params, !batch.phase);
  const sheets = [...new Set(batch.issueCounts.map((c) => c.sheet))];
  const count = (level: string) =>
    batch.issueCounts.filter((c) => c.level === level).reduce((sum, c) => sum + c.count, 0);
  const totalPages = Math.max(1, Math.ceil((issues.data?.meta.total ?? 0) / 100));

  return (
    <SectionCard
      title="Catatan Validasi"
      flush
      actions={
        <div className="flex flex-wrap gap-1">
          {(
            [
              [undefined, 'Semua'],
              ['ERROR', `Error (${count('ERROR')})`],
              ['WARNING', `Peringatan (${count('WARNING')})`],
            ] as const
          ).map(([level, label]) => (
            <button
              key={label}
              type="button"
              className={cn(
                'btn btn-xs',
                filter.level === level ? 'btn-secondary' : 'btn-soft btn-secondary',
              )}
              onClick={() => setFilter((f) => ({ ...f, level, page: 1 }))}
            >
              {label}
            </button>
          ))}
          <select
            className="select select-xs w-auto"
            value={filter.sheet ?? ''}
            onChange={(e) =>
              setFilter((f) => ({ ...f, sheet: e.target.value || undefined, page: 1 }))
            }
            aria-label="Filter sheet"
          >
            <option value="">Semua sheet</option>
            {sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {issues.isPending ? (
        <div className="skeleton m-4 h-32" />
      ) : issues.data?.data.length === 0 ? (
        <EmptyState title="Tidak ada catatan" description="Semua baris valid." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
              <tr>
                <th>Level</th>
                <th>Sheet</th>
                <th>Baris</th>
                <th>Kolom</th>
                <th>Pesan</th>
              </tr>
            </thead>
            <tbody>
              {issues.data?.data.map((i) => (
                <tr key={i.id} className="hover:bg-base-200/40">
                  <td>
                    <span
                      className={cn(
                        'badge badge-sm badge-soft',
                        i.level === 'ERROR' ? 'badge-error' : 'badge-warning',
                      )}
                    >
                      {i.level === 'ERROR' ? 'Error' : 'Peringatan'}
                    </span>
                  </td>
                  <td>{i.sheet}</td>
                  <td>{i.rowNumber > 0 ? i.rowNumber : '-'}</td>
                  <td>{i.field ?? '-'}</td>
                  <td>{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="join m-3">
          <button
            type="button"
            className="join-item btn btn-sm"
            disabled={filter.page <= 1}
            onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}
          >
            ‹
          </button>
          <span className="join-item btn btn-sm btn-disabled">
            {filter.page} / {totalPages}
          </span>
          <button
            type="button"
            className="join-item btn btn-sm"
            disabled={filter.page >= totalPages}
            onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}
          >
            ›
          </button>
        </div>
      )}
    </SectionCard>
  );
}

export function ImportBatchPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useImportBatch(batchId);
  const [dialog, setDialog] = useState<'commit' | 'cancel' | 'rollback' | null>(null);
  const [conflicts, setConflicts] = useState<ImportConflictDto[] | null>(null);
  const commit = useImportMutation((id: string) => importsApi.commit(id));
  const rollback = useImportMutation((id: string) => importsApi.rollback(id));
  const cancel = useImportMutation((id: string) => importsApi.cancel(id));

  // When a background commit/rollback finishes, the data on other pages has changed.
  const phase = query.data?.phase ?? null;
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current && !phase) {
      for (const key of ['works', 'agreements', 'vendors']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
    previousPhase.current = phase;
  }, [phase, queryClient]);

  if (query.isPending) return <div className="skeleton h-96 w-full" />;
  if (query.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(query.error)}</span>
        <Link to="/import" className="btn btn-sm">
          Kembali
        </Link>
      </div>
    );
  }
  const batch = query.data;
  const idle = !batch.phase;
  const saveable = batch.totalRows - batch.errorRows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/import"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Riwayat import
          </Link>
          <h1 className="text-lg font-semibold">{batch.fileName}</h1>
          <div className="text-base-content/60 mt-1 flex flex-wrap items-center gap-2 text-sm">
            <BatchStatus batch={batch} />
            <span>
              {batch.uploadedBy.name} · {formatDateTime(batch.uploadedAt)}
            </span>
            {batch.committedAt && <span>· disimpan {formatDateTime(batch.committedAt)}</span>}
            {batch.rolledBackAt && <span>· di-rollback {formatDateTime(batch.rolledBackAt)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.status === 'PREVIEW' && idle && (
            <Can feature="IMPORT" action="create">
              <button
                type="button"
                className="btn btn-soft btn-error btn-sm"
                onClick={() => setDialog('cancel')}
              >
                <Trash2 className="size-4" /> Batalkan
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saveable === 0}
                onClick={() => setDialog('commit')}
              >
                <Save className="size-4" /> Simpan {saveable.toLocaleString('id-ID')} baris valid
              </button>
            </Can>
          )}
          {batch.status === 'COMMITTED' && idle && (
            <Can admin>
              <button
                type="button"
                className="btn btn-soft btn-warning btn-sm"
                onClick={() => setDialog('rollback')}
              >
                <Undo2 className="size-4" /> Rollback
              </button>
            </Can>
          )}
        </div>
      </div>

      {batch.phase && (
        <div className="card p-4">
          <div className="mb-2 text-sm font-medium">
            {IMPORT_PHASE_LABELS[batch.phase]}… {batch.progress ?? 0}%
          </div>
          <progress
            className="progress progress-primary w-full"
            value={batch.progress ?? 0}
            max={100}
          />
          <p className="text-base-content/60 mt-1 text-xs">
            Halaman ini diperbarui otomatis; Anda boleh meninggalkannya.
          </p>
        </div>
      )}
      {batch.errorMessage && (
        <div role="alert" className="alert alert-error alert-soft">
          <span>{batch.errorMessage}</span>
        </div>
      )}
      {conflicts && (
        <div role="alert" className="alert alert-warning alert-soft items-start">
          <div>
            <p className="font-medium">
              Rollback ditolak: data dari batch ini sudah diubah setelah import.
            </p>
            <ul className="mt-1 list-disc ps-5 text-sm">
              {conflicts.slice(0, 20).map((c) => (
                <li key={`${c.entityId}-${c.changedAt}`}>
                  {c.entity} diubah {c.changedBy ? `oleh ${c.changedBy} ` : ''}pada{' '}
                  {formatDateTime(c.changedAt)}
                </li>
              ))}
              {conflicts.length > 20 && <li>… dan {conflicts.length - 20} perubahan lain</li>}
            </ul>
          </div>
        </div>
      )}

      {batch.status !== 'FAILED' && <Summary batch={batch} />}

      {batch.summary && (
        <SectionCard title="Hasil Penyimpanan">
          <div className="flex flex-wrap gap-2">
            {Object.entries(batch.summary).map(([table, s]) => (
              <span key={table} className="badge badge-soft badge-primary">
                {TABLE_LABELS[table] ?? table}: {s.created} baru · {s.updated} diperbarui
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {batch.status !== 'FAILED' && <Issues batch={batch} />}

      <ConfirmModal
        open={dialog === 'commit'}
        onClose={() => setDialog(null)}
        loading={commit.isPending}
        title="Simpan Data Import"
        confirmLabel="Simpan"
        message={
          <>
            Simpan <b>{saveable.toLocaleString('id-ID')}</b> baris valid (termasuk{' '}
            {batch.warningRows} baris dengan peringatan)?{' '}
            {batch.errorRows > 0 && `${batch.errorRows} baris error tidak disimpan. `}File
            divalidasi ulang sebelum disimpan.
          </>
        }
        onConfirm={() =>
          commit.mutate(batch.id, {
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDialog(null),
          })
        }
      />
      <ConfirmModal
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        loading={cancel.isPending}
        variant="error"
        title="Batalkan Import"
        confirmLabel="Batalkan"
        message="Buang pratinjau ini? Tidak ada data yang tersimpan."
        onConfirm={() =>
          cancel.mutate(batch.id, {
            onSuccess: () => {
              toast.success('Import dibatalkan');
              navigate('/import');
            },
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDialog(null),
          })
        }
      />
      <ConfirmModal
        open={dialog === 'rollback'}
        onClose={() => setDialog(null)}
        loading={rollback.isPending}
        variant="warning"
        title="Rollback Import"
        confirmLabel="Rollback"
        message={
          <>
            Batalkan seluruh data dari <b>{batch.fileName}</b>? Data yang dibuat import ini dihapus
            dan data yang diperbarui dikembalikan ke nilai sebelumnya. Ditolak jika data tersebut
            sudah diubah setelah import.
          </>
        }
        onConfirm={() => {
          setConflicts(null);
          rollback.mutate(batch.id, {
            onError: (err) => {
              const details = isAxiosError(err) ? err.response?.data?.error?.details : undefined;
              if (Array.isArray(details) && details.length > 0)
                setConflicts(details as ImportConflictDto[]);
              else toast.error(getErrorMessage(err));
            },
            onSettled: () => setDialog(null),
          });
        }}
      />
    </div>
  );
}
