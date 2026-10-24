import { z } from 'zod';
import {
  VENDOR_DOCUMENT_TYPES,
  VENDOR_STATUSES,
  type VendorDocumentType,
  type VendorStatus,
} from '../enums.js';
import type { AttachmentDto } from '../uploads.js';
import {
  codeSchema,
  listQuerySchema,
  optionalText,
  requiredText,
  uuidSchema,
} from './common.schema.js';

/** Days before expiry at which a legal document is flagged. */
export const VENDOR_DOCUMENT_EXPIRY_WARNING_DAYS = 30;

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
  npwp: npwpSchema,
  address: optionalText(500),
  city: optionalText(100),
  picName: optionalText(100),
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
  bankName: optionalText(100),
  bankAccount: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[\d\s-]{5,30}$/.test(v), {
      message: 'Nomor rekening hanya boleh angka',
    })
    .nullish()
    .transform((v) => (v ? v.replace(/[\s-]/g, '') : null)),
  bankAccountName: optionalText(150),
  categoryIds: z.array(uuidSchema).max(20).default([]),
  notes: optionalText(1000),
});
export type VendorInput = z.input<typeof vendorInputSchema>;
export type VendorPayload = z.output<typeof vendorInputSchema>;

export const vendorStatusInputSchema = z
  .object({
    status: z.enum(VENDOR_STATUSES, { message: 'Status wajib dipilih' }),
    reason: optionalText(1000),
  })
  .refine((v) => v.status !== 'BLACKLISTED' || v.reason !== null, {
    message: 'Alasan wajib diisi untuk blacklist',
    path: ['reason'],
  });
export type VendorStatusInput = z.input<typeof vendorStatusInputSchema>;

export const vendorListQuerySchema = listQuerySchema.extend({
  status: z.enum(VENDOR_STATUSES).optional(),
  categoryId: uuidSchema.optional(),
});

/** Multipart text fields sent together with the file. */
export const vendorDocumentInputSchema = z.object({
  type: z.enum(VENDOR_DOCUMENT_TYPES, { message: 'Jenis dokumen wajib dipilih' }),
  number: optionalText(100),
  expiresAt: z
    .union([z.literal(''), z.iso.date({ message: 'Tanggal kedaluwarsa tidak valid' })])
    .nullish()
    .transform((v) => (v ? v : null)),
  notes: optionalText(500),
});
export type VendorDocumentInput = z.input<typeof vendorDocumentInputSchema>;

export type DocumentExpiryState = 'none' | 'valid' | 'expiring' | 'expired';

/** `today` and `expiresAt` are YYYY-MM-DD strings (Asia/Jakarta). */
export function documentExpiryState(
  expiresAt: string | null,
  today: string,
  warningDays = VENDOR_DOCUMENT_EXPIRY_WARNING_DAYS,
): DocumentExpiryState {
  if (!expiresAt) return 'none';
  if (expiresAt < today) return 'expired';
  const days = (Date.parse(expiresAt) - Date.parse(today)) / 86_400_000;
  return days <= warningDays ? 'expiring' : 'valid';
}

export interface RatingSummaryDto {
  count: number;
  /** Averages on a 1–5 scale; null when there are no ratings. */
  overall: number | null;
  onTime: number | null;
  quality: number | null;
  price: number | null;
  service: number | null;
}

export interface VendorListItemDto {
  id: string;
  code: string;
  name: string;
  city: string | null;
  picName: string | null;
  phone: string | null;
  email: string | null;
  status: VendorStatus;
  categories: { id: string; name: string }[];
  rating: { overall: number | null; count: number };
  /** Documents that are expired or expiring soon. */
  documentAlerts: { expired: number; expiring: number };
  createdAt: string;
}

export interface VendorDocumentDto {
  id: string;
  type: VendorDocumentType;
  number: string | null;
  expiresAt: string | null;
  expiryState: DocumentExpiryState;
  notes: string | null;
  attachment: AttachmentDto;
  createdAt: string;
}

export interface VendorRatingDto {
  id: string;
  poId: string;
  onTime: number;
  quality: number;
  price: number;
  service: number;
  average: number;
  notes: string | null;
  ratedBy: { id: string; name: string };
  createdAt: string;
}

export interface VendorDto extends VendorListItemDto {
  npwp: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  statusReason: string | null;
  notes: string | null;
  documents: VendorDocumentDto[];
  ratingSummary: RatingSummaryDto;
  updatedAt: string;
}
