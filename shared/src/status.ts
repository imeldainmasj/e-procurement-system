import type {
  AgreementStatus,
  AuditAction,
  AgreementType,
  Executor,
  Feature,
  ImportStatus,
  JobLevel,
  MemoType,
  MilestoneStatus,
  MilestoneType,
  PkResult,
  PoType,
  ProcurementMethod,
  ProcurementType,
  ProjectCategory,
  PvpDecision,
  PvpStatus,
  WorkStatus,
} from './enums.js';

/** Indonesian UI labels; the import template uses the same labels (CLAUDE.md §7). */

export const JOB_LEVEL_LABELS: Record<JobLevel, string> = {
  STAFF: 'Staff',
  MANAGER_L1: 'Manager L1',
  MANAGER_L2: 'Manager L2',
};

export const FEATURE_LABELS: Record<Feature, string> = {
  DASHBOARD: 'Dashboard',
  WORK: 'Pekerjaan',
  MONITORING: 'Monitoring Tim',
  AGREEMENT: 'Kontrak',
  VENDOR: 'Vendor',
  REPORT: 'Report',
  IMPORT: 'Import Excel',
  SETTINGS: 'Pengaturan',
};

export const PROCUREMENT_TYPE_LABELS: Record<ProcurementType, string> = {
  RENEWAL_LICENSE: 'Renewal License',
  NEW_LICENSE: 'New License',
  NEW_APPLICATION: 'New Application',
};

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  BAU: 'BAU',
  PROJECT: 'Project',
};

export const PROCUREMENT_METHOD_LABELS: Record<ProcurementMethod, string> = {
  TENDER: 'Tender',
  BIDDING: 'Bidding',
  SPECIAL_EXTENSION: 'Perpanjangan Khusus',
  DIRECT_APPOINTMENT: 'Penunjukan Langsung',
};

export const MEMO_TYPE_LABELS: Record<MemoType, string> = {
  MEMO_PROCUREMENT: 'Memo Pengadaan',
  MEMO_PL: 'Memo PL',
  MEMO_PK: 'Memo PK',
  MOA_TENDER_RESULT: 'MoA Hasil Tender',
  MOA_PL: 'MoA PL',
  MOA_PK: 'MoA PK',
  MOA_COST: 'MoA Biaya',
};

export const MILESTONE_TYPE_LABELS: Record<MilestoneType, string> = {
  MEMO: 'Memo',
  RFQ: 'RFQ',
  PVP: 'PVP Forum',
  OFFICIAL_APPROVAL: 'Approval Pejabat',
  MOA_METHOD: 'MoA Metode',
  MOA_COST: 'MoA Biaya',
  LOA: 'LoA',
  PO: 'PO',
  AGREEMENT: 'Agreement',
  AGREEMENT_OR_ADDENDUM: 'Addendum / Agreement Baru',
};

/** Method-specific names for the milestones whose label depends on the method (CLAUDE.md §5.4). */
export function milestoneLabel(type: MilestoneType, method: ProcurementMethod): string {
  if (type === 'MEMO') {
    if (method === 'DIRECT_APPOINTMENT') return 'Memo PL';
    if (method === 'SPECIAL_EXTENSION') return 'Memo PK';
  }
  if (type === 'MOA_METHOD') {
    if (method === 'DIRECT_APPOINTMENT') return 'MoA PL';
    if (method === 'SPECIAL_EXTENSION') return 'MoA PK';
    return 'MoA Hasil Tender';
  }
  if (type === 'AGREEMENT' && method !== 'TENDER' && method !== 'BIDDING') return 'Agreement Baru';
  return MILESTONE_TYPE_LABELS[type];
}

export const EXECUTOR_LABELS: Record<Executor, string> = {
  IT: 'IT',
  OTHER_TEAM: 'Tim di luar IT',
  DIRECTORS: 'Direksi',
  OFFICIAL: 'Pejabat',
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  NOT_STARTED: 'Belum Mulai',
  IN_PROGRESS: 'Berjalan',
  DONE: 'Selesai',
  NOT_APPLICABLE: 'Tidak Berlaku',
};

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  ACTIVE: 'Aktif',
  ON_HOLD: 'Ditunda',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const PK_RESULT_LABELS: Record<PkResult, string> = {
  ADDENDUM: 'Addendum',
  NEW_AGREEMENT: 'Agreement Baru',
};

export const PVP_STATUS_LABELS: Record<PvpStatus, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export const PVP_DECISION_LABELS: Record<PvpDecision, string> = {
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export const PO_TYPE_LABELS: Record<PoType, string> = {
  NEW: 'New',
  RENEWAL: 'Renewal',
};

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  NEW: 'New',
  RENEWAL: 'Renewal',
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  ACTIVE: 'Aktif',
  EXPIRING_SOON: 'Segera Berakhir',
  EXPIRED: 'Berakhir',
  TERMINATED: 'Diakhiri',
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  PREVIEW: 'Pratinjau',
  COMMITTED: 'Tersimpan',
  ROLLED_BACK: 'Dibatalkan',
  FAILED: 'Gagal',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Dibuat',
  UPDATE: 'Diubah',
  DELETE: 'Dihapus',
  STATUS_CHANGE: 'Status diubah',
  RESET_PASSWORD: 'Reset password',
  REASSIGN: 'PIC diganti',
  ROLLBACK: 'Rollback import',
};

/** Audited models shown in a work's change history. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Work: 'Pekerjaan',
  WorkMilestone: 'Milestone',
  Memo: 'Memo / MoA',
  Rfq: 'RFQ & LoA',
  PvpForum: 'PVP Forum',
  PvpApproval: 'Approval direktur',
  PurchaseOrder: 'Purchase Order',
  PoPaymentTerm: 'Term of payment',
  Agreement: 'Agreement',
  Addendum: 'Addendum',
};
