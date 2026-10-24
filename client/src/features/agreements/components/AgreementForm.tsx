import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  AGREEMENT_TYPE_LABELS,
  AGREEMENT_TYPES,
  agreementInputSchema,
  type AgreementDto,
  type AgreementInput,
  type AgreementPayload,
} from '@sipita/shared';
import { agreementsApi } from '@/api/documents.api';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { MoneyFields } from '@/components/ui/MoneyFields';
import { useDocumentMutation, useWorkDocuments } from '@/hooks/useDocuments';
import { useUserOptions } from '@/hooks/useMasterData';
import { vendorHooks } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

interface Props {
  workId: string;
  agreement: AgreementDto | null;
  /** Prefill for a new agreement (from the work). */
  defaults?: Partial<AgreementInput>;
  onClose: () => void;
}

/** Agreement of a work; 1 agreement ↔ 1 PO of that work. */
export function AgreementForm({ workId, agreement, defaults, onClose }: Props) {
  const docs = useWorkDocuments(workId);
  const users = useUserOptions();
  const vendors = vendorHooks.useList({ page: 1, limit: 100, sort: 'name:asc' });
  const save = useDocumentMutation((input: AgreementPayload) =>
    agreementsApi.save(input, agreement?.id),
  );
  // POs without an agreement, plus the current one when editing.
  const pos = (docs.data?.purchaseOrders ?? []).filter(
    (po) => !po.agreement || po.agreement.id === agreement?.id,
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AgreementInput, unknown, AgreementPayload>({
    resolver: zodResolver(agreementInputSchema),
    defaultValues: {
      workId,
      agreementNo: agreement?.agreementNo ?? '',
      agreementType: agreement?.agreementType ?? 'NEW',
      title: agreement?.title ?? '',
      vendorId: agreement?.vendor.id ?? '',
      poId: agreement?.po.id ?? '',
      picId: agreement?.pic.id ?? '',
      periodStart: agreement?.periodStart ?? '',
      periodEnd: agreement?.periodEnd ?? '',
      amount: agreement?.amount ?? 0,
      currency: agreement?.currency ?? 'IDR',
      exchangeRate: agreement?.exchangeRate ?? 1,
      ...(!agreement && defaults),
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={agreement ? `Ubah ${agreement.agreementNo}` : 'Catat Agreement'}
      size="lg"
    >
      <form
        onSubmit={handleSubmit((input) =>
          save.mutate(input, {
            onSuccess: () => {
              toast.success('Agreement disimpan');
              onClose();
            },
            onError: (err) => applyServerFieldErrors(err, setError),
          }),
        )}
        noValidate
      >
        <FormError error={save.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="No. Agreement" required error={errors.agreementNo?.message}>
            <input className="input w-full" {...register('agreementNo')} autoFocus />
          </FormField>
          <FormField label="Tipe Agreement" required error={errors.agreementType?.message}>
            <select className="select w-full" {...register('agreementType')}>
              {AGREEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AGREEMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="No. PO"
            required
            error={errors.poId?.message}
            hint="1 agreement untuk 1 PO"
          >
            <select className="select w-full" {...register('poId')}>
              <option value="">— Pilih PO —</option>
              {pos.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNo} — {po.poName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Judul Agreement"
            required
            error={errors.title?.message}
            className="md:col-span-3"
          >
            <input className="input w-full" {...register('title')} />
          </FormField>
          <FormField
            label="Vendor"
            required
            error={errors.vendorId?.message}
            className="md:col-span-2"
          >
            <select className="select w-full" {...register('vendorId')}>
              <option value="">— Pilih vendor —</option>
              {vendors.data?.data.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="PIC" required error={errors.picId?.message}>
            <select className="select w-full" {...register('picId')}>
              <option value="">— Pilih —</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Periode Mulai" required error={errors.periodStart?.message}>
            <input type="date" className="input w-full" {...register('periodStart')} />
          </FormField>
          <FormField label="Periode Selesai" required error={errors.periodEnd?.message}>
            <input type="date" className="input w-full" {...register('periodEnd')} />
          </FormField>
          <div className="hidden md:block" />
          <MoneyFields control={control} register={register} errors={errors} />
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
