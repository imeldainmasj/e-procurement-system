import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  canViewAllPrs,
  formatRupiah,
  PR_PRIORITIES,
  PR_PRIORITY_LABELS,
  PR_STATUS_LABELS,
  PR_STATUSES,
  type PrListItemDto,
} from '@sipita/shared';
import { Can } from '@/components/auth/Can';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { useListParams } from '@/hooks/useListParams';
import { useDivisionOptions } from '@/hooks/useMasterData';
import { usePurchaseRequests } from '@/hooks/usePurchaseRequests';
import { useAuthStore } from '@/stores/authStore';
import { formatDate } from '@/utils/formatDate';
import { PriorityBadge, PrStatusBadge } from './components/PrBadges';
import { RequesterFilter } from './components/RequesterFilter';

export function PrListPage() {
  const user = useAuthStore((s) => s.user);
  const viewAll = user ? canViewAllPrs(user) : false;
  const [params, setParams] = useListParams({ sort: 'createdAt:desc' });
  const list = usePurchaseRequests(params);
  const divisions = useDivisionOptions();

  const columns = useMemo<ColumnDef<PrListItemDto>[]>(
    () => [
      {
        id: 'number',
        header: 'Nomor',
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            to={`/pengajuan/${row.original.id}`}
            className="link link-hover font-mono text-sm whitespace-nowrap"
          >
            {row.original.number ?? <span className="text-base-content/50 italic">Draft</span>}
          </Link>
        ),
      },
      {
        id: 'title',
        header: 'Judul',
        enableSorting: true,
        cell: ({ row }) => (
          <Link to={`/pengajuan/${row.original.id}`} className="link link-hover">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-base-content/60 text-xs">{row.original.itemCount} item</div>
          </Link>
        ),
      },
      {
        id: 'requester.name',
        header: 'Pemohon',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div>{row.original.requester.name}</div>
            <div className="text-base-content/60 text-xs">{row.original.division.name}</div>
          </div>
        ),
      },
      {
        id: 'priority',
        header: 'Prioritas',
        enableSorting: true,
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'neededDate',
        header: 'Dibutuhkan',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.neededDate)}</span>
        ),
      },
      {
        id: 'estimatedTotal',
        header: 'Estimasi Total',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatRupiah(row.original.estimatedTotal)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => <PrStatusBadge status={row.original.status} />,
      },
      {
        id: 'createdAt',
        header: 'Dibuat',
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
        title="Pengajuan"
        description={
          viewAll
            ? 'Semua pengajuan yang telah diajukan, beserta draft Anda.'
            : 'Pengajuan yang Anda buat.'
        }
        actions={
          <Can role="REQUESTER">
            <Link to="/pengajuan/baru" className="btn btn-soft btn-secondary btn-sm">
              <Plus className="size-4" /> Buat Pengajuan
            </Link>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={list.data?.data}
        total={list.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={list.isPending}
        isFetching={list.isFetching}
        error={list.error}
        searchPlaceholder="Cari nomor atau judul..."
        getRowId={(pr) => pr.id}
        filters={
          <>
            <select
              className="select select-sm w-auto"
              value={String(params.status ?? '')}
              onChange={(e) => setParams({ status: e.target.value || undefined })}
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              {PR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PR_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="select select-sm w-auto"
              value={String(params.priority ?? '')}
              onChange={(e) => setParams({ priority: e.target.value || undefined })}
              aria-label="Filter prioritas"
            >
              <option value="">Semua prioritas</option>
              {PR_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PR_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            {viewAll && (
              <>
                <select
                  className="select select-sm w-auto"
                  value={String(params.divisionId ?? '')}
                  onChange={(e) => setParams({ divisionId: e.target.value || undefined })}
                  aria-label="Filter divisi"
                >
                  <option value="">Semua divisi</option>
                  {divisions.data?.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <RequesterFilter
                  value={params.requesterId as string | undefined}
                  onChange={(requesterId) => setParams({ requesterId })}
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={params.mine === 'true'}
                    onChange={(e) => setParams({ mine: e.target.checked ? 'true' : undefined })}
                  />
                  Hanya milik saya
                </label>
              </>
            )}
          </>
        }
      />
    </>
  );
}
