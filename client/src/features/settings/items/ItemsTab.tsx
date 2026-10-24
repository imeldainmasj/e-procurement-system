import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ItemDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataTable } from '@/components/ui/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { itemHooks, useCategoryOptions } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { ItemFormModal } from './ItemFormModal';

export function ItemsTab() {
  const [params, setParams] = useListParams({ sort: 'code:asc' });
  const list = itemHooks.useList(params);
  const categories = useCategoryOptions();
  const remove = itemHooks.useRemove();
  const [editing, setEditing] = useState<ItemDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ItemDto | null>(null);

  const columns = useMemo<ColumnDef<ItemDto>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: 'name',
        header: 'Nama Item',
        enableSorting: true,
        cell: ({ row }) => {
          const specs = Object.entries(row.original.specs);
          return (
            <div>
              <div className="font-medium">{row.original.name}</div>
              {specs.length > 0 && (
                <div className="text-base-content/60 text-xs">
                  {specs.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'category.name',
        header: 'Kategori',
        enableSorting: true,
        cell: ({ row }) => row.original.category.name,
      },
      { id: 'unit', header: 'Satuan', enableSorting: true, cell: ({ row }) => row.original.unit },
      {
        id: 'isAsset',
        header: 'Jenis',
        cell: ({ row }) =>
          row.original.isAsset ? (
            <span className="badge badge-sm badge-info">Aset</span>
          ) : (
            <span className="badge badge-sm badge-ghost">Habis pakai</span>
          ),
      },
      {
        id: 'minStock',
        header: 'Stok Min.',
        enableSorting: true,
        cell: ({ row }) => row.original.minStock,
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
      onSuccess: () => toast.success(`Item ${deleting.name} dihapus`),
      onError: (err) => toast.error(getErrorMessage(err)),
      onSettled: () => setDeleting(null),
    });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Tambah Item
        </button>
      </div>
      <DataTable
        columns={columns}
        data={list.data?.data}
        total={list.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={list.isPending}
        isFetching={list.isFetching}
        error={list.error}
        searchPlaceholder="Cari kode atau nama item..."
        getRowId={(i) => i.id}
        filters={
          <>
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
            <select
              className="select select-sm w-auto"
              value={params.isAsset === undefined ? '' : String(params.isAsset)}
              onChange={(e) => setParams({ isAsset: e.target.value || undefined })}
              aria-label="Filter jenis"
            >
              <option value="">Semua jenis</option>
              <option value="true">Aset</option>
              <option value="false">Habis pakai</option>
            </select>
          </>
        }
      />
      {editing && (
        <ItemFormModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        variant="error"
        title="Hapus Item"
        confirmLabel="Hapus"
        message={
          <>
            Hapus item <b>{deleting?.name}</b> dari katalog?
          </>
        }
      />
    </>
  );
}
