import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DivisionDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { useListParams } from '@/hooks/useListParams';
import { divisionHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { DivisionFormModal } from './DivisionFormModal';

export function DivisionsPage() {
  const [params, setParams] = useListParams({ sort: 'code:asc' });
  const list = divisionHooks.useList(params);
  const remove = divisionHooks.useRemove();
  const [editing, setEditing] = useState<DivisionDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DivisionDto | null>(null);

  const columns = useMemo<ColumnDef<DivisionDto>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: 'name',
        header: 'Nama Divisi',
        enableSorting: true,
        cell: ({ row }) => row.original.name,
      },
      {
        id: 'head',
        header: 'Kepala Divisi',
        cell: ({ row }) => row.original.headUser?.name ?? '-',
      },
      { id: 'userCount', header: 'Jumlah Pengguna', cell: ({ row }) => row.original.userCount },
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
      onSuccess: () => {
        toast.success(`Divisi ${deleting.name} dihapus`);
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err));
        setDeleting(null);
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Divisi"
        description="Kelola daftar divisi dan kepala divisi."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setEditing('new')}
          >
            <Plus className="size-4" /> Tambah Divisi
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
        searchPlaceholder="Cari kode atau nama divisi..."
        getRowId={(d) => d.id}
      />
      {editing && (
        <DivisionFormModal
          division={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        variant="error"
        title="Hapus Divisi"
        confirmLabel="Hapus"
        message={
          <>
            Hapus divisi <b>{deleting?.name}</b>? Divisi yang masih memiliki pengguna tidak dapat
            dihapus.
          </>
        }
      />
    </>
  );
}
