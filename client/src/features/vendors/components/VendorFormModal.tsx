import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  type VendorDto,
  type VendorInput,
  vendorInputSchema,
  type VendorPayload,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { vendorHooks } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  vendor: VendorDto | null;
  onClose: () => void;
}

export function VendorFormModal({ vendor, onClose }: Props) {
  const navigate = useNavigate();
  const create = vendorHooks.useCreate();
  const update = vendorHooks.useUpdate();
  const mutation = vendor ? update : create;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VendorInput, unknown, VendorPayload>({
    resolver: zodResolver(vendorInputSchema),
    defaultValues: {
      code: vendor?.code ?? '',
      name: vendor?.name ?? '',
      address: vendor?.address ?? '',
      picName: vendor?.picName ?? '',
      npwp: vendor?.npwp ?? '',
      email: vendor?.email ?? '',
      phone: vendor?.phone ?? '',
    },
  });

  const onSubmit = handleSubmit((input) => {
    const options = {
      onSuccess: (saved: VendorDto) => {
        toast.success(vendor ? 'Vendor diperbarui' : 'Vendor ditambahkan');
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
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="Kode Vendor" required error={errors.code?.message} hint="Contoh: V011">
            <input className="input w-full uppercase" {...register('code')} autoFocus />
          </FormField>
          <FormField
            label="Nama Vendor"
            required
            error={errors.name?.message}
            className="md:col-span-2"
          >
            <input className="input w-full" placeholder="PT ..." {...register('name')} />
          </FormField>
          <FormField
            label="Alamat"
            required
            error={errors.address?.message}
            className="md:col-span-3"
          >
            <textarea className="textarea w-full" rows={2} {...register('address')} />
          </FormField>
          <FormField label="PIC Vendor" required error={errors.picName?.message}>
            <input className="input w-full" {...register('picName')} />
          </FormField>
          <FormField label="NPWP" error={errors.npwp?.message} hint="15 atau 16 digit">
            <input
              className="input w-full"
              placeholder="01.234.567.8-901.000"
              {...register('npwp')}
            />
          </FormField>
          <FormField label="Telepon" error={errors.phone?.message}>
            <input className="input w-full" {...register('phone')} />
          </FormField>
          <FormField label="Email" error={errors.email?.message} className="md:col-span-2">
            <input type="email" className="input w-full" {...register('email')} />
          </FormField>
        </div>

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
