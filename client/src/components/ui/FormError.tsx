import { getErrorMessage } from '@/api/client';

/** Top-of-form alert for a failed mutation. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="alert alert-error alert-soft mb-4">
      <span>{getErrorMessage(error)}</span>
    </div>
  );
}
