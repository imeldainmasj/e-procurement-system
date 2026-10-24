import { z } from 'zod';
import type { PoStatus, PrStatus, VendorStatus } from '../enums.js';
import type { AttachmentDto } from '../uploads.js';
import { optionalText, requiredText, uuidSchema } from './common.schema.js';
import type { PrItemDto } from './pr.schema.js';

const MAX_AMOUNT = 9_999_999_999_999;

const optionalDate = (message: string) =>
  z
    .union([z.literal(''), z.iso.date({ message })])
    .nullish()
    .transform((v) => (v ? v : null));

export const quotationItemInputSchema = z.object({
  prItemId: uuidSchema,
  unitPrice: z.coerce
    .number({ message: 'Harga harus berupa angka' })
    .min(0, { message: 'Harga tidak boleh negatif' })
    .max(MAX_AMOUNT, { message: 'Harga terlalu besar' })
    .transform((v) => Math.round(v * 100) / 100),
  notes: optionalText(500),
});

/** Every PR item must be priced: the winner supplies the whole PR (one PO per PR). */
export const quotationInputSchema = z
  .object({
    vendorId: uuidSchema,
    quoteNumber: requiredText('Nomor penawaran', 100),
    quoteDate: z.iso.date({ message: 'Tanggal penawaran tidak valid' }),
    validUntil: optionalDate('Tanggal berlaku tidak valid'),
    deliveryDays: z.coerce
      .number({ message: 'Lama pengiriman harus berupa angka' })
      .int({ message: 'Lama pengiriman harus bilangan bulat' })
      .min(0, { message: 'Lama pengiriman tidak boleh negatif' })
      .max(365, { message: 'Lama pengiriman maksimal 365 hari' })
      .nullish()
      .transform((v) => v ?? null),
    paymentTerms: optionalText(200),
    notes: optionalText(1000),
    items: z
      .array(quotationItemInputSchema, { message: 'Harga item wajib diisi' })
      .min(1, { message: 'Harga item wajib diisi' }),
  })
  .refine((q) => q.validUntil === null || q.validUntil >= q.quoteDate, {
    message: 'Tanggal berlaku tidak boleh sebelum tanggal penawaran',
    path: ['validUntil'],
  });
export type QuotationInput = z.input<typeof quotationInputSchema>;
export type QuotationPayload = z.output<typeof quotationInputSchema>;

export const quotationCreateSchema = quotationInputSchema.and(z.object({ prId: uuidSchema }));
export type QuotationCreateInput = z.input<typeof quotationCreateSchema>;
export type QuotationCreatePayload = z.output<typeof quotationCreateSchema>;

export const selectQuotationSchema = z.object({ justification: optionalText(2000) });
export type SelectQuotationInput = z.input<typeof selectQuotationSchema>;

export interface QuotationItemDto {
  id: string;
  prItemId: string;
  unitPrice: string;
  qty: number;
  subtotal: string;
  notes: string | null;
}

export interface QuotationDto {
  id: string;
  vendor: { id: string; code: string; name: string; status: VendorStatus };
  quoteNumber: string;
  /** YYYY-MM-DD */
  quoteDate: string;
  validUntil: string | null;
  deliveryDays: number | null;
  paymentTerms: string | null;
  totalAmount: string;
  notes: string | null;
  attachment: AttachmentDto | null;
  isSelected: boolean;
  selectedAt: string | null;
  selectedBy: { id: string; name: string } | null;
  selectionJustification: string | null;
  items: QuotationItemDto[];
  createdAt: string;
  updatedAt: string;
}

/** Everything the side-by-side comparison page needs for one PR. */
export interface QuotationComparisonDto {
  pr: {
    id: string;
    number: string | null;
    title: string;
    status: PrStatus;
    neededDate: string;
    estimatedTotal: string;
    requester: { id: string; name: string };
    division: { id: string; name: string };
    items: PrItemDto[];
  };
  /** Total approved in the internal memo (falls back to the PR estimate). */
  approvedAmount: string;
  minQuotations: number;
  quotations: QuotationDto[];
  /** The PR's current (non-cancelled) purchase order, if any. */
  purchaseOrder: { id: string; number: string; status: PoStatus } | null;
  /** Quotations may be added/changed/selected (PR approved or in quotation, no active PO). */
  editable: boolean;
}
