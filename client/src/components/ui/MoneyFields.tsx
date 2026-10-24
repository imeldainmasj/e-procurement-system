import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { toIdr } from '@sipita/shared';
import { CURRENCIES } from '@/utils/currencies';
import { formatCurrency } from '@/utils/formatCurrency';
import { CurrencyInput } from './CurrencyInput';
import { FormField } from './FormField';

interface MoneyFieldsProps<T extends FieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  /** Field names; default amount / currency / exchangeRate. */
  names?: { amount: Path<T>; currency: Path<T>; exchangeRate: Path<T> };
  label?: string;
  required?: boolean;
}

/**
 * Currency + amount + rate to IDR (CLAUDE.md §9); the rate is hidden for IDR and the IDR
 * equivalent is previewed. Renders three grid cells.
 */
export function MoneyFields<T extends FieldValues>({
  control,
  register,
  errors,
  names = {
    amount: 'amount' as Path<T>,
    currency: 'currency' as Path<T>,
    exchangeRate: 'exchangeRate' as Path<T>,
  },
  label = 'Nilai',
  required = true,
}: MoneyFieldsProps<T>) {
  const [currency, amount, rate] = useWatch({
    control,
    name: [names.currency, names.amount, names.exchangeRate],
  }) as [string | undefined, number | null | undefined, number | string | undefined];
  const isIdr = (currency ?? 'IDR') === 'IDR';
  const errorOf = (name: Path<T>) => errors[name]?.message as string | undefined;
  const options = CURRENCIES.includes(currency ?? 'IDR') ? CURRENCIES : [...CURRENCIES, currency!];

  return (
    <>
      <FormField label="Mata Uang" required={required} error={errorOf(names.currency)}>
        <select className="select w-full" {...register(names.currency)}>
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={label} required={required} error={errorOf(names.amount)}>
        <Controller
          control={control}
          name={names.amount}
          render={({ field }) => (
            <CurrencyInput
              currency={currency ?? 'IDR'}
              value={field.value as number | null}
              onChange={field.onChange}
              error={Boolean(errors[names.amount])}
            />
          )}
        />
      </FormField>
      {isIdr ? (
        <div className="hidden md:block" />
      ) : (
        <FormField
          label="Kurs ke IDR"
          required
          error={errorOf(names.exchangeRate)}
          hint={
            typeof amount === 'number' && amount > 0
              ? `= ${formatCurrency(toIdr(amount, Number(rate) || 0))}`
              : undefined
          }
        >
          <input
            type="number"
            step="0.01"
            min={0}
            className="input w-full"
            {...register(names.exchangeRate)}
          />
        </FormField>
      )}
    </>
  );
}
