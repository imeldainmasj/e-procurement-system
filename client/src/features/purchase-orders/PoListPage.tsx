import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatRupiah, PO_STATUS_LABELS, PO_STATUSES, type PoListItemDto } from '@sipita/shared';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useListParams } from '@/hooks/useListParams';
import { usePurchaseOrders } from '@/hooks/useProcurement';
import { formatDate } from '@/utils/formatDate';

export function PoListPage() {
  const [params, setParams] = useListParams({ sort: 'createdAt:desc' });
  const pos = usePurchaseOrders(params);

  const columns = useMemo<ColumnDef<PoListItemDto>[]>(
    () => [
      {
        id: 'number',
        header: 'Nomor PO',
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            to={`/purchase-order/${row.original.id}`}
            className="link link-hover font-mono text-sm whitespace-nowrap"
          >
            {row.original.number}
          </Link>
        ),
      },
      {
        id: 'vendor.name',
        header: 'Vendor',
        enableSorting: true,
        cell: ({ row }) => row.original.vendor.name,
      },
      {
        id: 'pr',
        header: 'Pengajuan',
        cell: ({ row }) => (
          <div>
            <Link
              to={`/pengajuan/${row.original.pr.id}`}
              className="link link-hover font-mono text-xs"
            >
              {row.original.pr.number}
            </Link>
            <div className="max-w-64 truncate text-sm">{row.original.pr.title}</div>
          </div>
        ),
      },
      {
        id: 'orderDate',
        header: 'Tanggal',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.orderDate)}</span>
        ),
      },
      {
        id: 'expectedDate',
        header: 'Estimasi Tiba',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.expectedDate)}</span>
        ),
      },
      {
        id: 'total',
        header: 'Total',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatRupiah(row.original.total)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} label={PO_STATUS_LABELS[row.original.status]} />
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Purchase Order"
        description="PO dibuat dari penawaran pemenang pada halaman perbandingan penawaran."
      />
      <DataTable
        columns={columns}
        data={pos.data?.data}
        total={pos.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={pos.isPending}
        isFetching={pos.isFetching}
        error={pos.error}
        searchPlaceholder="Cari nomor PO, vendor, pengajuan..."
        emptyTitle="Belum ada Purchase Order"
        getRowId={(po) => po.id}
        filters={
          <select
            className="select select-sm w-auto"
            value={String(params.status ?? '')}
            onChange={(e) => setParams({ status: e.target.value || undefined })}
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PO_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        }
      />
    </>
  );
}
