import { z } from 'zod';
import type { PrStatus, Role } from '../enums.js';
import type { PrListItemDto } from './pr.schema.js';

/** Roles that see organisation-wide spending, lead time and vendor analytics. */
export const DASHBOARD_ANALYTICS_ROLES: Role[] = ['PROCUREMENT', 'VIEWER', 'APPROVER'];

export const SPENDING_GROUPS = ['month', 'vendor', 'category', 'division'] as const;
export type SpendingGroup = (typeof SPENDING_GROUPS)[number];

const yearSchema = z.coerce.number().int().min(2000).max(2100).optional();

export const spendingQuerySchema = z.object({
  groupBy: z.enum(SPENDING_GROUPS).default('month'),
  year: yearSchema,
});

export const yearQuerySchema = z.object({ year: yearSchema });

export interface DashboardSummaryDto {
  /** `own`: requesters only see their own PRs. */
  scope: 'all' | 'own';
  prByStatus: Partial<Record<PrStatus, number>>;
  /** Submitted and not yet finished (completed / fulfilled / rejected / cancelled). */
  activePrs: number;
  awaitingQuotation: number;
  openPurchaseOrders: number;
  /** Approver only: steps waiting for the user's level. */
  pendingMyApprovals: number | null;
  /** Warehouse only: PRs submitted or in stock check. */
  awaitingStockCheck: number | null;
  /** Analytics roles only. Amounts include PPN; based on issued POs by order date. */
  spending: {
    thisMonth: string;
    lastMonth: string;
    yearToDate: string;
    purchaseOrdersThisMonth: number;
  } | null;
  recentPrs: PrListItemDto[];
}

export interface SpendingRowDto {
  key: string;
  label: string;
  amount: string;
  purchaseOrders: number;
}

export interface SpendingDto {
  year: number;
  groupBy: SpendingGroup;
  total: string;
  rows: SpendingRowDto[];
}

export interface LeadTimeDto {
  year: number;
  /** Average calendar days, one decimal; null without data. */
  submitToPoDays: number | null;
  submitToReceivedDays: number | null;
  approvalDays: number | null;
  byMonth: { month: string; submitToPoDays: number | null; count: number }[];
}

export interface VendorPerformanceDto {
  vendor: { id: string; code: string; name: string };
  purchaseOrders: number;
  amount: string;
  rating: number | null;
  ratingCount: number;
  onTimeRating: number | null;
}
