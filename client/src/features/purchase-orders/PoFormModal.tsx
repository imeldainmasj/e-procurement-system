import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  computePoTotals,
  formatRupiah,
  type PoDto,
  type PoUpdateInput,
  type PoUpdatePayload,
  poUpdateSchema,
  type QuotationDto,
  type SettingsDto,
} from '@sipita/shared';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { usePoMutations, useSettings } from '@/hooks/useProcurement';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';

type Props =
  | { mode: 'create'; quotation: QuotationDto; onClose: () => void }
  | { mode: 'edit'; po: PoDto; onClose: () => void };

function defaults(props: Props, settings: SettingsDto): PoUpdateInput {
  if (props.mode === 'edit') {
    const { po } = props;
    return {
      orderDate: po.orderDate,
      expectedDate: po.expectedDate ?? '',
      taxPercent: Number(po.taxPercent),
      deliveryAddress: po.deliveryAddress ?? '',
      terms: po.terms ?? '',
      notes: po.notes ?? '',
    };
  }
  const today = dayjs();
  const days = props.quotation.deliveryDays;
  return {
    orderDate: today.format('YYYY-MM-DD'),
    expectedDate: days !== null ? today.add(days, 'day').format('YYYY-MM-DD') : '',
    taxPercent: settings.PO_DEFAULT_TAX_PERCENT,
    deliveryAddress: settings.COMPANY_ADDRESS,
    terms: settings.PO_DEFAULT_TERMS ?? '',
    notes: '',
  };
}

export function PoFormModal(props: Props) {
  const settings = useSettings();
  if (!settings.data) {
    return (
      <Modal open onClose={props.onClose} title="Purchase Order">
        {settings.isError ? (
          <FormError error={settings.error} />
        ) : (
          <div className="skeleton h-64 w-full" />
        )}
      </Modal>
    );
  }
  return <PoForm {...props} settings={settings.data} />;
}

function PoForm(props: Props & { settings: SettingsDto }) {
  const navigate = useNavigate();
  const m = usePoMutations();
  const mutation = props.mode === 'create' ? m.create : m.update;
  const subtotal = Number(
    props.mode === 'create' ? props.quotation.totalAmount : props.po.subtotal,
  );
  const vendorName = props.mode === 'create' ? props.quotation.vendor.name : props.po.vendor.name;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PoUpdateInput, unknown, PoUpdatePayload>({
    resolver: zodResolver(poUpdateSchema),
    defaultValues: defaults(props, props.settings),
  });
  const taxPercent = Number(useWatch({ control, name: 'taxPercent' })) || 0;
  const totals = computePoTotals(subtotal, taxPercent);

  const onSubmit = handleSubmit((input) => {
    const onError = (err: unknown) => applyServerFieldErrors(err, setError);
    if (props.mode === 'create') {
      m.create.mutate(
        { ...input, quotationId: props.quotation.id },
        {
          onSuccess: (po) => {
            toast.success(`${po.number} dibuat sebagai draft`);
            props.onClose();
            navigate(`/purchase-order/${po.id}`);
          },
          onError,
        },
      );
    } else {
      m.update.mutate(
        { id: props.po.id, input },
        {
          onSuccess: () => {
            toast.success('Purchase Order diperbarui');
            props.onClose();
          },
          onError,
        },
      );
    }
  });

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.mode === 'create' ? 'Buat Purchase Order' : `Ubah ${props.po.number}`}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <p className="text-base-content/70 mb-2 text-sm">
          Vendor: <b>{vendorName}</b>. Item dan harga diambil dari penawaran pemenang.
        </p>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField label="Tanggal PO" required error={errors.orderDate?.message}>
            <input type="date" className="input w-full" {...register('orderDate')} />
          </FormField>
          <FormField label="Estimasi Tiba" error={errors.expectedDate?.message}>
            <input type="date" className="input w-full" {...register('expectedDate')} />
          </FormField>
          <FormField
            label="PPN (%)"
            required
            error={errors.taxPercent?.message}
            hint={`Default ${props.settings.PO_DEFAULT_TAX_PERCENT}%; isi 0 untuk vendor non-PKP`}
          >
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              className="input w-full"
              {...register('taxPercent')}
            />
          </FormField>
          <FormField
            label="Alamat Pengiriman"
            error={errors.deliveryAddress?.message}
            className="md:col-span-3"
          >
            <textarea className="textarea w-full" rows={2} {...register('deliveryAddress')} />
          </FormField>
          <FormField
            label="Syarat & Ketentuan"
            error={errors.terms?.message}
            className="md:col-span-3"
          >
            <textarea className="textarea w-full" rows={4} {...register('terms')} />
          </FormField>
          <FormField label="Catatan" error={errors.notes?.message} className="md:col-span-3">
            <textarea className="textarea w-full" rows={2} {...register('notes')} />
          </FormField>
        </div>

        <dl className="bg-base-200 rounded-box mt-2 grid grid-cols-3 gap-2 p-3 text-sm">
          <div>
            <dt className="text-base-content/60 text-xs">Subtotal</dt>
            <dd className="font-medium">{formatRupiah(totals.subtotal)}</dd>
          </div>
          <div>
            <dt className="text-base-content/60 text-xs">
              PPN {taxPercent.toLocaleString('id-ID')}%
            </dt>
            <dd className="font-medium">{formatRupiah(totals.taxAmount)}</dd>
          </div>
          <div>
            <dt className="text-base-content/60 text-xs">Total</dt>
            <dd className="text-base font-bold">{formatRupiah(totals.total)}</dd>
          </div>
        </dl>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <span className="loading loading-spinner loading-sm" />}
            {props.mode === 'create' ? 'Buat Draft PO' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
