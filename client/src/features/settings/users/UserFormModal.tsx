import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import {
  FEATURE_LABELS,
  FEATURES,
  FULL_PERMISSION,
  isManager,
  JOB_LEVEL_LABELS,
  JOB_LEVELS,
  NO_PERMISSION,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type PermissionMap,
  type UserCreateInput,
  type UserCreatePayload,
  userCreateSchema,
  type UserDto,
  userUpdateSchema,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useDepartmentOptions, userHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  user: UserDto | null;
  isSelf: boolean;
  onClose: () => void;
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Lihat',
  create: 'Tambah',
  update: 'Ubah',
  delete: 'Hapus',
};

/** Settings are admin-only (the isAdmin flag), so they are not part of the matrix. */
const MATRIX_FEATURES = FEATURES.filter((f) => f !== 'SETTINGS');

const DEFAULT_PERMISSIONS = Object.fromEntries(
  FEATURES.map((f) => [f, f === 'SETTINGS' ? NO_PERMISSION : FULL_PERMISSION]),
) as PermissionMap;

function PermissionMatrix({
  value,
  onChange,
  managerLevel,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  managerLevel: boolean;
}) {
  const toggle = (feature: (typeof FEATURES)[number], action: PermissionAction) => {
    const flags = { ...value[feature], [action]: !value[feature][action] };
    // Without "view" the other actions are unreachable from the UI.
    if (action === 'view' && !flags.view) Object.assign(flags, NO_PERMISSION);
    if (action !== 'view' && flags[action]) flags.view = true;
    onChange({ ...value, [feature]: flags });
  };

  return (
    <div className="border-base-300 overflow-x-auto border">
      <table className="table-sm table">
        <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
          <tr>
            <th>Fitur</th>
            {PERMISSION_ACTIONS.map((a) => (
              <th key={a} className="text-center">
                {ACTION_LABELS[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX_FEATURES.map((feature) => {
            const blocked = feature === 'MONITORING' && !managerLevel;
            return (
              <tr key={feature} className={blocked ? 'opacity-50' : undefined}>
                <td>
                  {FEATURE_LABELS[feature]}
                  {blocked && (
                    <div className="text-base-content/60 text-xs">Hanya untuk manager</div>
                  )}
                </td>
                {PERMISSION_ACTIONS.map((action) => (
                  <td key={action} className="text-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={value[feature][action]}
                      onChange={() => toggle(feature, action)}
                      aria-label={`${ACTION_LABELS[action]} ${FEATURE_LABELS[feature]}`}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function UserFormModal({ user, isSelf, onClose }: Props) {
  const create = userHooks.useCreate();
  const update = userHooks.useUpdate();
  const mutation = user ? update : create;
  const departments = useDepartmentOptions();

  // Create needs a password, edit does not; both share the remaining fields.
  const resolver = zodResolver(user ? userUpdateSchema : userCreateSchema) as unknown as Resolver<
    UserCreateInput,
    unknown,
    UserCreatePayload
  >;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UserCreateInput, unknown, UserCreatePayload>({
    resolver,
    defaultValues: {
      employeeId: user?.employeeId ?? '',
      username: user?.username ?? '',
      name: user?.name ?? '',
      email: user?.email ?? '',
      jobLevel: user?.jobLevel ?? 'STAFF',
      departmentId: user?.department?.id ?? '',
      isAdmin: user?.isAdmin ?? false,
      isActive: user?.isActive ?? true,
      permissions: user?.permissions ?? DEFAULT_PERMISSIONS,
      password: '',
    },
  });

  const jobLevel = useWatch({ control, name: 'jobLevel' });
  const isAdmin = useWatch({ control, name: 'isAdmin' });

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(user ? 'Pengguna diperbarui' : 'Pengguna ditambahkan');
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (user) {
      const { password: _password, ...rest } = input;
      update.mutate({ id: user.id, input: rest }, options);
    } else {
      create.mutate(input, options);
    }
  });

  return (
    <Modal open onClose={onClose} title={user ? 'Ubah Pengguna' : 'Tambah Pengguna'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Nama Lengkap" required error={errors.name?.message}>
            <input className="input w-full" {...register('name')} autoFocus />
          </FormField>
          <FormField label="NIK Karyawan" required error={errors.employeeId?.message}>
            <input className="input w-full" {...register('employeeId')} />
          </FormField>
          <FormField
            label="Username"
            required
            error={errors.username?.message}
            hint="Dipakai untuk login dan kolom PIC di file import"
          >
            <input className="input w-full" placeholder="nama.belakang" {...register('username')} />
          </FormField>
          <FormField label="Email" required error={errors.email?.message}>
            <input type="email" className="input w-full" {...register('email')} />
          </FormField>
          <FormField label="Jabatan" required error={errors.jobLevel?.message}>
            <select className="select w-full" {...register('jobLevel')}>
              {JOB_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {JOB_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Departemen" error={errors.departmentId?.message}>
            <select className="select w-full" {...register('departmentId')}>
              <option value="">— Tanpa departemen —</option>
              {departments.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
          {!user && (
            <FormField
              label="Password Awal"
              required
              error={errors.password?.message}
              hint="Min. 8 karakter, mengandung huruf dan angka"
            >
              <input
                type="password"
                autoComplete="new-password"
                className="input w-full"
                {...register('password')}
              />
            </FormField>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-6">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="toggle toggle-secondary toggle-sm"
              disabled={isSelf}
              {...register('isAdmin')}
            />
            <span className="text-sm">Admin (kelola pengguna, organisasi, pengaturan)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="toggle toggle-success toggle-sm"
              disabled={isSelf}
              {...register('isActive')}
            />
            <span className="text-sm">Akun aktif</span>
          </label>
        </div>

        <FormField
          label="Hak Akses per Fitur"
          className="mt-4"
          hint={
            isAdmin
              ? 'Admin melewati semua pengecekan hak akses.'
              : 'Hak akses mempersempit jabatan, tidak memperluas. Staff tetap hanya bisa mengubah pekerjaan miliknya.'
          }
        >
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => (
              <PermissionMatrix
                value={field.value}
                onChange={field.onChange}
                managerLevel={isManager(jobLevel)}
              />
            )}
          />
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
