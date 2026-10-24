import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { type ItemDto, type ItemInput, itemInputSchema, type ItemPayload } from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { itemHooks, useCategoryOptions } from '@/hooks/useMasterData';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  item: ItemDto | null;
  onClose: () => void;
}

interface SpecRow {
  key: string;
  value: string;
}

export function ItemFormModal({ item, onClose }: Props) {
  const create = itemHooks.useCreate();
  const update = itemHooks.useUpdate();
  const mutation = item ? update : create;
  const categories = useCategoryOptions();

  // Specs are edited as rows and folded into a { key: value } object on submit.
  const [specRows, setSpecRows] = useState<SpecRow[]>(
    Object.entries(item?.specs ?? {}).map(([key, value]) => ({ key, value })),
  );
  const [specError, setSpecError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ItemInput, unknown, ItemPayload>({
    resolver: zodResolver(itemInputSchema),
    defaultValues: {
      code: item?.code ?? '',
      name: item?.name ?? '',
      categoryId: item?.category.id ?? '',
      unit: item?.unit ?? 'unit',
      isAsset: item?.isAsset ?? false,
      minStock: item?.minStock ?? 0,
      description: item?.description ?? '',
    },
  });

  const setRow = (index: number, patch: Partial<SpecRow>) =>
    setSpecRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const onSubmit = handleSubmit((values) => {
    const filled = specRows.filter((r) => r.key.trim() !== '');
    const keys = filled.map((r) => r.key.trim().toLowerCase());
    if (new Set(keys).size !== keys.length) {
      setSpecError('Nama spesifikasi tidak boleh duplikat');
      return;
    }
    setSpecError(null);
    const input = {
      ...values,
      specs: Object.fromEntries(filled.map((r) => [r.key.trim(), r.value.trim()])),
    };

    const options = {
      onSuccess: () => {
        toast.success(item ? 'Item diperbarui' : 'Item ditambahkan');
        onClose();
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (item) update.mutate({ id: item.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Modal open onClose={onClose} title={item ? 'Ubah Item' : 'Tambah Item'}>
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField label="Kode" required error={errors.code?.message} hint="Contoh: LPT-STD">
            <input className="input w-full uppercase" {...register('code')} autoFocus />
          </FormField>
          <FormField label="Kategori" required error={errors.categoryId?.message}>
            <select className="select w-full" {...register('categoryId')}>
              <option value="">— Pilih kategori —</option>
              {categories.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Nama Item"
            required
            error={errors.name?.message}
            className="sm:col-span-2"
          >
            <input className="input w-full" {...register('name')} />
          </FormField>
          <FormField
            label="Satuan"
            required
            error={errors.unit?.message}
            hint="unit, pcs, lisensi, user/tahun, ..."
          >
            <input className="input w-full" {...register('unit')} />
          </FormField>
          <FormField
            label="Stok Minimum"
            error={errors.minStock?.message}
            hint="Batas notifikasi stok menipis"
          >
            <input type="number" min={0} className="input w-full" {...register('minStock')} />
          </FormField>
        </div>

        <label className="mt-3 flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="toggle toggle-info toggle-sm mt-0.5"
            {...register('isAsset')}
          />
          <span className="text-sm">
            Dicatat sebagai <b>aset</b>
            <span className="text-base-content/60 block text-xs">
              Setiap unit punya nomor seri & pemegang. Nonaktifkan untuk barang habis pakai/stok.
            </span>
          </span>
        </label>

        <FormField label="Spesifikasi" error={specError ?? undefined} className="mt-2">
          <div className="space-y-2">
            {specRows.map((row, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className="input input-sm w-2/5"
                  placeholder="Nama (mis. RAM)"
                  value={row.key}
                  onChange={(e) => setRow(index, { key: e.target.value })}
                  aria-label={`Nama spesifikasi ${index + 1}`}
                />
                <input
                  className="input input-sm flex-1"
                  placeholder="Nilai (mis. 16 GB)"
                  value={row.value}
                  onChange={(e) => setRow(index, { value: e.target.value })}
                  aria-label={`Nilai spesifikasi ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-square"
                  onClick={() => setSpecRows((rows) => rows.filter((_, i) => i !== index))}
                  aria-label="Hapus spesifikasi"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setSpecRows((rows) => [...rows, { key: '', value: '' }])}
            >
              <Plus className="size-3" /> Tambah spesifikasi
            </button>
          </div>
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
