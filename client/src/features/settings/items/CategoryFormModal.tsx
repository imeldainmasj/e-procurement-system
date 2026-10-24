import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  type ItemCategoryDto,
  type ItemCategoryInput,
  itemCategoryInputSchema,
  type ItemCategoryPayload,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { itemCategoryHooks } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  category: ItemCategoryDto | null;
  onClose: () => void;
}

export function CategoryFormModal({ category, onClose }: Props) {
  const create = itemCategoryHooks.useCreate();
  const update = itemCategoryHooks.useUpdate();
  const mutation = category ? update : create;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ItemCategoryInput, unknown, ItemCategoryPayload>({
    resolver: zodResolver(itemCategoryInputSchema),
    defaultValues: {
      code: category?.code ?? '',
      name: category?.name ?? '',
      description: category?.description ?? '',
    },
  });

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: () => {
        toast.success(category ? 'Kategori diperbarui' : 'Kategori ditambahkan');
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (category) update.mutate({ id: category.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Modal open onClose={onClose} title={category ? 'Ubah Kategori' : 'Tambah Kategori'} size="sm">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <FormField
          label="Kode"
          required
          error={errors.code?.message}
          hint="Contoh: HARDWARE, LICENSE"
        >
          <input className="input w-full uppercase" {...register('code')} autoFocus />
        </FormField>
        <FormField label="Nama Kategori" required error={errors.name?.message}>
          <input className="input w-full" {...register('name')} />
        </FormField>
        <FormField label="Deskripsi" error={errors.description?.message}>
          <textarea className="textarea w-full" rows={2} {...register('description')} />
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
