import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Info, Save, Send } from 'lucide-react';
import { useState } from 'react';
import { type Resolver, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  formatRupiah,
  PR_PRIORITIES,
  PR_PRIORITY_LABELS,
  type PrDto,
  type PrPayload,
  prInputSchema,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { approvalRulesApi } from '@/api/master.api';
import { ApprovalPath } from '@/components/ui/ApprovalPath';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { useDebounce } from '@/hooks/useDebounce';
import { usePrMutations, usePurchaseRequest } from '@/hooks/usePurchaseRequests';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { PrItemsEditor } from './components/PrItemsEditor';
import { computeTotal, type PrFormValues, toFormValues } from './prForm';

const today = () => dayjs().format('YYYY-MM-DD');

function ApprovalPreview({ total }: { total: number }) {
  const amount = useDebounce(total, 500);
  const preview = useQuery({
    queryKey: ['approval-rules', 'resolve', amount],
    queryFn: () => approvalRulesApi.resolve(amount),
    enabled: amount > 0,
    retry: false,
  });
  if (amount <= 0 || preview.isPending) return null;
  return (
    <div role="note" className="alert alert-info alert-soft items-start text-sm">
      <Info className="size-4" />
      {preview.isError ? (
        <span>{getErrorMessage(preview.error)}</span>
      ) : (
        <div className="space-y-1">
          <span>Jika barang tidak tersedia di gudang, pengajuan ini memerlukan persetujuan:</span>
          <ApprovalPath levels={preview.data.levels} />
        </div>
      )}
    </div>
  );
}

/** Create (/pengajuan/baru) and edit (/pengajuan/:id/ubah) a draft PR. */
export function PrFormPage() {
  const { id } = useParams();
  const existing = usePurchaseRequest(id);

  if (id && existing.isPending) return <div className="skeleton h-96 w-full" />;
  if (id && existing.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(existing.error)}</span>
      </div>
    );
  }
  if (existing.data && existing.data.status !== 'DRAFT') {
    return (
      <div role="alert" className="alert alert-warning">
        <span>Hanya pengajuan berstatus Draft yang dapat diubah.</span>
        <Link to={`/pengajuan/${existing.data.id}`} className="btn btn-sm">
          Lihat pengajuan
        </Link>
      </div>
    );
  }
  return <PrForm pr={existing.data} />;
}

function PrForm({ pr }: { pr: PrDto | undefined }) {
  const navigate = useNavigate();
  const { create, update, submit } = usePrMutations();
  const [pendingSubmit, setPendingSubmit] = useState<PrPayload | null>(null);
  const saving = create.isPending || update.isPending || submit.isPending;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<PrFormValues, unknown, PrPayload>({
    // UI-only row fields (mode, itemLabel) are stripped by the schema.
    resolver: zodResolver(prInputSchema) as unknown as Resolver<PrFormValues, unknown, PrPayload>,
    defaultValues: toFormValues(pr, dayjs().add(7, 'day').format('YYYY-MM-DD')),
  });

  const items = useWatch({ control, name: 'items' });
  const total = computeTotal(items ?? []);

  const save = async (input: PrPayload): Promise<PrDto | null> => {
    try {
      return pr ? await update.mutateAsync({ id: pr.id, input }) : await create.mutateAsync(input);
    } catch (err) {
      applyServerFieldErrors(err, setError);
      return null;
    }
  };

  const onSaveDraft = handleSubmit(async (input) => {
    const saved = await save(input);
    if (saved) {
      toast.success('Draft pengajuan disimpan');
      navigate(`/pengajuan/${saved.id}`);
    }
  });

  const onSaveAndSubmit = handleSubmit((input) => setPendingSubmit(input));

  const confirmSubmit = async () => {
    if (!pendingSubmit) return;
    const saved = await save(pendingSubmit);
    setPendingSubmit(null);
    if (!saved) return;
    try {
      const submitted = await submit.mutateAsync(saved.id);
      toast.success(`Pengajuan ${submitted.number} berhasil diajukan`);
      navigate(`/pengajuan/${saved.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
      navigate(`/pengajuan/${saved.id}`);
    }
  };

  return (
    <>
      <PageHeader
        title={pr ? 'Ubah Draft Pengajuan' : 'Buat Pengajuan'}
        description="Pengajuan akan dicek ketersediaannya oleh Gudang IT sebelum masuk proses approval."
        actions={
          <Link to={pr ? `/pengajuan/${pr.id}` : '/pengajuan'} className="btn btn-ghost btn-sm">
            <ArrowLeft className="size-4" /> Kembali
          </Link>
        }
      />
      <form onSubmit={onSaveDraft} noValidate className="space-y-4">
        <FormError error={create.error ?? update.error} />

        <div className="card">
          <div className="card-body grid grid-cols-1 gap-x-4 p-4 md:grid-cols-3">
            <FormField
              label="Judul Pengajuan"
              required
              error={errors.title?.message}
              className="md:col-span-3"
            >
              <input
                className="input w-full"
                placeholder="mis. Laptop untuk staf baru"
                {...register('title')}
                autoFocus
              />
            </FormField>
            <FormField label="Prioritas" required error={errors.priority?.message}>
              <select className="select w-full" {...register('priority')}>
                {PR_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PR_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tanggal Dibutuhkan" required error={errors.neededDate?.message}>
              <input
                type="date"
                min={today()}
                className="input w-full"
                {...register('neededDate')}
              />
            </FormField>
            <FormField
              label="Justifikasi"
              required
              error={errors.justification?.message}
              className="md:col-span-3"
            >
              <textarea
                className="textarea w-full"
                rows={3}
                placeholder="Jelaskan alasan dan kebutuhan pengadaan"
                {...register('justification')}
              />
            </FormField>
          </div>
        </div>

        <SectionCard title="Daftar Item" bodyClassName="flex flex-col gap-4">
          <PrItemsEditor
            control={control}
            register={register}
            setValue={setValue}
            errors={errors}
          />
          <div className="border-base-300 flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <span className="text-base-content/70 text-sm">Estimasi total</span>
            <span className="text-xl font-bold">{formatRupiah(total)}</span>
          </div>
          <ApprovalPreview total={total} />
        </SectionCard>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="submit" className="btn btn-soft btn-primary" disabled={saving}>
            <Save className="size-4" /> Simpan Draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={onSaveAndSubmit}
          >
            <Send className="size-4" /> Simpan & Ajukan
          </button>
        </div>
      </form>

      <ConfirmModal
        open={pendingSubmit !== null}
        onClose={() => setPendingSubmit(null)}
        onConfirm={() => void confirmSubmit()}
        loading={saving}
        title="Ajukan Pengajuan"
        confirmLabel="Ajukan"
        message={
          <>
            Ajukan pengajuan senilai <b>{formatRupiah(total)}</b>? Setelah diajukan, pengajuan tidak
            dapat diubah lagi dan akan diteruskan ke Gudang IT untuk cek stok.
          </>
        }
      />
    </>
  );
}
