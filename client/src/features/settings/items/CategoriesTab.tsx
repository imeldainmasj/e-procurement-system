import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ItemCategoryDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataTable } from '@/components/ui/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { itemCategoryHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { CategoryFormModal } from './CategoryFormModal';

export function CategoriesTab() {
  const [params, setParams] = useListParams({ sort: 'code:asc' });
  const list = itemCategoryHooks.useList(params);
  const remove = itemCategoryHooks.useRemove();
  const [editing, setEditing] = useState<ItemCategoryDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ItemCategoryDto | null>(null);

  const columns = useMemo<ColumnDef<ItemCategoryDto>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: 'name',
        header: 'Nama Kategori',
        enableSorting: true,
        cell: ({ row }) => row.original.name,
      },
      {
        id: 'description',
        header: 'Deskripsi',
        cell: ({ row }) => row.original.description ?? '-',
      },
      { id: 'itemCount', header: 'Jumlah Item', cell: ({ row }) => row.original.itemCount },
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
      onSuccess: () => toast.success(`Kategori ${deleting.name} dihapus`),
      onError: (err) => toast.error(getErrorMessage(err)),
      onSettled: () => setDeleting(null),
    });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Tambah Kategori
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
        searchPlaceholder="Cari kode atau nama kategori..."
        getRowId={(c) => c.id}
      />
      {editing && (
        <CategoryFormModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        variant="error"
        title="Hapus Kategori"
        confirmLabel="Hapus"
        message={
          <>
            Hapus kategori <b>{deleting?.name}</b>? Kategori yang masih memiliki item tidak dapat
            dihapus.
          </>
        }
      />
    </>
  );
}
