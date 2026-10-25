import { z } from 'zod';
import {
  PROCUREMENT_METHODS,
  PROCUREMENT_TYPES,
  PROJECT_CATEGORIES,
  WORK_STATUSES,
  type Executor,
  type JobLevel,
  type MilestoneType,
  type ProcurementMethod,
} from '../enums.js';
import { uuidSchema } from './common.schema.js';
import type { DataIssue } from './work.schema.js';

/** Report names = the last segment of /reports/<name> and /report/<path> (CLAUDE.md §10). */
export const REPORTS = [
  'annual-summary',
  'yoy-trend',
  'expiring-agreements',
  'vendor-history',
  'compliance',
  'team-performance',
] as const;
export type ReportName = (typeof REPORTS)[number];

export const EXPORT_FORMATS = ['json', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Filters shared by the reports (§8); each report uses the ones that apply. */
export const reportFilterSchema = z
  .object({
    format: z.enum(EXPORT_FORMATS).default('json'),
    year: z.coerce.number().int().optional(),
    yearFrom: z.coerce.number().int().optional(),
    yearTo: z.coerce.number().int().optional(),
    method: z.enum(PROCUREMENT_METHODS).optional(),
    procurementType: z.enum(PROCUREMENT_TYPES).optional(),
    category: z.enum(PROJECT_CATEGORIES).optional(),
    vendorId: uuidSchema.optional(),
    picId: uuidSchema.optional(),
    status: z.enum(WORK_STATUSES).optional(),
  })
  .refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, {
    message: 'Tahun awal tidak boleh setelah tahun akhir',
    path: ['yearTo'],
  });
export type ReportFilter = z.output<typeof reportFilterSchema>;

export const ANNUAL_GROUPS = [
  'method',
  'procurementType',
  'category',
  'vendor',
  'directorate',
] as const;
export type AnnualGroupBy = (typeof ANNUAL_GROUPS)[number];
export const ANNUAL_GROUP_LABELS: Record<AnnualGroupBy, string> = {
  method: 'Metode',
  procurementType: 'Jenis pengadaan',
  category: 'BAU / Project',
  vendor: 'Vendor',
  directorate: 'Direktorat peminta',
};

export const annualSummaryQuerySchema = z.object({
  groupBy: z.enum(ANNUAL_GROUPS).optional(),
});
export const yoyTrendQuerySchema = z.object({
  groupBy: z.enum(['work', 'vendor']).default('work'),
});
export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(730).default(90),
});
export const complianceQuerySchema = z.object({
  code: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Labels of the data-issue codes produced by getDataIssues (§5.5 warnings). */
export const DATA_ISSUE_LABELS: Record<string, string> = {
  METHOD_MISMATCH: 'Metode tidak sesuai ambang nilai',
  PVP_MISSING: 'PVP wajib tetapi belum tercatat',
  PVP_INSUFFICIENT_APPROVALS: 'PVP tanpa approval direktur yang cukup',
  PO_WITHOUT_MOA: 'PO tanpa MoA metode / MoA Biaya',
  PREREQUISITE_NOT_MET: 'Tahapan selesai tidak berurutan',
  DOCUMENT_MISSING: 'Dokumen belum lengkap',
  PK_SOURCE_MISSING: 'PK tanpa kontrak sumber',
  PK_RESULT_MISSING: 'Hasil PK belum dipilih',
  COMPLETED_INCOMPLETE: 'Selesai tetapi tahap akhir belum tercatat',
};

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface AnnualSummaryDto {
  groupBy: AnnualGroupBy | null;
  years: { year: number; amountIdr: number; count: number }[];
  /** Columns of the year × group table, largest total first. */
  groups: { key: string; label: string; amountIdr: number; count: number }[];
  cells: { year: number; key: string; amountIdr: number; count: number }[];
  total: { amountIdr: number; count: number };
}

export interface YoyRowDto {
  key: string;
  label: string;
  sub: string | null;
  workId: string | null;
  vendorId: string | null;
  current: number;
  previous: number | null;
  increasePercent: number | null;
}

export interface YoyTrendDto {
  year: number;
  groupBy: 'work' | 'vendor';
  rows: YoyRowDto[];
}

export interface ExpiringAgreementDto {
  id: string;
  agreementNo: string;
  title: string;
  vendor: { id: string; name: string };
  pic: { id: string; name: string };
  work: { id: string; code: string };
  effectivePeriodEnd: string;
  daysLeft: number;
  amountIdr: number;
  /** A PK or renewal work that already references this contract. */
  renewal: { id: string; code: string; status: string } | null;
}

export interface ExpiringAgreementsDto {
  days: number;
  agreements: ExpiringAgreementDto[];
}

export interface VendorHistoryRowDto {
  vendor: { id: string; code: string; name: string };
  workCount: number;
  totalIdr: number;
  agreementCount: number;
  activeAgreements: number;
  firstYear: number | null;
  lastYear: number | null;
}

export interface ComplianceWorkDto {
  id: string;
  code: string;
  title: string;
  procurementYear: number;
  method: ProcurementMethod;
  pic: { id: string; name: string };
  issues: DataIssue[];
}

export interface ComplianceDto {
  byCode: { code: string; label: string; count: number }[];
  totalWorks: number;
  works: ComplianceWorkDto[];
  meta: { page: number; limit: number; total: number };
}

export interface TeamPerformanceDto {
  staff: {
    user: { id: string; name: string; jobLevel: JobLevel };
    active: number;
    completed: number;
    /** Active works not updated for more than STALE_WORK_DAYS. */
    late: number;
    /** Days spent in completed milestones, split by who carried them out. */
    itDays: number;
    outsideDays: number;
  }[];
  stages: {
    type: MilestoneType;
    label: string;
    executor: Executor;
    avgDays: number;
    samples: number;
  }[];
}
