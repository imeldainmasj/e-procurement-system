import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { type SettingsDto, type SettingsInput, settingsInputSchema } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { useSettings, useUpdateSettings } from '@/hooks/useProcurement';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

function SettingsForm({ settings }: { settings: SettingsDto }) {
  const update = useUpdateSettings();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsInput, unknown, SettingsDto>({
    resolver: zodResolver(settingsInputSchema),
    defaultValues: { ...settings, PO_DEFAULT_TERMS: settings.PO_DEFAULT_TERMS ?? '' },
  });

  const onSubmit = handleSubmit((input) =>
    update.mutate(input, {
      onSuccess: (saved) => {
        toast.success('Pengaturan disimpan');
        reset({ ...saved, PO_DEFAULT_TERMS: saved.PO_DEFAULT_TERMS ?? '' });
      },
      onError: (err) => applyServerFieldErrors(err, setError),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError error={update.error} />
      <div className="card">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Identitas Perusahaan</h2>
          <p className="text-base-content/60 text-sm">Ditampilkan di kop dan alamat kirim PO.</p>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <FormField label="Nama Perusahaan" required error={errors.COMPANY_NAME?.message}>
              <input className="input w-full" {...register('COMPANY_NAME')} />
            </FormField>
            <FormField
              label="Alamat (default alamat pengiriman)"
              required
              error={errors.COMPANY_ADDRESS?.message}
            >
              <textarea className="textarea w-full" rows={2} {...register('COMPANY_ADDRESS')} />
            </FormField>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-body p-4">
          <h2 className="card-title text-base">Pengadaan</h2>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <FormField
              label="Minimal Jumlah Penawaran"
              required
              error={errors.MIN_QUOTATIONS?.message}
              hint="Di bawah jumlah ini, pemilihan pemenang wajib disertai justifikasi."
            >
              <input
                type="number"
                min={1}
                max={10}
                className="input w-full"
                {...register('MIN_QUOTATIONS')}
              />
            </FormField>
            <FormField
              label="PPN Default (%)"
              required
              error={errors.PO_DEFAULT_TAX_PERCENT?.message}
              hint="Nilai awal pada form PO; tetap bisa diubah per PO."
            >
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                className="input w-full"
                {...register('PO_DEFAULT_TAX_PERCENT')}
              />
            </FormField>
            <FormField
              label="Syarat & Ketentuan Default PO"
              error={errors.PO_DEFAULT_TERMS?.message}
              className="md:col-span-2"
            >
              <textarea className="textarea w-full" rows={4} {...register('PO_DEFAULT_TERMS')} />
            </FormField>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={!isDirty || update.isPending}>
          {update.isPending && <span className="loading loading-spinner loading-sm" />}
          Simpan Pengaturan
        </button>
      </div>
    </form>
  );
}

export function GeneralSettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader
        title="Pengaturan Umum"
        description="Identitas perusahaan dan aturan pengadaan."
      />
      {settings.isPending ? (
        <div className="skeleton h-96 w-full" />
      ) : settings.isError ? (
        <div role="alert" className="alert alert-error">
          <span>{getErrorMessage(settings.error)}</span>
        </div>
      ) : (
        <SettingsForm settings={settings.data} />
      )}
    </>
  );
}
