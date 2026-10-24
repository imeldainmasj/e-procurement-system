import { Plus, Trash2 } from 'lucide-react';
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import { formatRupiah, type PrPayload } from '@sipita/shared';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { emptyItemRow, type PrFormValues } from '../prForm';
import { ItemPicker } from './ItemPicker';

interface Props {
  control: Control<PrFormValues, unknown, PrPayload>;
  register: UseFormRegister<PrFormValues>;
  setValue: UseFormSetValue<PrFormValues>;
  errors: FieldErrors<PrFormValues>;
}

export function PrItemsEditor({ control, register, setValue, errors }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const rows = useWatch({ control, name: 'items' });

  return (
    <div className="space-y-3">
      {typeof errors.items?.message === 'string' && (
        <p className="text-error text-sm">{errors.items.message}</p>
      )}
      {fields.map((field, index) => {
        const row = rows?.[index];
        const rowErrors = errors.items?.[index];
        const subtotal = (Number(row?.qty) || 0) * (Number(row?.estimatedUnitPrice) || 0);
        const isCatalog = row?.mode !== 'manual';

        return (
          <div key={field.id} className="border-base-300 rounded-box space-y-2 border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base-content/60 text-sm font-medium">#{index + 1}</span>
                <div className="join">
                  <button
                    type="button"
                    className={`join-item btn btn-xs ${isCatalog ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setValue(`items.${index}.mode`, 'catalog');
                      setValue(`items.${index}.freeTextName`, '');
                    }}
                  >
                    Katalog
                  </button>
                  <button
                    type="button"
                    className={`join-item btn btn-xs ${!isCatalog ? 'btn-primary' : ''}`}
                    onClick={() => {
                      setValue(`items.${index}.mode`, 'manual');
                      setValue(`items.${index}.itemId`, '');
                      setValue(`items.${index}.itemLabel`, '');
                    }}
                  >
                    Manual
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                aria-label={`Hapus item ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
              <div className="col-span-2 md:col-span-5">
                {isCatalog ? (
                  <ItemPicker
                    selectedLabel={row?.itemLabel ?? ''}
                    error={Boolean(rowErrors?.itemId)}
                    onSelect={(item) => {
                      setValue(`items.${index}.itemId`, item.id, { shouldValidate: true });
                      setValue(`items.${index}.itemLabel`, `${item.code} — ${item.name}`);
                      setValue(`items.${index}.unit`, item.unit);
                    }}
                  />
                ) : (
                  <input
                    className={`input input-sm w-full ${rowErrors?.itemId || rowErrors?.freeTextName ? 'input-error' : ''}`}
                    placeholder="Nama barang / jasa"
                    aria-label={`Nama item ${index + 1}`}
                    {...register(`items.${index}.freeTextName`)}
                  />
                )}
                {(rowErrors?.itemId ?? rowErrors?.freeTextName) && (
                  <p className="text-error mt-1 text-xs">
                    {(rowErrors.itemId ?? rowErrors.freeTextName)?.message}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <input
                  type="number"
                  min={1}
                  className={`input input-sm w-full ${rowErrors?.qty ? 'input-error' : ''}`}
                  placeholder="Jumlah"
                  aria-label={`Jumlah item ${index + 1}`}
                  {...register(`items.${index}.qty`)}
                />
                {rowErrors?.qty && (
                  <p className="text-error mt-1 text-xs">{rowErrors.qty.message}</p>
                )}
              </div>
              <div className="md:col-span-2">
                <input
                  className={`input input-sm w-full ${rowErrors?.unit ? 'input-error' : ''}`}
                  placeholder="Satuan"
                  aria-label={`Satuan item ${index + 1}`}
                  readOnly={isCatalog}
                  {...register(`items.${index}.unit`)}
                />
                {rowErrors?.unit && (
                  <p className="text-error mt-1 text-xs">{rowErrors.unit.message}</p>
                )}
              </div>
              <div className="col-span-2 md:col-span-3">
                <Controller
                  control={control}
                  name={`items.${index}.estimatedUnitPrice`}
                  render={({ field: priceField }) => (
                    <CurrencyInput
                      className="input-sm"
                      value={priceField.value as number | null}
                      onChange={(v) => priceField.onChange(v ?? 0)}
                      aria-label={`Estimasi harga satuan item ${index + 1}`}
                      error={Boolean(rowErrors?.estimatedUnitPrice)}
                    />
                  )}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                className="input input-sm input-ghost w-full md:w-2/3"
                placeholder="Catatan (opsional): merek, spesifikasi khusus, ..."
                aria-label={`Catatan item ${index + 1}`}
                {...register(`items.${index}.notes`)}
              />
              <span className="text-sm">
                Subtotal: <b>{formatRupiah(subtotal)}</b>
              </span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-soft btn-secondary btn-sm"
        onClick={() => append(emptyItemRow())}
        disabled={fields.length >= 50}
      >
        <Plus className="size-4" /> Tambah Item
      </button>
    </div>
  );
}
