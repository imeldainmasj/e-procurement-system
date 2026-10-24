import type {
  ApprovalStepStatus,
  MemoStatus,
  PoStatus,
  PriceSourceType,
  PrPriority,
  PrStatus,
  VendorDocumentType,
  VendorStatus,
} from './enums.js';

export const PR_STATUS_LABELS: Record<PrStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Diajukan',
  STOCK_CHECK: 'Cek Stok',
  FULFILLED_FROM_STOCK: 'Dipenuhi dari Stok',
  PENDING_APPROVAL: 'Menunggu Approval',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  QUOTATION: 'Penawaran',
  PO_ISSUED: 'PO Terbit',
  PARTIALLY_RECEIVED: 'Diterima Sebagian',
  RECEIVED: 'Diterima',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const PR_PRIORITY_LABELS: Record<PrPriority, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

/**
 * Allowed PR status transitions (CLAUDE.md §5). DRAFT is deleted rather than cancelled,
 * since a draft has no document number yet. PO_ISSUED → QUOTATION happens when an issued
 * PO is cancelled before any goods arrive, so procurement can pick another quotation.
 */
export const PR_TRANSITIONS: Record<PrStatus, readonly PrStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['STOCK_CHECK', 'CANCELLED'],
  STOCK_CHECK: ['FULFILLED_FROM_STOCK', 'PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['QUOTATION', 'CANCELLED'],
  QUOTATION: ['PO_ISSUED', 'CANCELLED'],
  PO_ISSUED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'QUOTATION'],
  PARTIALLY_RECEIVED: ['RECEIVED'],
  RECEIVED: ['COMPLETED'],
  FULFILLED_FROM_STOCK: [],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition<S extends string>(
  transitions: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return transitions[from].includes(to);
}

export const MEMO_STATUS_LABELS: Record<MemoStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Menunggu Approval',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};

export const APPROVAL_STEP_STATUS_LABELS: Record<ApprovalStepStatus, string> = {
  WAITING: 'Menunggu Giliran',
  PENDING: 'Menunggu Keputusan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  SKIPPED: 'Dilewati',
};

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  ACTIVE: 'Aktif',
  UNDER_REVIEW: 'Dalam Review',
  BLACKLISTED: 'Blacklist',
  INACTIVE: 'Nonaktif',
};

export const VENDOR_DOCUMENT_TYPE_LABELS: Record<VendorDocumentType, string> = {
  SIUP: 'SIUP',
  NIB: 'NIB',
  NPWP: 'NPWP',
  AKTA: 'Akta Perusahaan',
  LAINNYA: 'Lainnya',
};

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Terbit',
  PARTIALLY_RECEIVED: 'Diterima Sebagian',
  RECEIVED: 'Diterima',
  CLOSED: 'Ditutup',
  CANCELLED: 'Dibatalkan',
};

/** Only DRAFT and ISSUED (nothing received yet) POs can be cancelled. */
export const PO_TRANSITIONS: Record<PoStatus, readonly PoStatus[]> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CLOSED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const PRICE_SOURCE_TYPE_LABELS: Record<PriceSourceType, string> = {
  QUOTATION: 'Penawaran',
  PO: 'Purchase Order',
};
