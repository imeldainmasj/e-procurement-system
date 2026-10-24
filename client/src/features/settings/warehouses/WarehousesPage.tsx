import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WarehouseDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActiveBadge } from '@/components/ui/StatusBadge';
import { useListParams } from '@/hooks/useListParams';
import { warehouseHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { WarehouseFormModal } from './WarehouseFormModal';

export function WarehousesPage() {
  const [params, setParams] = useListParams({ sort: 'code:asc' });
  const list = warehouseHooks.useList(params);
  const remove = warehouseHooks.useRemove();
  const [editing, setEditing] = useState<WarehouseDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WarehouseDto | null>(null);

  const columns = useMemo<ColumnDef<WarehouseDto>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: 'name',
        header: 'Nama Gudang',
        enableSorting: true,
        cell: ({ row }) => row.original.name,
      },
      {
        id: 'location',
        header: 'Lokasi',
        enableSorting: true,
        cell: ({ row }) => row.original.location ?? '-',
      },
      {
        id: 'isActive',
        header: 'Status',
        cell: ({ row }) => <ActiveBadge active={row.original.isActive} />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setEditing(row.original)}
              aria-label={`Ubah ${row.original.name}`}
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              onClick={() => setDeleting(row.original)}
              aria-label={`Hapus ${row.original.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => toast.success(`Gudang ${deleting.name} dihapus`),
      onError: (err) => toast.error(getErrorMessage(err)),
      onSettled: () => setDeleting(null),
    });
  };

  return (
    <>
      <PageHeader
        title="Gudang"
        description="Lokasi penyimpanan stok dan aset IT."
        actions={
          <button
            type="button"
            className="btn btn-soft btn-secondary btn-sm"
            onClick={() => setEditing('new')}
          >
            <Plus className="size-4" /> Tambah Gudang
          </button>
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
        searchPlaceholder="Cari kode, nama, atau lokasi..."
        getRowId={(w) => w.id}
        filters={
          <select
            className="select select-sm w-auto"
            value={params.isActive === undefined ? '' : String(params.isActive)}
            onChange={(e) => setParams({ isActive: e.target.value || undefined })}
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        }
      />
      {editing && (
        <WarehouseFormModal
          warehouse={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        variant="error"
        title="Hapus Gudang"
        confirmLabel="Hapus"
        message={
          <>
            Hapus gudang <b>{deleting?.name}</b>?
          </>
        }
      />
    </>
  );
}
