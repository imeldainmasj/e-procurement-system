import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  type VendorDto,
  type VendorInput,
  vendorInputSchema,
  type VendorPayload,
} from '@sipita/shared';
import { CheckboxGroup } from '@/components/ui/CheckboxGroup';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useCategoryOptions } from '@/hooks/useMasterData';
import { useVendorMutations } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  vendor: VendorDto | null;
  onClose: () => void;
}

export function VendorFormModal({ vendor, onClose }: Props) {
  const navigate = useNavigate();
  const { create, update } = useVendorMutations();
  const mutation = vendor ? update : create;
  const categories = useCategoryOptions();
  const categoryOptions = (categories.data?.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VendorInput, unknown, VendorPayload>({
    resolver: zodResolver(vendorInputSchema),
    defaultValues: {
      code: vendor?.code ?? '',
      name: vendor?.name ?? '',
      npwp: vendor?.npwp ?? '',
      address: vendor?.address ?? '',
      city: vendor?.city ?? '',
      picName: vendor?.picName ?? '',
      email: vendor?.email ?? '',
      phone: vendor?.phone ?? '',
      bankName: vendor?.bankName ?? '',
      bankAccount: vendor?.bankAccount ?? '',
      bankAccountName: vendor?.bankAccountName ?? '',
      categoryIds: vendor?.categories.map((c) => c.id) ?? [],
      notes: vendor?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: (saved: VendorDto) => {
        toast.success(
          vendor ? 'Vendor diperbarui' : 'Vendor ditambahkan dengan status Dalam Review',
        );
        onClose();
        if (!vendor) navigate(`/vendor/${saved.id}`);
      },
      onError: (err: unknown) => applyServerFieldErrors(err, setError),
    };
    if (vendor) update.mutate({ id: vendor.id, input }, options);
    else create.mutate(input, options);
  });

  return (
    <Modal open onClose={onClose} title={vendor ? 'Ubah Vendor' : 'Tambah Vendor'} size="lg">
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <h4 className="text-base-content/70 text-sm font-semibold">Profil</h4>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="Kode" required error={errors.code?.message} hint="Contoh: VND-009">
            <input className="input w-full uppercase" {...register('code')} autoFocus />
          </FormField>
          <FormField
            label="Nama Vendor"
            required
            error={errors.name?.message}
            className="md:col-span-2"
          >
            <input className="input w-full" placeholder="PT / CV ..." {...register('name')} />
          </FormField>
          <FormField label="NPWP" error={errors.npwp?.message} hint="15 atau 16 digit">
            <input
              className="input w-full"
              placeholder="01.234.567.8-901.000"
              {...register('npwp')}
            />
          </FormField>
          <FormField label="Kota" error={errors.city?.message}>
            <input className="input w-full" {...register('city')} />
          </FormField>
          <FormField label="Alamat" error={errors.address?.message} className="md:col-span-3">
            <textarea className="textarea w-full" rows={2} {...register('address')} />
          </FormField>
        </div>

        <h4 className="text-base-content/70 mt-4 text-sm font-semibold">Kontak</h4>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="Nama PIC" error={errors.picName?.message}>
            <input className="input w-full" {...register('picName')} />
          </FormField>
          <FormField label="Email" error={errors.email?.message}>
            <input type="email" className="input w-full" {...register('email')} />
          </FormField>
          <FormField label="Telepon" error={errors.phone?.message}>
            <input className="input w-full" {...register('phone')} />
          </FormField>
        </div>

        <h4 className="text-base-content/70 mt-4 text-sm font-semibold">Rekening Bank</h4>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="Bank" error={errors.bankName?.message}>
            <input
              className="input w-full"
              placeholder="BCA, Mandiri, ..."
              {...register('bankName')}
            />
          </FormField>
          <FormField label="Nomor Rekening" error={errors.bankAccount?.message}>
            <input className="input w-full" inputMode="numeric" {...register('bankAccount')} />
          </FormField>
          <FormField label="Atas Nama" error={errors.bankAccountName?.message}>
            <input className="input w-full" {...register('bankAccountName')} />
          </FormField>
        </div>

        <FormField
          label="Kategori yang Dipasok"
          error={errors.categoryIds?.message}
          className="mt-4"
        >
          <Controller
            control={control}
            name="categoryIds"
            render={({ field }) => (
              <CheckboxGroup
                name="categoryIds"
                options={categoryOptions}
                value={field.value ?? []}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
        <FormField label="Catatan" error={errors.notes?.message}>
          <textarea className="textarea w-full" rows={2} {...register('notes')} />
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
