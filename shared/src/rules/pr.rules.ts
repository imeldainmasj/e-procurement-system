import type { PrStatus, Role } from '../enums.js';
import { hasAnyRole } from '../rbac.js';

/**
 * Who may do what with a PR. Shared by the server (enforcement) and the client (which
 * buttons to show), so both always agree.
 */
export interface PrActor {
  id: string;
  roles: readonly Role[];
}

export interface PrRef {
  requesterId: string;
  status: PrStatus;
}

/** Roles that see every non-draft PR; everyone else sees only their own. */
export const PR_VIEW_ALL_ROLES: Role[] = ['WAREHOUSE', 'PROCUREMENT', 'APPROVER', 'VIEWER'];

/** Statuses in which the requester may still cancel their own PR. */
const OWNER_CANCELLABLE: PrStatus[] = ['SUBMITTED', 'STOCK_CHECK', 'PENDING_APPROVAL'];
/** Statuses in which procurement may cancel any PR (until a PO exists). */
const STAFF_CANCELLABLE: PrStatus[] = [
  'SUBMITTED',
  'STOCK_CHECK',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUOTATION',
];

const isOwner = (pr: PrRef, user: PrActor) => pr.requesterId === user.id;

export function canViewAllPrs(user: PrActor): boolean {
  return hasAnyRole(user.roles, PR_VIEW_ALL_ROLES);
}

export function canViewPr(pr: PrRef, user: PrActor): boolean {
  if (isOwner(pr, user)) return true;
  return pr.status !== 'DRAFT' && canViewAllPrs(user);
}

export function canCreatePr(user: PrActor): boolean {
  return hasAnyRole(user.roles, ['REQUESTER']);
}

/** Edit, delete and submit are owner-only actions on a draft. */
export function canEditPr(pr: PrRef, user: PrActor): boolean {
  return isOwner(pr, user) && pr.status === 'DRAFT';
}

export function canStartStockCheck(pr: PrRef, user: PrActor): boolean {
  return pr.status === 'SUBMITTED' && hasAnyRole(user.roles, ['WAREHOUSE']);
}

export function canCompleteStockCheck(pr: PrRef, user: PrActor): boolean {
  return pr.status === 'STOCK_CHECK' && hasAnyRole(user.roles, ['WAREHOUSE']);
}

export function canCancelPr(pr: PrRef, user: PrActor): boolean {
  if (isOwner(pr, user) && OWNER_CANCELLABLE.includes(pr.status)) return true;
  return STAFF_CANCELLABLE.includes(pr.status) && hasAnyRole(user.roles, ['PROCUREMENT']);
}
