import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { VendorDto } from '@sipita/shared';
import { Can } from '@/components/auth/Can';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { useListParams } from '@/hooks/useListParams';
import { vendorHooks } from '@/hooks/useVendors';
import { VendorFormModal } from './components/VendorFormModal';

export function VendorListPage() {
  const [params, setParams] = useListParams({ sort: 'name:asc' });
  const vendors = vendorHooks.useList(params);
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<VendorDto>[]>(
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
          <Link to={`/vendor/${row.original.id}`} className="link link-hover font-medium">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'picName',
        header: 'PIC',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div>{row.original.picName ?? '-'}</div>
            <div className="text-base-content/60 text-xs">
              {[row.original.phone, row.original.email].filter(Boolean).join(' · ')}
            </div>
          </div>
        ),
      },
      {
        id: 'workCount',
        header: 'Pekerjaan',
        cell: ({ row }) => row.original.workCount,
      },
      {
        id: 'agreementCount',
        header: 'Kontrak',
        cell: ({ row }) => row.original.agreementCount,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Vendor"
        description="Master vendor software & lisensi."
        actions={
          <Can feature="VENDOR" action="create">
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
        exportPath="/vendors/export"
        searchPlaceholder="Cari kode, nama, NPWP, PIC..."
        getRowId={(v) => v.id}
      />
      {creating && <VendorFormModal vendor={null} onClose={() => setCreating(false)} />}
    </>
  );
}
