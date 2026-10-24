import { z } from 'zod';
import { codeSchema, listQuerySchema, requiredText } from './common.schema.js';

/** NPWP: 15 digits (old format) or 16 digits (NIK-based); punctuation is stripped. */
export const npwpSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[.\-\s]/g, ''))
  .refine((v) => v === '' || /^\d{15,16}$/.test(v), {
    message: 'NPWP harus 15 atau 16 digit angka',
  })
  .nullish()
  .transform((v) => (v ? v : null));

export function formatNpwp(npwp: string | null | undefined): string {
  if (!npwp) return '-';
  if (npwp.length === 15) {
    return `${npwp.slice(0, 2)}.${npwp.slice(2, 5)}.${npwp.slice(5, 8)}.${npwp.slice(8, 9)}-${npwp.slice(9, 12)}.${npwp.slice(12)}`;
  }
  return npwp;
}

export const vendorInputSchema = z.object({
  code: codeSchema,
  name: requiredText('Nama vendor', 150),
  address: requiredText('Alamat vendor', 500),
  picName: requiredText('PIC vendor', 100),
  npwp: npwpSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || z.email().safeParse(v).success, {
      message: 'Format email tidak valid',
    })
    .nullish()
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[+\d][\d\s-]{5,19}$/.test(v), {
      message: 'Format nomor telepon tidak valid',
    })
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type VendorInput = z.input<typeof vendorInputSchema>;
export type VendorPayload = z.output<typeof vendorInputSchema>;

export const vendorListQuerySchema = listQuerySchema;

export interface VendorDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  picName: string | null;
  npwp: string | null;
  email: string | null;
  phone: string | null;
  workCount: number;
  agreementCount: number;
  createdAt: string;
  updatedAt: string;
}
