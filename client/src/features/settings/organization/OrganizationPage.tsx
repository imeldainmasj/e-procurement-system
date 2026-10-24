import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type FieldValues, type Path, useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  departmentInputSchema,
  directorateInputSchema,
  divisionInputSchema,
  type DepartmentDto,
  type DirectorateDto,
  type DivisionDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DataTable } from '@/components/ui/DataTable';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useListParams } from '@/hooks/useListParams';
import type { ResourceHooks } from '@/hooks/useResource';
import {
  departmentHooks,
  directorateHooks,
  divisionHooks,
  useDirectorateOptions,
  useDivisionOptions,
} from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface UnitBase {
  id: string;
  code: string;
  name: string;
}

interface ParentConfig {
  /** Form field holding the parent id, e.g. `directorateId`. */
  field: string;
  label: string;
  options: UnitBase[];
}

interface UnitTabProps<T extends UnitBase, I> {
  label: string;
  hooks: ResourceHooks<T, I>;
  schema: z.ZodType<FieldValues, FieldValues>;
  extraColumns: ColumnDef<T>[];
  parent?: ParentConfig;
  parentIdOf?: (unit: T) => string;
  deleteHint: string;
}

/** List + form for one organisation level; all three levels share the same shape. */
function UnitTab<T extends UnitBase, I>({
  label,
  hooks,
  schema,
  extraColumns,
  parent,
  parentIdOf,
  deleteHint,
}: UnitTabProps<T, I>) {
  const [params, setParams] = useListParams({ sort: 'code:asc' });
  const list = hooks.useList(params);
  const remove = hooks.useRemove();
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const columns = useMemo<ColumnDef<T>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
      },
      { id: 'name', header: 'Nama', enableSorting: true, cell: ({ row }) => row.original.name },
      ...extraColumns,
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
    [extraColumns],
  );

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-soft btn-secondary btn-sm"
          onClick={() => setEditing('new')}
        >
          <Plus className="size-4" /> Tambah {label}
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
        searchPlaceholder={`Cari kode atau nama ${label.toLowerCase()}...`}
        getRowId={(u) => u.id}
      />
      {editing && (
        <UnitFormModal
          label={label}
          unit={editing === 'new' ? null : editing}
          parentId={editing === 'new' ? '' : (parentIdOf?.(editing) ?? '')}
          hooks={hooks}
          schema={schema}
          parent={parent}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        loading={remove.isPending}
        variant="error"
        title={`Hapus ${label}`}
        confirmLabel="Hapus"
        message={
          <>
            Hapus {label.toLowerCase()} <b>{deleting?.name}</b>? {deleteHint}
          </>
        }
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => toast.success(`${label} ${deleting.name} dihapus`),
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDeleting(null),
          })
        }
      />
    </>
  );
}

function UnitFormModal<T extends UnitBase, I>({
  label,
  unit,
  parentId,
  hooks,
  schema,
  parent,
  onClose,
}: {
  label: string;
  unit: T | null;
  parentId: string;
  hooks: ResourceHooks<T, I>;
  schema: z.ZodType<FieldValues, FieldValues>;
  parent?: ParentConfig;
  onClose: () => void;
}) {
  const create = hooks.useCreate();
  const update = hooks.useUpdate();
  const mutation = unit ? update : create;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: unit?.code ?? '',
      name: unit?.name ?? '',
      ...(parent && { [parent.field]: parentId }),
    },
  });
  const errorOf = (field: string) => errors[field]?.message as string | undefined;

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(unit ? `${label} diperbarui` : `${label} ditambahkan`);
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    // The input shape is checked by `schema`; the resource API is typed per level.
    const payload = input as I;
    if (unit) update.mutate({ id: unit.id, input: payload }, options);
    else create.mutate(payload, options);
  });

  return (
    <Modal open onClose={onClose} title={unit ? `Ubah ${label}` : `Tambah ${label}`} size="sm">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        {parent && (
          <FormField label={parent.label} required error={errorOf(parent.field)}>
            <select className="select w-full" {...register(parent.field as Path<FieldValues>)}>
              <option value="">— Pilih {parent.label.toLowerCase()} —</option>
              {parent.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Kode" required error={errorOf('code')}>
          <input className="input w-full uppercase" {...register('code')} autoFocus />
        </FormField>
        <FormField label={`Nama ${label}`} required error={errorOf('name')}>
          <input className="input w-full" {...register('name')} />
        </FormField>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

const directorateColumns: ColumnDef<DirectorateDto>[] = [
  { id: 'divisionCount', header: 'Divisi', cell: ({ row }) => row.original.divisionCount },
];

const divisionColumns: ColumnDef<DivisionDto>[] = [
  {
    id: 'directorate.name',
    header: 'Direktorat',
    enableSorting: true,
    cell: ({ row }) => row.original.directorate.name,
  },
  { id: 'departmentCount', header: 'Departemen', cell: ({ row }) => row.original.departmentCount },
];

const departmentColumns: ColumnDef<DepartmentDto>[] = [
  {
    id: 'division.name',
    header: 'Divisi',
    enableSorting: true,
    cell: ({ row }) => (
      <div>
        <div>{row.original.division.name}</div>
        <div className="text-base-content/60 text-xs">{row.original.directorate.name}</div>
      </div>
    ),
  },
  { id: 'userCount', header: 'Pengguna', cell: ({ row }) => row.original.userCount },
];

const TABS = [
  ['directorate', 'Direktorat'],
  ['division', 'Divisi'],
  ['department', 'Departemen'],
] as const;

export function OrganizationPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('directorate');
  const directorates = useDirectorateOptions();
  const divisions = useDivisionOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisasi"
        description="Struktur Direktorat → Divisi → Departemen. Direktorat dipakai sebagai peminta pengadaan."
      />
      <div role="tablist" className="tabs tabs-border">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={cn('tab', tab === key && 'tab-active')}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'directorate' && (
        <UnitTab
          label="Direktorat"
          hooks={directorateHooks}
          schema={directorateInputSchema}
          extraColumns={directorateColumns}
          deleteHint="Direktorat yang masih memiliki divisi aktif tidak dapat dihapus."
        />
      )}
      {tab === 'division' && (
        <UnitTab
          label="Divisi"
          hooks={divisionHooks}
          schema={divisionInputSchema}
          extraColumns={divisionColumns}
          parent={{
            field: 'directorateId',
            label: 'Direktorat',
            options: directorates.data?.data ?? [],
          }}
          parentIdOf={(d) => d.directorate.id}
          deleteHint="Divisi yang masih memiliki departemen aktif tidak dapat dihapus."
        />
      )}
      {tab === 'department' && (
        <UnitTab
          label="Departemen"
          hooks={departmentHooks}
          schema={departmentInputSchema}
          extraColumns={departmentColumns}
          parent={{ field: 'divisionId', label: 'Divisi', options: divisions.data?.data ?? [] }}
          parentIdOf={(d) => d.division.id}
          deleteHint="Departemen yang masih memiliki pengguna aktif tidak dapat dihapus."
        />
      )}
    </div>
  );
}
