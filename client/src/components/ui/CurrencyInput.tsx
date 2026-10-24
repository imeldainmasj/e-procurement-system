import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

const idr = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  error?: boolean;
}

/** Shows "Rp 1.250.000" while exposing a plain number (whole rupiah) as the value. */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, error, className, ...props }, ref) => (
    <label className={cn('input w-full', error && 'input-error', className)}>
      <span className="text-base-content/60">Rp</span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        className="grow"
        value={value === null || value === undefined ? '' : idr.format(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits === '' ? null : Number(digits));
        }}
        {...props}
      />
    </label>
  ),
);
CurrencyInput.displayName = 'CurrencyInput';
