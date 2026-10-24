import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ROLE_LABELS, ROLES, type UserDto } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActiveBadge } from '@/components/ui/StatusBadge';
import { useListParams } from '@/hooks/useListParams';
import { useDivisionOptions, userHooks } from '@/hooks/useMasterData';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { levelLabel } from '@/utils/approvalRule';
import { formatDateTime } from '@/utils/formatDate';
import { ResetPasswordModal } from './ResetPasswordModal';
import { UserFormModal } from './UserFormModal';

export function UsersPage() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [params, setParams] = useListParams({ sort: 'name:asc' });
  const list = userHooks.useList(params);
  const divisions = useDivisionOptions();
  const remove = userHooks.useRemove();
  const [editing, setEditing] = useState<UserDto | 'new' | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [deleting, setDeleting] = useState<UserDto | null>(null);

  const columns = useMemo<ColumnDef<UserDto>[]>(
    () => [
      {
        id: 'name',
        header: 'Nama',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-base-content/60 text-xs">{row.original.email}</div>
          </div>
        ),
      },
      { id: 'nip', header: 'NIP', enableSorting: true, cell: ({ row }) => row.original.nip ?? '-' },
      {
        id: 'division.name',
        header: 'Divisi',
        enableSorting: true,
        cell: ({ row }) => row.original.division?.name ?? '-',
      },
      {
        id: 'roles',
        header: 'Role',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((role) => (
              <span key={role} className="badge badge-sm badge-outline whitespace-nowrap">
                {ROLE_LABELS[role]}
                {role === 'APPROVER' && row.original.approvalLevel
                  ? ` · ${levelLabel(row.original.approvalLevel)}`
                  : ''}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'isActive',
        header: 'Status',
        cell: ({ row }) => <ActiveBadge active={row.original.isActive} />,
      },
      {
        id: 'lastLoginAt',
        header: 'Login Terakhir',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.lastLoginAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const isSelf = row.original.id === currentUserId;
          return (
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
                className="btn btn-ghost btn-xs"
                onClick={() => setResetting(row.original)}
                aria-label={`Reset password ${row.original.name}`}
              >
                <KeyRound className="size-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                onClick={() => setDeleting(row.original)}
                disabled={isSelf}
                title={isSelf ? 'Tidak dapat menghapus akun sendiri' : undefined}
                aria-label={`Hapus ${row.original.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        },
      },
    ],
    [currentUserId],
  );

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => toast.success(`Pengguna ${deleting.name} dihapus`),
      onError: (err) => toast.error(getErrorMessage(err)),
      onSettled: () => setDeleting(null),
    });
  };

  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Kelola akun, role, dan level approval."
        actions={
          <button
            type="button"
            className="btn btn-soft btn-secondary btn-sm"
            onClick={() => setEditing('new')}
          >
            <Plus className="size-4" /> Tambah Pengguna
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
        searchPlaceholder="Cari nama, email, atau NIP..."
        getRowId={(u) => u.id}
        filters={
          <>
            <select
              className="select select-sm w-auto"
              value={String(params.role ?? '')}
              onChange={(e) => setParams({ role: e.target.value || undefined })}
              aria-label="Filter role"
            >
              <option value="">Semua role</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
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
          </>
        }
      />
      {editing && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === currentUserId}
          onClose={() => setEditing(null)}
        />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        variant="error"
        title="Hapus Pengguna"
        confirmLabel="Hapus"
        message={
          <>
            Hapus pengguna <b>{deleting?.name}</b>? Akun akan dinonaktifkan dan semua sesinya
            diakhiri. Riwayat transaksinya tetap tersimpan.
          </>
        }
      />
    </>
  );
}
