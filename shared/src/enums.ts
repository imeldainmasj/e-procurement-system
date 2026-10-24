/**
 * Shared enums used by both client and server.
 * Keep values in sync with the Prisma schema enums (CLAUDE.md §6).
 */

export const JOB_LEVELS = ['STAFF', 'MANAGER_L1', 'MANAGER_L2'] as const;
export type JobLevel = (typeof JOB_LEVELS)[number];

export const FEATURES = [
  'DASHBOARD',
  'WORK',
  'MONITORING',
  'AGREEMENT',
  'VENDOR',
  'REPORT',
  'IMPORT',
  'SETTINGS',
] as const;
export type Feature = (typeof FEATURES)[number];

export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PROCUREMENT_TYPES = ['RENEWAL_LICENSE', 'NEW_LICENSE', 'NEW_APPLICATION'] as const;
export type ProcurementType = (typeof PROCUREMENT_TYPES)[number];

export const PROJECT_CATEGORIES = ['BAU', 'PROJECT'] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const PROCUREMENT_METHODS = [
  'TENDER',
  'BIDDING',
  'SPECIAL_EXTENSION',
  'DIRECT_APPOINTMENT',
] as const;
export type ProcurementMethod = (typeof PROCUREMENT_METHODS)[number];

export const RFQ_METHODS = ['TENDER', 'BIDDING'] as const;
export type RfqMethod = (typeof RFQ_METHODS)[number];

export const MEMO_TYPES = [
  'MEMO_PROCUREMENT',
  'MEMO_PL',
  'MEMO_PK',
  'MOA_TENDER_RESULT',
  'MOA_PL',
  'MOA_PK',
  'MOA_COST',
] as const;
export type MemoType = (typeof MEMO_TYPES)[number];

export const MILESTONE_TYPES = [
  'MEMO',
  'RFQ',
  'PVP',
  'OFFICIAL_APPROVAL',
  'MOA_METHOD',
  'MOA_COST',
  'LOA',
  'PO',
  'AGREEMENT',
  'AGREEMENT_OR_ADDENDUM',
] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export const EXECUTORS = ['IT', 'OTHER_TEAM', 'DIRECTORS', 'OFFICIAL'] as const;
export type Executor = (typeof EXECUTORS)[number];

export const MILESTONE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const WORK_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const PK_RESULTS = ['ADDENDUM', 'NEW_AGREEMENT'] as const;
export type PkResult = (typeof PK_RESULTS)[number];

export const PVP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type PvpStatus = (typeof PVP_STATUSES)[number];

export const PVP_DECISIONS = ['APPROVED', 'REJECTED'] as const;
export type PvpDecision = (typeof PVP_DECISIONS)[number];

export const PO_TYPES = ['NEW', 'RENEWAL'] as const;
export type PoType = (typeof PO_TYPES)[number];

export const AGREEMENT_TYPES = ['NEW', 'RENEWAL'] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

export const AGREEMENT_STATUSES = ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const IMPORT_STATUSES = ['PREVIEW', 'COMMITTED', 'ROLLED_BACK', 'FAILED'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const ISSUE_LEVELS = ['ERROR', 'WARNING'] as const;
export type IssueLevel = (typeof ISSUE_LEVELS)[number];

export const AUDIT_SOURCES = ['APP', 'IMPORT'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'RESET_PASSWORD',
  'REASSIGN',
  'ROLLBACK',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
