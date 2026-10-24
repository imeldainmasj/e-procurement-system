import { z } from 'zod';
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  MEMO_TYPES,
  PO_TYPES,
  PVP_DECISIONS,
  PVP_STATUSES,
  RFQ_METHODS,
  type AgreementStatus,
  type AgreementType,
  type MemoType,
  type PoType,
  type PvpDecision,
  type PvpStatus,
  type RfqMethod,
} from '../enums.js';
import {
  booleanQuerySchema,
  listQuerySchema,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from './common.schema.js';
import {
  amountSchema,
  currencySchema,
  exchangeRateSchema,
  moneyFields,
  normalizeRate,
  optionalDate,
  requiredDate,
} from './work.schema.js';

/** Document numbers come from the original documents (CLAUDE.md §5.8). */
const docNo = (label: string) => requiredText(label, 100);
const optionalDocNo = optionalText(100);

const endAfterStart = <T extends { periodStart: string | null; periodEnd: string | null }>(v: T) =>
  !v.periodStart || !v.periodEnd || v.periodEnd >= v.periodStart;
const periodMessage = {
  message: 'Periode selesai tidak boleh sebelum periode mulai',
  path: ['periodEnd'],
};

// ─── Memo & MoA ──────────────────────────────────────────────────────────────

export const memoInputSchema = z
  .object({
    memoNo: docNo('No. memo'),
    memoType: z.enum(MEMO_TYPES, { message: 'Jenis memo wajib dipilih' }),
    title: requiredText('Judul memo', 255),
    memoDate: requiredDate('Tanggal memo'),
    requesterName: optionalText(150),
    amount: z
      .union([z.literal(''), z.null(), amountSchema('Nilai')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    currency: currencySchema.default('IDR'),
    exchangeRate: exchangeRateSchema.default(1),
    notes: optionalText(1000),
  })
  .transform(normalizeRate);
export type MemoInput = z.input<typeof memoInputSchema>;
export type MemoPayload = z.output<typeof memoInputSchema>;

// ─── RFQ & LoA ───────────────────────────────────────────────────────────────

export const rfqInputSchema = z
  .object({
    rfqNo: docNo('No. RFQ'),
    method: z.enum(RFQ_METHODS, { message: 'Metode RFQ wajib dipilih' }),
    periodStart: requiredDate('Periode mulai'),
    periodEnd: requiredDate('Periode selesai'),
    ...moneyFields,
    termOfPayment: optionalText(500),
    loaNo: optionalDocNo,
    loaDate: optionalDate,
    loaProcessedBy: optionalText(150),
  })
  .refine(endAfterStart, periodMessage)
  .refine((v) => !v.loaNo === !v.loaDate, {
    message: 'No. LoA dan Tanggal LoA diisi bersamaan',
    path: ['loaDate'],
  })
  .transform(normalizeRate);
export type RfqInput = z.input<typeof rfqInputSchema>;
export type RfqPayload = z.output<typeof rfqInputSchema>;

// ─── PVP ─────────────────────────────────────────────────────────────────────

export const pvpInputSchema = z.object({
  pvpDate: requiredDate('Tanggal PVP'),
  status: z.enum(PVP_STATUSES, { message: 'Status PVP wajib dipilih' }),
  notes: optionalText(1000),
});
export type PvpInput = z.input<typeof pvpInputSchema>;
export type PvpPayload = z.output<typeof pvpInputSchema>;

export const pvpApprovalInputSchema = z.object({
  directorName: requiredText('Nama direktur', 150),
  decision: z.enum(PVP_DECISIONS, { message: 'Keputusan wajib dipilih' }),
  approvalDate: requiredDate('Tanggal approval'),
  notes: optionalText(500),
});
export type PvpApprovalInput = z.input<typeof pvpApprovalInputSchema>;
export type PvpApprovalPayload = z.output<typeof pvpApprovalInputSchema>;

// ─── PO & term of payment ────────────────────────────────────────────────────

export const poInputSchema = z
  .object({
    poNo: docNo('No. PO'),
    poType: z.enum(PO_TYPES, { message: 'Tipe PO wajib dipilih' }),
    poName: requiredText('Nama PO', 255),
    poDate: requiredDate('Tanggal PO'),
    ...moneyFields,
    requesterName: optionalText(150),
    previousPoNo: optionalDocNo,
    previousPoAmount: z
      .union([z.literal(''), z.null(), amountSchema('Nilai PO sebelumnya')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    previousPoCurrency: z
      .union([z.literal(''), currencySchema])
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .transform(normalizeRate);
export type PoInput = z.input<typeof poInputSchema>;
export type PoPayload = z.output<typeof poInputSchema>;

export const paymentTermInputSchema = z
  .object({
    sequence: z.coerce
      .number({ message: 'Urutan wajib diisi' })
      .int({ message: 'Urutan harus bilangan bulat' })
      .min(1, { message: 'Urutan minimal 1' }),
    description: requiredText('Deskripsi termin', 255),
    /** 0–100; the amount is derived from the PO value when only the percentage is given. */
    percentage: z
      .union([z.literal(''), z.null(), z.coerce.number().min(0).max(100)])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    amount: z
      .union([z.literal(''), z.null(), amountSchema('Nilai termin')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    dueDate: optionalDate,
    isPaid: z.boolean().default(false),
  })
  .refine((v) => v.percentage !== null || v.amount !== null, {
    message: 'Isi persentase atau nilai termin',
    path: ['amount'],
  });
export type PaymentTermInput = z.input<typeof paymentTermInputSchema>;
export type PaymentTermPayload = z.output<typeof paymentTermInputSchema>;

// ─── Agreement & addendum ────────────────────────────────────────────────────

export const agreementInputSchema = z
  .object({
    workId: uuidSchema,
    agreementNo: docNo('No. agreement'),
    agreementType: z.enum(AGREEMENT_TYPES, { message: 'Tipe agreement wajib dipilih' }),
    title: requiredText('Judul agreement', 255),
    vendorId: uuidSchema,
    poId: uuidSchema,
    picId: uuidSchema,
    periodStart: requiredDate('Periode mulai'),
    periodEnd: requiredDate('Periode selesai'),
    ...moneyFields,
  })
  .refine(endAfterStart, periodMessage)
  .transform(normalizeRate);
export type AgreementInput = z.input<typeof agreementInputSchema>;
export type AgreementPayload = z.output<typeof agreementInputSchema>;

export const addendumInputSchema = z
  .object({
    workId: uuidSchema,
    addendumNo: docNo('No. addendum'),
    title: requiredText('Judul addendum', 255),
    addendumDate: requiredDate('Tanggal addendum'),
    newPeriodEnd: optionalDate,
    valueChange: z
      .union([z.literal(''), z.null(), z.coerce.number({ message: 'Perubahan nilai harus angka' })])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    currency: currencySchema.default('IDR'),
    exchangeRate: exchangeRateSchema.default(1),
    poId: optionalUuid,
    notes: optionalText(1000),
  })
  .transform(normalizeRate);
export type AddendumInput = z.input<typeof addendumInputSchema>;
export type AddendumPayload = z.output<typeof addendumInputSchema>;

export const agreementListQuerySchema = listQuerySchema.extend({
  status: z.enum(AGREEMENT_STATUSES).optional(),
  vendorId: uuidSchema.optional(),
  picId: uuidSchema.optional(),
  workId: uuidSchema.optional(),
  /** Agreements ending within N days from today. */
  expiringWithin: z.coerce.number().int().min(1).max(3650).optional(),
  mine: booleanQuerySchema.optional(),
});
export type AgreementListQuery = z.output<typeof agreementListQuerySchema>;

export const docParamsSchema = z.object({ id: uuidSchema, docId: uuidSchema });
export const termParamsSchema = z.object({ id: uuidSchema, docId: uuidSchema, termId: uuidSchema });

// ─── DTOs ────────────────────────────────────────────────────────────────────

interface Money {
  amount: number;
  currency: string;
  exchangeRate: number;
  amountIdr: number;
}

export interface MemoDto {
  id: string;
  memoNo: string;
  memoType: MemoType;
  title: string;
  memoDate: string;
  requesterName: string | null;
  amount: number | null;
  currency: string | null;
  exchangeRate: number | null;
  amountIdr: number | null;
  notes: string | null;
}

export interface RfqDto extends Money {
  id: string;
  rfqNo: string;
  method: RfqMethod;
  periodStart: string;
  periodEnd: string;
  termOfPayment: string | null;
  loaNo: string | null;
  loaDate: string | null;
  loaProcessedBy: string | null;
  recordedAt: string;
}

export interface PvpApprovalDto {
  id: string;
  directorName: string;
  decision: PvpDecision;
  approvalDate: string;
  notes: string | null;
}

export interface PvpDto {
  id: string;
  pvpDate: string;
  status: PvpStatus;
  notes: string | null;
  approvals: PvpApprovalDto[];
  approvedCount: number;
  /** PVP_MIN_DIRECTOR_APPROVALS at the time of reading. */
  minApprovals: number;
}

export interface PaymentTermDto {
  id: string;
  sequence: number;
  description: string;
  percentage: number | null;
  amount: number;
  dueDate: string | null;
  isPaid: boolean;
}

export interface PurchaseOrderDto extends Money {
  id: string;
  poNo: string;
  poType: PoType;
  poName: string;
  poDate: string;
  requesterName: string | null;
  previousPoNo: string | null;
  previousPoAmount: number | null;
  previousPoCurrency: string | null;
  paymentTerms: PaymentTermDto[];
  agreement: { id: string; agreementNo: string } | null;
}

export interface AddendumDto {
  id: string;
  addendumNo: string;
  title: string;
  addendumDate: string;
  newPeriodEnd: string | null;
  valueChange: number | null;
  currency: string | null;
  exchangeRate: number | null;
  valueChangeIdr: number | null;
  notes: string | null;
  work: { id: string; code: string };
  po: { id: string; poNo: string } | null;
}

export interface AgreementDto extends Money {
  id: string;
  agreementNo: string;
  agreementType: AgreementType;
  title: string;
  periodStart: string;
  periodEnd: string;
  /** Latest end date including addendum extensions. */
  effectivePeriodEnd: string;
  /** Days from today (Asia/Jakarta) to the effective end; negative when expired. */
  daysLeft: number;
  status: AgreementStatus;
  vendor: { id: string; code: string; name: string };
  pic: { id: string; name: string };
  work: { id: string; code: string; title: string };
  po: { id: string; poNo: string };
  addendums: AddendumDto[];
  /** PK works extending this agreement. */
  extensions: { id: string; code: string; title: string }[];
  canEdit: boolean;
}

/** Everything recorded on one work, for the document tabs of the detail page. */
export interface WorkDocumentsDto {
  memos: MemoDto[];
  rfq: RfqDto | null;
  pvp: PvpDto | null;
  purchaseOrders: PurchaseOrderDto[];
  agreements: AgreementDto[];
  /** Addendums produced by this (PK) work. */
  addendums: (AddendumDto & { agreement: { id: string; agreementNo: string } })[];
}
