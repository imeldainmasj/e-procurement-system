import { z } from 'zod';
import { PO_STATUSES, PRICE_SOURCE_TYPES, type PoStatus, type PriceSourceType } from '../enums.js';
import { listQuerySchema, optionalText, uuidSchema } from './common.schema.js';
import type { VendorRatingDto } from './vendor.schema.js';

const optionalDate = (message: string) =>
  z
    .union([z.literal(''), z.iso.date({ message })])
    .nullish()
    .transform((v) => (v ? v : null));

export const poUpdateSchema = z
  .object({
    orderDate: z.iso.date({ message: 'Tanggal PO tidak valid' }),
    expectedDate: optionalDate('Tanggal estimasi tiba tidak valid'),
    taxPercent: z.coerce
      .number({ message: 'PPN harus berupa angka' })
      .min(0, { message: 'PPN tidak boleh negatif' })
      .max(100, { message: 'PPN maksimal 100%' }),
    deliveryAddress: optionalText(500),
    terms: optionalText(3000),
    notes: optionalText(1000),
  })
  .refine((po) => po.expectedDate === null || po.expectedDate >= po.orderDate, {
    message: 'Estimasi tiba tidak boleh sebelum tanggal PO',
    path: ['expectedDate'],
  });
export type PoUpdateInput = z.input<typeof poUpdateSchema>;
export type PoUpdatePayload = z.output<typeof poUpdateSchema>;

/** A PO is always generated from the PR's selected quotation. */
export const poCreateSchema = poUpdateSchema.and(z.object({ quotationId: uuidSchema }));
export type PoCreateInput = z.input<typeof poCreateSchema>;
export type PoCreatePayload = z.output<typeof poCreateSchema>;

export const poListQuerySchema = listQuerySchema.extend({
  status: z.enum(PO_STATUSES).optional(),
  vendorId: uuidSchema.optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});

const score = (label: string) =>
  z.coerce
    .number({ message: `${label} wajib diisi` })
    .int()
    .min(1, { message: `${label} minimal 1` })
    .max(5, { message: `${label} maksimal 5` });

export const vendorRatingInputSchema = z.object({
  onTime: score('Ketepatan waktu'),
  quality: score('Kualitas'),
  price: score('Harga'),
  service: score('Layanan'),
  notes: optionalText(1000),
});
export type VendorRatingInput = z.input<typeof vendorRatingInputSchema>;
export type VendorRatingPayload = z.output<typeof vendorRatingInputSchema>;

/** PO statuses in which the vendor may be rated (goods have arrived). */
export const PO_RATABLE_STATUSES: PoStatus[] = ['PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'];

export interface PoItemDto {
  id: string;
  prItemId: string | null;
  item: { id: string; code: string } | null;
  name: string;
  unit: string;
  qty: number;
  receivedQty: number;
  unitPrice: string;
  subtotal: string;
}

export interface PoListItemDto {
  id: string;
  number: string;
  status: PoStatus;
  /** YYYY-MM-DD */
  orderDate: string;
  expectedDate: string | null;
  total: string;
  vendor: { id: string; code: string; name: string };
  pr: { id: string; number: string | null; title: string };
  itemCount: number;
  issuedAt: string | null;
  createdAt: string;
}

export interface PoDto extends PoListItemDto {
  subtotal: string;
  taxPercent: string;
  taxAmount: string;
  deliveryAddress: string | null;
  terms: string | null;
  notes: string | null;
  items: PoItemDto[];
  quotation: { id: string; quoteNumber: string; selectionJustification: string | null };
  requester: { id: string; name: string };
  division: { id: string; name: string };
  createdBy: { id: string; name: string };
  issuedBy: { id: string; name: string } | null;
  cancellation: { reason: string; at: string } | null;
  rating: VendorRatingDto | null;
  updatedAt: string;
}

/** PO summary shown on the PR detail page. */
export interface PrPoSummaryDto {
  id: string;
  number: string;
  status: PoStatus;
  vendorName: string;
  total: string;
  expectedDate: string | null;
}

// ─── Price history ───────────────────────────────────────────────────────────

export const priceHistoryQuerySchema = listQuerySchema.extend({
  itemId: uuidSchema.optional(),
  vendorId: uuidSchema.optional(),
  sourceType: z.enum(PRICE_SOURCE_TYPES).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});

export interface PriceHistoryDto {
  id: string;
  item: { id: string; code: string; name: string; unit: string };
  vendor: { id: string; code: string; name: string };
  unitPrice: string;
  sourceType: PriceSourceType;
  sourceId: string;
  /** Quotation number or PO number. */
  sourceNumber: string | null;
  /** Link target: the PR (quotation) or the PO. */
  sourceLink: string | null;
  recordedAt: string;
}

export interface PriceSummaryDto {
  item: { id: string; code: string; name: string; unit: string };
  stats: {
    count: number;
    min: string | null;
    max: string | null;
    avg: string | null;
    latest: string | null;
    latestAt: string | null;
  };
  byVendor: {
    vendor: { id: string; code: string; name: string };
    count: number;
    min: string;
    avg: string;
    latest: string;
    latestAt: string;
  }[];
  /** Chronological points for the trend chart (last 24 months). */
  points: { date: string; vendorId: string; unitPrice: string; sourceType: PriceSourceType }[];
}
