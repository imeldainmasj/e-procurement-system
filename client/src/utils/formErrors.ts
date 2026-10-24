import { AxiosError } from 'axios';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApiErrorBody } from '@sipita/shared';

/** Copies server VALIDATION_ERROR details (`{ path, message }`) onto form fields. Returns true if any were applied. */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (!(error instanceof AxiosError)) return false;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details ?? [];
  let applied = false;
  for (const detail of details) {
    if (detail && typeof detail === 'object' && 'path' in detail && 'message' in detail) {
      const { path, message } = detail as { path: string; message: string };
      if (path) {
        setError(path as Path<T>, { type: 'server', message });
        applied = true;
      }
    }
  }
  return applied;
}
