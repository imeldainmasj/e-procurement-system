import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  addendumInputSchema,
  type AddendumDto,
  type AddendumInput,
  type AddendumPayload,
} from '@sipita/shared';
import { agreementsApi } from '@/api/documents.api';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { MoneyFields } from '@/components/ui/MoneyFields';
import { useDocumentMutation, useWorkDocuments } from '@/hooks/useDocuments';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  agreement: { id: string; agreementNo: string };
  /** The Perpanjangan Khusus work that produces the addendum. */
  workId: string;
  addendum: AddendumDto | null;
  onClose: () => void;
}

/** Addendum on the PK source agreement (CLAUDE.md §5.4, PK result = Addendum). */
export function AddendumForm({ agreement, workId, addendum, onClose }: Props) {
  const docs = useWorkDocuments(workId);
  const save = useDocumentMutation((input: AddendumPayload) =>
    agreementsApi.saveAddendum(agreement.id, input, addendum?.id),
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AddendumInput, unknown, AddendumPayload>({
    resolver: zodResolver(addendumInputSchema),
    defaultValues: {
      workId,
      addendumNo: addendum?.addendumNo ?? '',
      title: addendum?.title ?? '',
      addendumDate: addendum?.addendumDate ?? '',
      newPeriodEnd: addendum?.newPeriodEnd ?? '',
      valueChange: addendum?.valueChange ?? null,
      currency: addendum?.currency ?? 'IDR',
      exchangeRate: addendum?.exchangeRate ?? 1,
      poId: addendum?.po?.id ?? '',
      notes: addendum?.notes ?? '',
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={addendum ? `Ubah ${addendum.addendumNo}` : `Catat Addendum ${agreement.agreementNo}`}
      size="lg"
    >
      <form
        onSubmit={handleSubmit((input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success('Addendum disimpan');
              onClose();
            },
            onError: (err) => applyServerFieldErrors(err, setError),
          }),
        )}
        noValidate
      >
        <FormError error={save.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="No. Addendum" required error={errors.addendumNo?.message}>
            <input className="input w-full" {...register('addendumNo')} autoFocus />
          </FormField>
          <FormField label="Tanggal Addendum" required error={errors.addendumDate?.message}>
            <input type="date" className="input w-full" {...register('addendumDate')} />
          </FormField>
          <FormField label="Periode Selesai Baru" error={errors.newPeriodEnd?.message}>
            <input type="date" className="input w-full" {...register('newPeriodEnd')} />
          </FormField>
          <FormField
            label="Judul Addendum"
            required
            error={errors.title?.message}
            className="md:col-span-2"
          >
            <input className="input w-full" {...register('title')} />
          </FormField>
          <FormField label="No. PO Terkait" error={errors.poId?.message}>
            <select className="select w-full" {...register('poId')}>
              <option value="">—</option>
              {docs.data?.purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNo}
                </option>
              ))}
            </select>
          </FormField>
          <MoneyFields
            control={control}
            register={register}
            errors={errors}
            label="Perubahan Nilai"
            required={false}
            names={{ amount: 'valueChange', currency: 'currency', exchangeRate: 'exchangeRate' }}
          />
          <FormField label="Catatan" error={errors.notes?.message} className="md:col-span-3">
            <textarea className="textarea w-full" rows={2} {...register('notes')} />
          </FormField>
        </div>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
