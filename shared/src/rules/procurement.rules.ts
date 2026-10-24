/**
 * Quotation selection and PO amount rules, shared so the client can explain up front
 * why a justification is needed and preview the totals the server will compute.
 */

import type { PrStatus, Role } from '../enums.js';
import { hasAnyRole } from '../rbac.js';

/** PR statuses in which quotations are collected. */
export const QUOTATION_PR_STATUSES: PrStatus[] = ['APPROVED', 'QUOTATION'];

/** Roles that may open the quotation comparison and PO pages (only PROCUREMENT edits). */
export const PROCUREMENT_READ_ROLES: Role[] = ['PROCUREMENT', 'VIEWER'];

export function canManageQuotations(status: PrStatus, roles: readonly Role[]): boolean {
  return QUOTATION_PR_STATUSES.includes(status) && hasAnyRole(roles, ['PROCUREMENT']);
}

export type SelectionReason = 'FEW_QUOTATIONS' | 'NOT_CHEAPEST' | 'OVER_APPROVED';

export const SELECTION_REASON_LABELS: Record<SelectionReason, string> = {
  FEW_QUOTATIONS: 'Jumlah penawaran kurang dari minimum',
  NOT_CHEAPEST: 'Penawaran terpilih bukan yang termurah',
  OVER_APPROVED: 'Total penawaran melebihi nilai yang disetujui di memo',
};

export interface SelectionContext {
  /** Totals of every quotation on the PR, before tax. */
  quotationTotals: number[];
  selectedTotal: number;
  minQuotations: number;
  /** Total approved in the internal memo. */
  approvedAmount: number;
}

/** Reasons that make a written justification mandatory; empty = none needed. */
export function selectionJustificationReasons(ctx: SelectionContext): SelectionReason[] {
  const reasons: SelectionReason[] = [];
  if (ctx.quotationTotals.length < ctx.minQuotations) reasons.push('FEW_QUOTATIONS');
  if (ctx.quotationTotals.some((t) => t < ctx.selectedTotal)) reasons.push('NOT_CHEAPEST');
  if (ctx.selectedTotal > ctx.approvedAmount) reasons.push('OVER_APPROVED');
  return reasons;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** PPN rounded to whole cents; mirrors the server's Decimal calculation. */
export function computePoTotals(subtotal: number, taxPercent: number) {
  const taxAmount = round2((subtotal * taxPercent) / 100);
  return { subtotal: round2(subtotal), taxAmount, total: round2(subtotal + taxAmount) };
}
