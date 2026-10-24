import { Controller, useForm } from 'react-hook-form';
import { type SettingsDto, type SettingsInput, settingsInputSchema } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

/** Reminder days are edited as "90, 60, 30" text. */
type FormValues = Omit<SettingsInput, 'CONTRACT_REMINDER_DAYS'> & {
  CONTRACT_REMINDER_DAYS: string;
};

const toForm = (s: SettingsDto): FormValues => ({
  ...s,
  CONTRACT_REMINDER_DAYS: s.CONTRACT_REMINDER_DAYS.join(', '),
});

const parseDays = (text: string) =>
  text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);

function SettingsForm({ settings }: { settings: SettingsDto }) {
  const update = useUpdateSettings();
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ defaultValues: toForm(settings) });

  const onSubmit = handleSubmit((values) => {
    const parsed = settingsInputSchema.safeParse({
      ...values,
      CONTRACT_REMINDER_DAYS: parseDays(values.CONTRACT_REMINDER_DAYS),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormValues;
        setError(field, { message: issue.message });
      }
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: (saved) => {
        toast.success('Pengaturan disimpan');
        reset(toForm(saved));
      },
      onError: (err) => applyServerFieldErrors(err, setError),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormError error={update.error} />
      <SectionCard
        title="Metode Pengadaan & PVP Forum"
        description="Ambang dalam IDR. Dipakai untuk saran metode, penentuan PVP wajib, dan peringatan."
      >
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormField
            label="Ambang Tender"
            required
            error={errors.TENDER_MIN_AMOUNT?.message}
            hint="Nilai di atas ambang ini → Tender; sama atau di bawahnya → Bidding."
          >
            <Controller
              control={control}
              name="TENDER_MIN_AMOUNT"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value as number}
                  onChange={field.onChange}
                  error={Boolean(errors.TENDER_MIN_AMOUNT)}
                />
              )}
            />
          </FormField>
          <FormField
            label="Ambang Nilai PVP"
            required
            error={errors.PVP_MIN_AMOUNT?.message}
            hint="PVP wajib jika nilai di atas ambang ini (lihat juga ambang kenaikan)."
          >
            <Controller
              control={control}
              name="PVP_MIN_AMOUNT"
              render={({ field }) => (
                <CurrencyInput
                  value={field.value as number}
                  onChange={field.onChange}
                  error={Boolean(errors.PVP_MIN_AMOUNT)}
                />
              )}
            />
          </FormField>
          <FormField
            label="Ambang Kenaikan YoY PVP (%)"
            required
            error={errors.PVP_MIN_INCREASE_PERCENT?.message}
            hint="Untuk pengadaan dengan data tahun sebelumnya."
          >
            <input
              type="number"
              step="0.01"
              min={0}
              className="input w-full"
              {...register('PVP_MIN_INCREASE_PERCENT')}
            />
          </FormField>
          <FormField
            label="Minimal Approval Direktur"
            required
            error={errors.PVP_MIN_DIRECTOR_APPROVALS?.message}
            hint="PVP dianggap selesai jika jumlah direktur yang menyetujui mencapai angka ini."
          >
            <input
              type="number"
              min={1}
              className="input w-full"
              {...register('PVP_MIN_DIRECTOR_APPROVALS')}
            />
          </FormField>
        </div>
      </SectionCard>
      <SectionCard title="Monitoring & Pengingat">
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormField
            label="Batas Hari Tanpa Update"
            required
            error={errors.STALE_WORK_DAYS?.message}
            hint="Pekerjaan aktif yang tidak di-update selama ini ditandai dan diingatkan."
          >
            <input
              type="number"
              min={1}
              className="input w-full"
              {...register('STALE_WORK_DAYS')}
            />
          </FormField>
          <FormField
            label="Pengingat Kontrak (hari sebelum berakhir)"
            required
            error={errors.CONTRACT_REMINDER_DAYS?.message}
            hint="Pisahkan dengan koma, mis. 90, 60, 30."
          >
            <input className="input w-full" {...register('CONTRACT_REMINDER_DAYS')} />
          </FormField>
        </div>
      </SectionCard>
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
        title="Ambang & Pengaturan"
        description="Ambang metode pengadaan, PVP Forum, dan pengingat. Perubahan berlaku untuk data berikutnya."
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
