import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  type DivisionDto,
  type DivisionInput,
  divisionInputSchema,
  type DivisionPayload,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { divisionHooks, userHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  division: DivisionDto | null;
  onClose: () => void;
}

export function DivisionFormModal({ division, onClose }: Props) {
  const create = divisionHooks.useCreate();
  const update = divisionHooks.useUpdate();
  const mutation = division ? update : create;
  const users = userHooks.useList({ page: 1, limit: 100, isActive: true, sort: 'name:asc' });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DivisionInput, unknown, DivisionPayload>({
    resolver: zodResolver(divisionInputSchema),
    defaultValues: {
      code: division?.code ?? '',
      name: division?.name ?? '',
      headUserId: division?.headUser?.id ?? '',
    },
  });

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(division ? 'Divisi diperbarui' : 'Divisi ditambahkan');
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (division) update.mutate({ id: division.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Modal open onClose={onClose} title={division ? 'Ubah Divisi' : 'Tambah Divisi'} size="sm">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <FormField label="Kode" required error={errors.code?.message} hint="Contoh: IT, FIN, HRD">
          <input className="input w-full uppercase" {...register('code')} autoFocus />
        </FormField>
        <FormField label="Nama Divisi" required error={errors.name?.message}>
          <input className="input w-full" {...register('name')} />
        </FormField>
        <FormField label="Kepala Divisi" error={errors.headUserId?.message}>
          <select className="select w-full" {...register('headUserId')}>
            <option value="">— Tidak ada —</option>
            {users.data?.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
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
