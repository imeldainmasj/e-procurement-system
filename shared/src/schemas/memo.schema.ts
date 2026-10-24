import { z } from 'zod';
import {
  APPROVAL_STEP_STATUSES,
  MEMO_STATUSES,
  type ApprovalStepStatus,
  type MemoStatus,
  type PrPriority,
} from '../enums.js';
import { listQuerySchema, optionalText, requiredText } from './common.schema.js';
import type { PrItemDto } from './pr.schema.js';

export interface ApprovalStepDto {
  id: string;
  level: number;
  sequence: number;
  status: ApprovalStepStatus;
  approver: { id: string; name: string } | null;
  comment: string | null;
  actedAt: string | null;
  pendingSince: string | null;
}

/** Memo summary embedded in the PR detail. */
export interface PrMemoSummaryDto {
  id: string;
  number: string;
  status: MemoStatus;
  steps: ApprovalStepDto[];
}

export interface MemoListItemDto {
  id: string;
  number: string;
  subject: string;
  status: MemoStatus;
  totalAmount: string;
  /** Level currently waiting for a decision, if any. */
  currentLevel: number | null;
  pr: { id: string; number: string | null; title: string };
  requester: { id: string; name: string };
  division: { id: string; name: string };
  createdAt: string;
  decidedAt: string | null;
}

export interface MemoDto extends MemoListItemDto {
  body: string;
  priority: PrPriority;
  neededDate: string;
  items: PrItemDto[];
  steps: ApprovalStepDto[];
  createdBy: { id: string; name: string };
}

export const memoListQuerySchema = listQuerySchema.extend({
  status: z.enum(MEMO_STATUSES).optional(),
});

// ─── Approval inbox ──────────────────────────────────────────────────────────

export const approvalListQuerySchema = listQuerySchema.extend({
  /** pending: steps waiting for my level; history: steps I decided. */
  tab: z.enum(['pending', 'history']).default('pending'),
  status: z.enum(APPROVAL_STEP_STATUSES).optional(),
});

export interface ApprovalInboxItemDto extends ApprovalStepDto {
  memo: { id: string; number: string; subject: string; status: MemoStatus; totalLevels: number };
  pr: {
    id: string;
    number: string | null;
    title: string;
    priority: PrPriority;
    estimatedTotal: string;
    neededDate: string;
    requester: { id: string; name: string };
    division: { id: string; name: string };
  };
}

export const approveSchema = z.object({ comment: optionalText(1000) });
export type ApproveInput = z.input<typeof approveSchema>;

export const rejectSchema = z.object({ reason: requiredText('Alasan penolakan', 1000) });
export type RejectInput = z.infer<typeof rejectSchema>;

// ─── Notifications ───────────────────────────────────────────────────────────

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
