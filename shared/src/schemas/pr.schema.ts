import { z } from 'zod';
import type { PrMemoSummaryDto } from './memo.schema.js';
import type { PrPoSummaryDto } from './purchase-order.schema.js';
import { PR_PRIORITIES, PR_STATUSES, type PrPriority, type PrStatus } from '../enums.js';
import {
  booleanQuerySchema,
  listQuerySchema,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from './common.schema.js';

const MAX_AMOUNT = 9_999_999_999_999;

export const prItemInputSchema = z
  .object({
    itemId: optionalUuid,
    freeTextName: optionalText(150),
    /** Ignored for catalog items (the catalog unit is used); required for free-text items. */
    unit: optionalText(20),
    qty: z.coerce
      .number({ message: 'Jumlah harus berupa angka' })
      .int({ message: 'Jumlah harus bilangan bulat' })
      .min(1, { message: 'Jumlah minimal 1' })
      .max(100_000, { message: 'Jumlah terlalu besar' }),
    estimatedUnitPrice: z.coerce
      .number({ message: 'Harga harus berupa angka' })
      .min(0, { message: 'Harga tidak boleh negatif' })
      .max(MAX_AMOUNT, { message: 'Harga terlalu besar' })
      .transform((v) => Math.round(v * 100) / 100),
    notes: optionalText(500),
  })
  .refine((i) => (i.itemId === null) !== (i.freeTextName === null), {
    message: 'Pilih item dari katalog atau isi nama item manual',
    path: ['itemId'],
  })
  .refine((i) => i.itemId !== null || i.unit !== null, {
    message: 'Satuan wajib diisi untuk item manual',
    path: ['unit'],
  });
export type PrItemInput = z.input<typeof prItemInputSchema>;
export type PrItemPayload = z.output<typeof prItemInputSchema>;

export const prInputSchema = z.object({
  title: requiredText('Judul pengajuan', 200),
  justification: requiredText('Justifikasi', 2000),
  priority: z.enum(PR_PRIORITIES).default('MEDIUM'),
  neededDate: z.iso.date({ message: 'Tanggal dibutuhkan tidak valid' }),
  items: z
    .array(prItemInputSchema, { message: 'Item wajib diisi' })
    .min(1, { message: 'Tambahkan minimal satu item' })
    .max(50, { message: 'Maksimal 50 item per pengajuan' }),
});
export type PrInput = z.input<typeof prInputSchema>;
export type PrPayload = z.output<typeof prInputSchema>;

export const prStockCheckSchema = z.object({
  available: z.boolean({ message: 'Hasil cek stok wajib dipilih' }),
  notes: optionalText(1000),
});
export type PrStockCheckInput = z.input<typeof prStockCheckSchema>;

export const reasonSchema = z.object({ reason: requiredText('Alasan', 1000) });
export type ReasonInput = z.infer<typeof reasonSchema>;

export const prListQuerySchema = listQuerySchema.extend({
  status: z.enum(PR_STATUSES).optional(),
  priority: z.enum(PR_PRIORITIES).optional(),
  divisionId: uuidSchema.optional(),
  /** Only PRs requested by the current user. */
  mine: booleanQuerySchema.optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
});

export interface PrItemDto {
  id: string;
  itemId: string | null;
  item: { id: string; code: string; name: string; isAsset: boolean } | null;
  freeTextName: string | null;
  /** Catalog name or the free-text name. */
  name: string;
  unit: string;
  qty: number;
  estimatedUnitPrice: string;
  subtotal: string;
  notes: string | null;
}

export interface PrListItemDto {
  id: string;
  number: string | null;
  title: string;
  status: PrStatus;
  priority: PrPriority;
  /** YYYY-MM-DD */
  neededDate: string;
  estimatedTotal: string;
  itemCount: number;
  requester: { id: string; name: string };
  division: { id: string; code: string; name: string };
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrDto extends PrListItemDto {
  justification: string;
  items: PrItemDto[];
  stockCheck: {
    by: { id: string; name: string } | null;
    at: string | null;
    notes: string | null;
  } | null;
  cancellation: { reason: string; at: string } | null;
  memo: PrMemoSummaryDto | null;
  quotationCount: number;
  /** Current (non-cancelled) purchase order. */
  purchaseOrder: PrPoSummaryDto | null;
}

export interface PrHistoryEntryDto {
  id: string;
  action: string;
  fromStatus: PrStatus | null;
  toStatus: PrStatus | null;
  note: string | null;
  user: { id: string; name: string } | null;
  at: string;
}
