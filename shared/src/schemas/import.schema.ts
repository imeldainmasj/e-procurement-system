import { z } from 'zod';
import { IMPORT_STATUSES, ISSUE_LEVELS, type ImportStatus, type IssueLevel } from '../enums.js';
import { listQuerySchema } from './common.schema.js';

export const importListQuerySchema = listQuerySchema.extend({
  status: z.enum(IMPORT_STATUSES).optional(),
});

export const importIssueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  level: z.enum(ISSUE_LEVELS).optional(),
  sheet: z.string().trim().min(1).optional(),
});

/** Background step of a batch (validation, commit, rollback run without blocking the request). */
export const IMPORT_PHASES = ['VALIDATING', 'COMMITTING', 'ROLLING_BACK'] as const;
export type ImportPhase = (typeof IMPORT_PHASES)[number];

export const IMPORT_PHASE_LABELS: Record<ImportPhase, string> = {
  VALIDATING: 'Memvalidasi file',
  COMMITTING: 'Menyimpan data',
  ROLLING_BACK: 'Membatalkan import',
};

export interface ImportBatchDto {
  id: string;
  fileName: string;
  status: ImportStatus;
  phase: ImportPhase | null;
  /** 0–100 while a background step runs. */
  progress: number | null;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  errorMessage: string | null;
  /** Created/updated rows per table after a commit. */
  summary: Record<string, { created: number; updated: number }> | null;
  /** Issues per sheet and level, for the filter chips. */
  issueCounts: { sheet: string; level: IssueLevel; count: number }[];
  uploadedBy: { id: string; name: string };
  uploadedAt: string;
  committedAt: string | null;
  rolledBackAt: string | null;
}

export interface ImportIssueDto {
  id: string;
  sheet: string;
  rowNumber: number;
  level: IssueLevel;
  field: string | null;
  message: string;
}

/** A later change that blocks a rollback. */
export interface ImportConflictDto {
  entity: string;
  entityId: string;
  action: string;
  changedBy: string | null;
  changedAt: string;
}
