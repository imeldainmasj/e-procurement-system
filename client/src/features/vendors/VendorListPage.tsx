import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES, type VendorListItemDto } from '@sipita/shared';
import { Can } from '@/components/auth/Can';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { RatingStars } from '@/components/ui/RatingStars';
import { useListParams } from '@/hooks/useListParams';
import { useCategoryOptions } from '@/hooks/useMasterData';
import { useVendors } from '@/hooks/useVendors';
import { DocumentAlerts, VendorStatusBadge } from './components/VendorBadges';
import { VendorFormModal } from './components/VendorFormModal';

export function VendorListPage() {
  const [params, setParams] = useListParams({ sort: 'name:asc' });
  const vendors = useVendors(params);
  const categories = useCategoryOptions();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<VendorListItemDto>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => (
          <Link to={`/vendor/${row.original.id}`} className="link link-hover font-mono text-sm">
            {row.original.code}
          </Link>
        ),
      },
      {
        id: 'name',
        header: 'Vendor',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <Link to={`/vendor/${row.original.id}`} className="link link-hover font-medium">
              {row.original.name}
            </Link>
            <div className="text-base-content/60 text-xs">
              {[row.original.picName, row.original.phone].filter(Boolean).join(' · ') || '-'}
            </div>
          </div>
        ),
      },
      {
        id: 'city',
        header: 'Kota',
        enableSorting: true,
        cell: ({ row }) => row.original.city ?? '-',
      },
      {
        id: 'categories',
        header: 'Kategori',
        cell: ({ row }) => (
          <div className="flex max-w-xs flex-wrap gap-1">
            {row.original.categories.map((c) => (
              <span key={c.id} className="badge badge-xs badge-outline whitespace-nowrap">
                {c.name}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'rating',
        header: 'Rating',
        cell: ({ row }) => (
          <RatingStars
            value={row.original.rating.overall}
            count={row.original.rating.count || undefined}
          />
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <VendorStatusBadge status={row.original.status} />
            <DocumentAlerts {...row.original.documentAlerts} />
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Vendor"
        description="Master vendor, dokumen legal, dan kinerja."
        actions={
          <Can role="PROCUREMENT">
            <button
              type="button"
              className="btn btn-soft btn-secondary btn-sm"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" /> Tambah Vendor
            </button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={vendors.data?.data}
        total={vendors.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={vendors.isPending}
        isFetching={vendors.isFetching}
        error={vendors.error}
        searchPlaceholder="Cari kode, nama, NPWP, PIC, kota..."
        getRowId={(v) => v.id}
        filters={
          <>
            <select
              className="select select-sm w-auto"
              value={String(params.status ?? '')}
              onChange={(e) => setParams({ status: e.target.value || undefined })}
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              {VENDOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VENDOR_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="select select-sm w-auto"
              value={String(params.categoryId ?? '')}
              onChange={(e) => setParams({ categoryId: e.target.value || undefined })}
              aria-label="Filter kategori"
            >
              <option value="">Semua kategori</option>
              {categories.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        }
      />
      {creating && <VendorFormModal vendor={null} onClose={() => setCreating(false)} />}
    </>
  );
}
