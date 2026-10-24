import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  formatRupiah,
  type QuotationComparisonDto,
  type QuotationDto,
  type QuotationInput,
  quotationInputSchema,
  type QuotationPayload,
  VENDOR_STATUS_LABELS,
} from '@sipita/shared';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FileUpload } from '@/components/ui/FileUpload';
import { FormError } from '@/components/ui/FormError';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { useQuotationMutations } from '@/hooks/useProcurement';
import { useVendors } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { formatDate } from '@/utils/formatDate';

interface Props {
  comparison: QuotationComparisonDto;
  quotation: QuotationDto | null;
  onClose: () => void;
}

const today = () => formatDate(new Date(), 'YYYY-MM-DD');

/** Adds or edits one vendor's quotation: a unit price for every PR item, plus an optional file. */
export function QuotationFormModal({ comparison, quotation, onClose }: Props) {
  const { pr } = comparison;
  const m = useQuotationMutations();
  const mutation = quotation ? m.update : m.create;
  const [file, setFile] = useState<File | null>(null);
  const vendors = useVendors({ page: 1, limit: 100, sort: 'name:asc' });
  // Vendors that already quoted on this PR (except the one being edited) are not offered again.
  const taken = new Set(
    comparison.quotations.filter((q) => q.id !== quotation?.id).map((q) => q.vendor.id),
  );
  const vendorOptions = (vendors.data?.data ?? []).filter(
    (v) =>
      (v.status === 'ACTIVE' || v.status === 'UNDER_REVIEW' || v.id === quotation?.vendor.id) &&
      !taken.has(v.id),
  );

  const priceOf = (prItemId: string) => {
    const line = quotation?.items.find((i) => i.prItemId === prItemId);
    return line ? Number(line.unitPrice) : (undefined as unknown as number);
  };

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<QuotationInput, unknown, QuotationPayload>({
    resolver: zodResolver(quotationInputSchema),
    defaultValues: {
      vendorId: quotation?.vendor.id ?? '',
      quoteNumber: quotation?.quoteNumber ?? '',
      quoteDate: quotation?.quoteDate ?? today(),
      validUntil: quotation?.validUntil ?? '',
      deliveryDays: quotation?.deliveryDays ?? undefined,
      paymentTerms: quotation?.paymentTerms ?? '',
      notes: quotation?.notes ?? '',
      items: pr.items.map((item) => ({ prItemId: item.id, unitPrice: priceOf(item.id) })),
    },
  });
  const items = useWatch({ control, name: 'items' });
  const total = pr.items.reduce(
    (sum, item, i) => sum + (Number(items?.[i]?.unitPrice) || 0) * item.qty,
    0,
  );
  const approved = Number(comparison.approvedAmount);

  const onSubmit = handleSubmit(async (input) => {
    try {
      const saved = quotation
        ? await m.update.mutateAsync({ id: quotation.id, input })
        : await m.create.mutateAsync({ ...input, prId: pr.id });
      if (file) {
        try {
          await m.uploadFile.mutateAsync({ id: saved.id, file });
        } catch {
          toast.error('Penawaran tersimpan, tetapi file gagal diunggah. Coba unggah ulang.');
        }
      }
      toast.success(quotation ? 'Penawaran diperbarui' : 'Penawaran ditambahkan');
      onClose();
    } catch (err) {
      applyServerFieldErrors(err, setError);
    }
  });

  const busy = mutation.isPending || m.uploadFile.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title={quotation ? 'Ubah Penawaran' : 'Tambah Penawaran'}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate>
        <FormError error={mutation.error} />
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
          <FormField
            label="Vendor"
            required
            error={errors.vendorId?.message}
            className="md:col-span-2"
          >
            <select className="select w-full" {...register('vendorId')}>
              <option value="">Pilih vendor...</option>
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.code})
                  {v.status !== 'ACTIVE' && ` — ${VENDOR_STATUS_LABELS[v.status]}`}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Nomor Penawaran" required error={errors.quoteNumber?.message}>
            <input className="input w-full" {...register('quoteNumber')} />
          </FormField>
          <FormField label="Tanggal Penawaran" required error={errors.quoteDate?.message}>
            <input type="date" className="input w-full" {...register('quoteDate')} />
          </FormField>
          <FormField label="Berlaku Sampai" error={errors.validUntil?.message}>
            <input type="date" className="input w-full" {...register('validUntil')} />
          </FormField>
          <FormField label="Lama Pengiriman (hari)" error={errors.deliveryDays?.message}>
            <input
              type="number"
              min={0}
              className="input w-full"
              {...register('deliveryDays', {
                setValueAs: (v: string) => (v === '' ? null : Number(v)),
              })}
            />
          </FormField>
          <FormField
            label="Termin Pembayaran"
            error={errors.paymentTerms?.message}
            className="md:col-span-3"
          >
            <input
              className="input w-full"
              placeholder="mis. 30 hari setelah barang diterima"
              {...register('paymentTerms')}
            />
          </FormField>
        </div>

        <h4 className="text-base-content/70 mt-4 mb-2 text-sm font-semibold">Harga per Item</h4>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Jumlah</th>
                <th className="w-48">Harga Satuan *</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pr.items.map((item, i) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-base-content/60 text-xs">
                      Estimasi {formatRupiah(item.estimatedUnitPrice)}
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {item.qty} {item.unit}
                  </td>
                  <td>
                    <Controller
                      control={control}
                      name={`items.${i}.unitPrice`}
                      render={({ field }) => (
                        <CurrencyInput
                          className="input-sm"
                          value={field.value as number | null}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          error={Boolean(errors.items?.[i]?.unitPrice)}
                          aria-label={`Harga satuan ${item.name}`}
                        />
                      )}
                    />
                    {errors.items?.[i]?.unitPrice && (
                      <p className="text-error text-xs">{errors.items[i]?.unitPrice?.message}</p>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {formatRupiah((Number(items?.[i]?.unitPrice) || 0) * item.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right">
                  Total (sebelum PPN)
                </td>
                <td className="text-right text-base whitespace-nowrap">{formatRupiah(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {total > approved && (
          <div role="alert" className="alert alert-warning alert-soft mt-2 text-sm">
            <span>
              Total melebihi nilai yang disetujui di memo ({formatRupiah(approved)}) sebesar{' '}
              <b>{formatRupiah(total - approved)}</b>. Penawaran tetap dapat disimpan; pemilihan
              sebagai pemenang wajib disertai justifikasi.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <FormField label="Catatan" error={errors.notes?.message}>
            <textarea className="textarea w-full" rows={3} {...register('notes')} />
          </FormField>
          <FormField
            label={quotation?.attachment ? 'Ganti File Penawaran' : 'File Penawaran'}
            hint={quotation?.attachment ? `Saat ini: ${quotation.attachment.fileName}` : undefined}
          >
            <FileUpload file={file} onChange={setFile} disabled={busy} />
          </FormField>
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
