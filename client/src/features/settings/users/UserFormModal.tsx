import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import {
  APPROVAL_LEVEL_LABELS,
  ROLE_LABELS,
  ROLES,
  type UserCreateInput,
  type UserCreatePayload,
  userCreateSchema,
  type UserDto,
  userUpdateSchema,
} from '@sipita/shared';
import { CheckboxGroup } from '@/components/ui/CheckboxGroup';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useDivisionOptions, userHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  user: UserDto | null;
  isSelf: boolean;
  onClose: () => void;
}

const roleOptions = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
const levelOptions = Object.entries(APPROVAL_LEVEL_LABELS).map(([level, label]) => ({
  value: Number(level),
  label: `Level ${level} — ${label}`,
}));

export function UserFormModal({ user, isSelf, onClose }: Props) {
  const create = userHooks.useCreate();
  const update = userHooks.useUpdate();
  const mutation = user ? update : create;
  const divisions = useDivisionOptions();

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
      name: user?.name ?? '',
      email: user?.email ?? '',
      nip: user?.nip ?? '',
      phone: user?.phone ?? '',
      divisionId: user?.division?.id ?? '',
      roles: user?.roles ?? ['REQUESTER'],
      approvalLevel: user?.approvalLevel ?? null,
      isActive: user?.isActive ?? true,
      password: '',
    },
  });

  const isApprover = useWatch({ control, name: 'roles' }).includes('APPROVER');

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
    <Modal open onClose={onClose} title={user ? 'Ubah Pengguna' : 'Tambah Pengguna'}>
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Nama Lengkap" required error={errors.name?.message}>
            <input className="input w-full" {...register('name')} autoFocus />
          </FormField>
          <FormField label="Email" required error={errors.email?.message}>
            <input type="email" className="input w-full" {...register('email')} />
          </FormField>
          <FormField label="NIP" error={errors.nip?.message}>
            <input className="input w-full" {...register('nip')} />
          </FormField>
          <FormField label="No. Telepon" error={errors.phone?.message}>
            <input className="input w-full" {...register('phone')} />
          </FormField>
          <FormField label="Divisi" error={errors.divisionId?.message}>
            <select className="select w-full" {...register('divisionId')}>
              <option value="">— Tanpa divisi —</option>
              {divisions.data?.data.map((d) => (
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

        <FormField label="Role" required error={errors.roles?.message} className="mt-2">
          <Controller
            control={control}
            name="roles"
            render={({ field }) => (
              <CheckboxGroup
                name="roles"
                options={roleOptions}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {isSelf && (
            <p className="label">Role Super Admin pada akun sendiri tidak dapat dilepas.</p>
          )}
        </FormField>

        {isApprover && (
          <FormField label="Level Approval" required error={errors.approvalLevel?.message}>
            <Controller
              control={control}
              name="approvalLevel"
              render={({ field }) => (
                <select
                  className="select w-full"
                  value={
                    field.value === null || field.value === undefined ? '' : String(field.value)
                  }
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  <option value="">— Pilih level —</option>
                  {levelOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </FormField>
        )}

        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-success toggle-sm"
            disabled={isSelf}
            {...register('isActive')}
          />
          <span className="text-sm">Akun aktif</span>
        </label>

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
