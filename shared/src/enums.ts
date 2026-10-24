/**
 * Shared enums used by both client and server.
 * Keep values in sync with the Prisma schema enums.
 */

export const ROLES = [
  'SUPER_ADMIN',
  'REQUESTER',
  'WAREHOUSE',
  'PROCUREMENT',
  'APPROVER',
  'VIEWER',
] as const;
export type Role = (typeof ROLES)[number];

export const PR_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'STOCK_CHECK',
  'FULFILLED_FROM_STOCK',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'QUOTATION',
  'PO_ISSUED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const PR_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type PrPriority = (typeof PR_PRIORITIES)[number];

/** CANCELLED: the PR was cancelled while its memo was still pending (not in CLAUDE.md §5). */
export const MEMO_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type MemoStatus = (typeof MEMO_STATUSES)[number];

export const APPROVAL_STEP_STATUSES = [
  'WAITING',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SKIPPED',
] as const;
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];

export const PO_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const CONTRACT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'TERMINATED',
  'RENEWED',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_TYPES = ['PURCHASE', 'RENTAL', 'MAINTENANCE', 'LICENSE', 'SERVICE'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const ASSET_STATUSES = [
  'AVAILABLE',
  'IN_USE',
  'IN_REPAIR',
  'BROKEN',
  'DISPOSED',
  'LOST',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const VENDOR_STATUSES = ['ACTIVE', 'UNDER_REVIEW', 'BLACKLISTED', 'INACTIVE'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_DOCUMENT_TYPES = ['SIUP', 'NIB', 'NPWP', 'AKTA', 'LAINNYA'] as const;
export type VendorDocumentType = (typeof VENDOR_DOCUMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const GOODS_CONDITIONS = ['GOOD', 'DAMAGED'] as const;
export type GoodsCondition = (typeof GOODS_CONDITIONS)[number];

export const PRICE_SOURCE_TYPES = ['QUOTATION', 'PO'] as const;
export type PriceSourceType = (typeof PRICE_SOURCE_TYPES)[number];

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'RESET_PASSWORD',
  'APPROVE',
  'REJECT',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
