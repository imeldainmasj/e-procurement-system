import { z } from 'zod';
import {
  MILESTONE_STATUSES,
  PK_RESULTS,
  PROCUREMENT_METHODS,
  PROCUREMENT_TYPES,
  PROJECT_CATEGORIES,
  WORK_STATUSES,
  type AuditAction,
  type AuditSource,
  type Executor,
  type MilestoneStatus,
  type MilestoneType,
  type PkResult,
  type ProcurementMethod,
  type ProcurementType,
  type ProjectCategory,
  type WorkStatus,
} from '../enums.js';
import type { AttachmentDto } from '../uploads.js';
import {
  booleanQuerySchema,
  listQuerySchema,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from './common.schema.js';

// ─── Shared field schemas ────────────────────────────────────────────────────

/** ISO 4217 code, e.g. IDR, USD. */
export const currencySchema = z
  .string({ message: 'Mata uang wajib diisi' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: 'Mata uang harus 3 huruf, mis. IDR atau USD' });

export const amountSchema = (label: string) =>
  z.coerce
    .number({ message: `${label} harus berupa angka` })
    .min(0, { message: `${label} tidak boleh negatif` })
    .max(1e15, { message: `${label} terlalu besar` });

export const exchangeRateSchema = z.coerce
  .number({ message: 'Kurs harus berupa angka' })
  .positive({ message: 'Kurs harus lebih dari 0' });

/** YYYY-MM-DD; empty → null. */
export const optionalDate = z
  .union([z.literal(''), z.iso.date({ message: 'Tanggal tidak valid' })])
  .nullish()
  .transform((v) => (v ? v : null));

export const requiredDate = (label: string) =>
  z.iso.date({ message: `${label} wajib diisi dengan tanggal yang valid` });

/** Amount in a currency plus its rate to IDR; the rate is forced to 1 for IDR. */
export const moneyFields = {
  amount: amountSchema('Nilai'),
  currency: currencySchema.default('IDR'),
  exchangeRate: exchangeRateSchema.default(1),
};

export function normalizeRate<T extends { currency: string; exchangeRate: number }>(v: T): T {
  return v.currency === 'IDR' ? { ...v, exchangeRate: 1 } : v;
}

/** amount × rate, rounded to 2 decimals (client preview; the server recomputes with Decimal). */
export function toIdr(amount: number, exchangeRate: number): number {
  return Math.round(amount * exchangeRate * 100) / 100;
}

// ─── Work ────────────────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

const workBaseSchema = z.object({
  title: requiredText('Judul pekerjaan', 255),
  procurementType: z.enum(PROCUREMENT_TYPES, { message: 'Jenis pengadaan wajib dipilih' }),
  category: z.enum(PROJECT_CATEGORIES, { message: 'Kategori wajib dipilih' }),
  method: z.enum(PROCUREMENT_METHODS, { message: 'Metode pengadaan wajib dipilih' }),
  procurementYear: z.coerce
    .number({ message: 'Tahun pengadaan wajib diisi' })
    .int({ message: 'Tahun harus bilangan bulat' })
    .min(2000, { message: 'Tahun minimal 2000' })
    .max(currentYear + 5, { message: `Tahun maksimal ${currentYear + 5}` }),
  picId: uuidSchema,
  requesterDirectorateId: optionalUuid,
  vendorId: optionalUuid,
  ...moneyFields,
  /** Last year's purchase value in IDR; empty for new procurements. */
  previousPurchaseAmount: z
    .union([z.literal(''), z.null(), amountSchema('Nilai tahun sebelumnya')])
    .optional()
    .transform((v) => (v === '' || v === undefined || v === null || v === 0 ? null : v)),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  sourceAgreementId: optionalUuid,
  pkResult: z
    .union([z.literal(''), z.enum(PK_RESULTS)])
    .nullish()
    .transform((v) => (v ? v : null)),
  notes: optionalText(2000),
});

function workRules<T extends z.ZodType<z.output<typeof workBaseSchema>>>(schema: T) {
  return schema
    .refine((w) => !w.periodStart || !w.periodEnd || w.periodEnd >= w.periodStart, {
      message: 'Periode selesai tidak boleh sebelum periode mulai',
      path: ['periodEnd'],
    })
    .refine((w) => w.method !== 'SPECIAL_EXTENSION' || w.sourceAgreementId !== null, {
      message: 'Perpanjangan Khusus wajib memilih kontrak sumber yang aktif',
      path: ['sourceAgreementId'],
    })
    .transform((w) => {
      const pk = w.method === 'SPECIAL_EXTENSION';
      return normalizeRate({
        ...w,
        sourceAgreementId: pk ? w.sourceAgreementId : null,
        pkResult: pk ? w.pkResult : null,
      });
    });
}

export const workCreateSchema = workRules(workBaseSchema);
export type WorkCreateInput = z.input<typeof workCreateSchema>;
export type WorkCreatePayload = z.output<typeof workCreateSchema>;

export const workUpdateSchema = workRules(
  workBaseSchema.extend({
    status: z.enum(WORK_STATUSES, { message: 'Status wajib dipilih' }),
  }),
);
export type WorkUpdateInput = z.input<typeof workUpdateSchema>;
export type WorkUpdatePayload = z.output<typeof workUpdateSchema>;

export const workListQuerySchema = listQuerySchema.extend({
  year: z.coerce.number().int().optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  method: z.enum(PROCUREMENT_METHODS).optional(),
  procurementType: z.enum(PROCUREMENT_TYPES).optional(),
  category: z.enum(PROJECT_CATEGORIES).optional(),
  vendorId: uuidSchema.optional(),
  picId: uuidSchema.optional(),
  requesterDirectorateId: uuidSchema.optional(),
  status: z.enum(WORK_STATUSES).optional(),
  hasIssues: booleanQuerySchema.optional(),
  stale: booleanQuerySchema.optional(),
});
export type WorkListQuery = z.output<typeof workListQuerySchema>;

export const milestoneParamsSchema = z.object({ id: uuidSchema, milestoneId: uuidSchema });

export const milestoneUpdateSchema = z.object({
  status: z.enum(MILESTONE_STATUSES, { message: 'Status wajib dipilih' }),
  startedAt: optionalDate,
  completedAt: optionalDate,
  referenceNo: optionalText(100),
  notes: optionalText(1000),
  /** Progress log entry; a default text is written when empty. */
  note: optionalText(2000),
});
export type MilestoneUpdateInput = z.input<typeof milestoneUpdateSchema>;
export type MilestoneUpdatePayload = z.output<typeof milestoneUpdateSchema>;

/** Multipart text fields of a progress update (an optional file is sent as `file`). */
export const workUpdateLogSchema = z.object({
  note: requiredText('Catatan progres', 2000),
  milestoneId: optionalUuid,
});
export type WorkUpdateLogInput = z.input<typeof workUpdateLogSchema>;

export const reassignSchema = z.object({
  picId: uuidSchema,
  note: optionalText(1000),
});
export type ReassignInput = z.input<typeof reassignSchema>;

export const evaluateRulesQuerySchema = z.object({
  amountIdr: amountSchema('Nilai'),
  previousPurchaseAmount: amountSchema('Nilai tahun sebelumnya').optional(),
});

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface DataIssue {
  code: string;
  message: string;
}

export interface RuleEvaluationDto {
  suggestedMethod: 'TENDER' | 'BIDDING';
  increasePercent: number | null;
  pvpRequired: boolean;
}

export interface StageDto {
  type: MilestoneType;
  label: string;
  executor: Executor;
  status: MilestoneStatus;
}

interface Ref {
  id: string;
  name: string;
}

export interface WorkListItemDto {
  id: string;
  code: string;
  title: string;
  procurementType: ProcurementType;
  category: ProjectCategory;
  method: ProcurementMethod;
  procurementYear: number;
  pic: Ref;
  vendor: (Ref & { code: string }) | null;
  requesterDirectorate: (Ref & { code: string }) | null;
  amount: number;
  currency: string;
  amountIdr: number;
  status: WorkStatus;
  pvpRequired: boolean;
  lastUpdatedAt: string;
  isStale: boolean;
  currentStages: StageDto[];
  progress: { done: number; total: number };
  issues: DataIssue[];
}

export interface WorkMilestoneDto {
  id: string;
  type: MilestoneType;
  label: string;
  sequence: number;
  executor: Executor;
  status: MilestoneStatus;
  isConditional: boolean;
  prerequisites: MilestoneType[];
  /** Prerequisites still open; non-empty means the milestone is locked. */
  missingPrerequisites: MilestoneType[];
  startedAt: string | null;
  completedAt: string | null;
  referenceNo: string | null;
  notes: string | null;
}

export interface WorkDetailDto extends WorkListItemDto {
  exchangeRate: number;
  previousPurchaseAmount: number | null;
  increasePercent: number | null;
  suggestedMethod: 'TENDER' | 'BIDDING';
  periodStart: string | null;
  periodEnd: string | null;
  sourceAgreement: { id: string; agreementNo: string; title: string; periodEnd: string } | null;
  pkResult: PkResult | null;
  notes: string | null;
  milestones: WorkMilestoneDto[];
  /** What the current user may do (mirrors the server checks). */
  access: { canEdit: boolean; canDelete: boolean; canReassign: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface WorkUpdateDto {
  id: string;
  note: string;
  milestone: { id: string; type: MilestoneType; label: string } | null;
  statusFrom: MilestoneStatus | null;
  statusTo: MilestoneStatus | null;
  author: Ref;
  attachment: AttachmentDto | null;
  createdAt: string;
}

export interface AgreementOptionDto {
  id: string;
  agreementNo: string;
  title: string;
  vendorName: string;
  periodEnd: string;
}

/** One changed field of an audited row, already formatted for display. */
export interface HistoryChangeDto {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** Merged change history of a work (§8 GET /works/:id/history), newest first. */
export type WorkHistoryItemDto =
  | { kind: 'UPDATE'; id: string; createdAt: string; update: WorkUpdateDto }
  | {
      kind: 'AUDIT';
      id: string;
      createdAt: string;
      user: Ref | null;
      action: AuditAction;
      source: AuditSource;
      /** Model name, e.g. Work, Memo, PurchaseOrder. */
      entity: string;
      /** Document number or other short identification, e.g. a memo number. */
      subject: string | null;
      changes: HistoryChangeDto[];
    };
