import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  error?: string | undefined;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, error, required, hint, children, className }: FormFieldProps) {
  return (
    <fieldset className={`fieldset ${className ?? ''}`}>
      <legend className="fieldset-legend">
        {label}
        {required && <span className="text-error">*</span>}
      </legend>
      {children}
      {error ? <p className="text-error">{error}</p> : hint && <p className="label">{hint}</p>}
    </fieldset>
  );
}
