import { isAllowedUpload } from '@sipita/shared';

export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 10);

/** Client-side mirror of the server checks, for instant feedback. */
export function validateUpload(file: File, maxMb = MAX_UPLOAD_MB): string | null {
  if (!isAllowedUpload(file.type, file.name))
    return 'Tipe file tidak diizinkan. Gunakan PDF, JPG, PNG, XLSX, atau DOCX.';
  if (file.size > maxMb * 1024 * 1024) return `Ukuran file maksimal ${maxMb} MB`;
  return null;
}
