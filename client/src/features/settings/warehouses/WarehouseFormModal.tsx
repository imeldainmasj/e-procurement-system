import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  type WarehouseDto,
  type WarehouseInput,
  warehouseInputSchema,
  type WarehousePayload,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { warehouseHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  warehouse: WarehouseDto | null;
  onClose: () => void;
}

export function WarehouseFormModal({ warehouse, onClose }: Props) {
  const create = warehouseHooks.useCreate();
  const update = warehouseHooks.useUpdate();
  const mutation = warehouse ? update : create;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<WarehouseInput, unknown, WarehousePayload>({
    resolver: zodResolver(warehouseInputSchema),
    defaultValues: {
      code: warehouse?.code ?? '',
      name: warehouse?.name ?? '',
      location: warehouse?.location ?? '',
      isActive: warehouse?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(warehouse ? 'Gudang diperbarui' : 'Gudang ditambahkan');
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (warehouse) update.mutate({ id: warehouse.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Modal open onClose={onClose} title={warehouse ? 'Ubah Gudang' : 'Tambah Gudang'} size="sm">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <FormField label="Kode" required error={errors.code?.message} hint="Contoh: WH-UTAMA">
          <input className="input w-full uppercase" {...register('code')} autoFocus />
        </FormField>
        <FormField label="Nama Gudang" required error={errors.name?.message}>
          <input className="input w-full" {...register('name')} />
        </FormField>
        <FormField label="Lokasi" error={errors.location?.message}>
          <input
            className="input w-full"
            {...register('location')}
            placeholder="Gedung, lantai, ruangan"
          />
        </FormField>
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-success toggle-sm"
            {...register('isActive')}
          />
          <span className="text-sm">Aktif</span>
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
