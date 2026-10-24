import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  formatRupiah,
  MEMO_STATUS_LABELS,
  MEMO_STATUSES,
  type MemoListItemDto,
} from '@sipita/shared';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useMemos } from '@/hooks/useApprovals';
import { useListParams } from '@/hooks/useListParams';
import { levelLabel } from '@/utils/approvalRule';
import { formatDate } from '@/utils/formatDate';

export function MemoListPage() {
  const [params, setParams] = useListParams({ sort: 'createdAt:desc' });
  const memos = useMemos(params);

  const columns = useMemo<ColumnDef<MemoListItemDto>[]>(
    () => [
      {
        id: 'number',
        header: 'Nomor Memo',
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            to={`/memo/${row.original.id}`}
            className="link link-hover font-mono text-sm whitespace-nowrap"
          >
            {row.original.number}
          </Link>
        ),
      },
      {
        id: 'subject',
        header: 'Perihal',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <Link to={`/memo/${row.original.id}`} className="link link-hover font-medium">
              {row.original.subject}
            </Link>
            <div className="text-base-content/60 text-xs">
              <Link to={`/pengajuan/${row.original.pr.id}`} className="link link-hover font-mono">
                {row.original.pr.number}
              </Link>{' '}
              · {row.original.requester.name} ({row.original.division.name})
            </div>
          </div>
        ),
      },
      {
        id: 'totalAmount',
        header: 'Nilai',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatRupiah(row.original.totalAmount)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <StatusBadge
              status={row.original.status}
              label={MEMO_STATUS_LABELS[row.original.status]}
            />
            {row.original.currentLevel && (
              <div className="text-base-content/60 mt-1 text-xs">
                di {levelLabel(row.original.currentLevel)}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'createdAt',
        header: 'Tanggal',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Memo Internal"
        description="Memo dibuat otomatis saat pengajuan tidak tersedia di gudang."
      />
      <DataTable
        columns={columns}
        data={memos.data?.data}
        total={memos.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={memos.isPending}
        isFetching={memos.isFetching}
        error={memos.error}
        searchPlaceholder="Cari nomor memo, perihal, atau nomor PR..."
        getRowId={(m) => m.id}
        filters={
          <select
            className="select select-sm w-auto"
            value={String(params.status ?? '')}
            onChange={(e) => setParams({ status: e.target.value || undefined })}
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            {MEMO_STATUSES.filter((s) => s !== 'DRAFT').map((s) => (
              <option key={s} value={s}>
                {MEMO_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        }
      />
    </>
  );
}
