import type {
  AgreementStatus,
  DataIssue,
  MemoType,
  MilestoneStatus,
  PkResult,
  MilestoneType,
  ProcurementMethod,
  SettingsDto,
  WorkStatus,
} from '@sipita/shared';
import { memoMilestone, MILESTONE_TYPE_LABELS } from '@sipita/shared';

/**
 * Pure procurement rules (CLAUDE.md §5). No database access: callers pass the settings
 * read from `app_settings` and the work's milestones, so every rule is unit-testable.
 */

export type RuleSettings = Pick<
  SettingsDto,
  'TENDER_MIN_AMOUNT' | 'PVP_MIN_AMOUNT' | 'PVP_MIN_INCREASE_PERCENT' | 'STALE_WORK_DAYS'
>;

export interface MilestoneLike {
  type: MilestoneType;
  sequence: number;
  status: MilestoneStatus;
  prerequisites: MilestoneType[];
}

// ─── Method & PVP ────────────────────────────────────────────────────────────

/** Above TENDER_MIN_AMOUNT → Tender; at or below → Bidding (§5.2). */
export function suggestMethod(amountIdr: number, settings: RuleSettings): 'TENDER' | 'BIDDING' {
  return amountIdr > settings.TENDER_MIN_AMOUNT ? 'TENDER' : 'BIDDING';
}

/** Only Tender/Bidding are chosen by value; PK and PL follow decisions made outside. */
export function isMethodMismatch(
  method: ProcurementMethod,
  amountIdr: number,
  settings: RuleSettings,
): boolean {
  if (method !== 'TENDER' && method !== 'BIDDING') return false;
  return suggestMethod(amountIdr, settings) !== method;
}

/** Year-on-year increase in %, rounded to 2 decimals; null without (positive) last-year data. */
export function computeIncreasePercent(
  amountIdr: number,
  previousPurchaseAmount: number | null,
): number | null {
  if (previousPurchaseAmount === null || previousPurchaseAmount <= 0) return null;
  const percent = ((amountIdr - previousPurchaseAmount) / previousPurchaseAmount) * 100;
  return Math.round(percent * 100) / 100;
}

/**
 * PVP is required when the value is above PVP_MIN_AMOUNT and either the increase is above
 * PVP_MIN_INCREASE_PERCENT or there is no previous-year purchase to compare with (§5.3).
 */
export function isPvpRequired(
  amountIdr: number,
  increasePercent: number | null,
  settings: RuleSettings,
): boolean {
  if (amountIdr <= settings.PVP_MIN_AMOUNT) return false;
  return increasePercent === null || increasePercent > settings.PVP_MIN_INCREASE_PERCENT;
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export function isSatisfied(status: MilestoneStatus): boolean {
  return status === 'DONE' || status === 'NOT_APPLICABLE';
}

/** Prerequisites of `milestone` that are not DONE / NOT_APPLICABLE yet. */
/**
 * Open prerequisites of `milestone`. A NOT_APPLICABLE prerequisite (PVP not required) is
 * skipped over, not treated as done: its own prerequisites still have to be met, so e.g.
 * MoA cannot start before the RFQ just because the PVP between them does not apply.
 */
export function missingPrerequisites(
  milestone: Pick<MilestoneLike, 'prerequisites'>,
  all: readonly Pick<MilestoneLike, 'type' | 'status' | 'prerequisites'>[],
): MilestoneType[] {
  const missing = new Set<MilestoneType>();
  const visit = (types: readonly MilestoneType[], seen: Set<MilestoneType>) => {
    for (const type of types) {
      if (seen.has(type)) continue;
      seen.add(type);
      const pre = all.find((m) => m.type === type);
      // A prerequisite the work does not have (template changed) does not block.
      if (!pre || pre.status === 'DONE') continue;
      if (pre.status === 'NOT_APPLICABLE') visit(pre.prerequisites, seen);
      else missing.add(type);
    }
  };
  visit(milestone.prerequisites, new Set());
  return [...missing];
}

/** Rule 1 (§5.5): a milestone may only be IN_PROGRESS / DONE once its prerequisites are met. */
export function canStartMilestone(
  milestone: Pick<MilestoneLike, 'prerequisites'>,
  all: readonly Pick<MilestoneLike, 'type' | 'status' | 'prerequisites'>[],
): boolean {
  return missingPrerequisites(milestone, all).length === 0;
}

/**
 * The work's current stage(s): milestones still open whose prerequisites are met. Several
 * can be current at once (parallel branches such as MoA + MoA Biaya + LoA).
 */
export function currentStages<T extends MilestoneLike>(all: readonly T[]): T[] {
  return all.filter((m) => !isSatisfied(m.status) && canStartMilestone(m, all));
}

/** Rule 2 (§5.5): a PO needs both the method MoA and the cost MoA DONE, in every method. */
export function canRecordPo(work: {
  milestones: readonly Pick<MilestoneLike, 'type' | 'status'>[];
}): boolean {
  const done = (type: MilestoneType) =>
    work.milestones.some((m) => m.type === type && m.status === 'DONE');
  return done('MOA_METHOD') && done('MOA_COST');
}

/** The milestone with the highest sequence (the agreement / addendum step). */
export function finalMilestone<T extends MilestoneLike>(all: readonly T[]): T | undefined {
  return all.reduce<T | undefined>(
    (last, m) => (!last || m.sequence > last.sequence ? m : last),
    undefined,
  );
}

// ─── Data issues (warnings, §5.5) ────────────────────────────────────────────

export interface DataIssueInput {
  method: ProcurementMethod;
  amountIdr: number;
  status: WorkStatus;
  pvpRequired: boolean;
  sourceAgreementId: string | null;
  pkResult: string | null;
  lastUpdatedAt: Date;
  milestones: readonly MilestoneLike[];
  /** From `documentCompletions`; when given, DONE milestones without a document are flagged. */
  completions?: DocumentCompletions;
}

const label = (type: MilestoneType) => MILESTONE_TYPE_LABELS[type];

/**
 * Issues that do not block saving but mark the work as incomplete: mostly imported history
 * that breaks the blocking rules, plus a method that does not match the value.
 * Staleness depends on `now`, so it is reported separately by `isStale`.
 */
export function getDataIssues(work: DataIssueInput, settings: RuleSettings): DataIssue[] {
  const issues: DataIssue[] = [];
  const byType = new Map(work.milestones.map((m) => [m.type, m]));

  if (isMethodMismatch(work.method, work.amountIdr, settings)) {
    const suggested = suggestMethod(work.amountIdr, settings) === 'TENDER' ? 'Tender' : 'Bidding';
    issues.push({
      code: 'METHOD_MISMATCH',
      message: `Metode tidak sesuai ambang nilai (seharusnya ${suggested})`,
    });
  }

  const pvp = byType.get('PVP');
  if (work.pvpRequired && pvp && pvp.status !== 'DONE') {
    const laterDone = work.milestones.some((m) => m.sequence > pvp.sequence && m.status === 'DONE');
    if (laterDone) {
      issues.push({ code: 'PVP_MISSING', message: 'PVP wajib tetapi belum tercatat selesai' });
    }
  }

  const po = byType.get('PO');
  if (po?.status === 'DONE' && !canRecordPo(work)) {
    const missing = (['MOA_METHOD', 'MOA_COST'] as const)
      .filter((t) => byType.get(t)?.status !== 'DONE')
      .map(label);
    issues.push({ code: 'PO_WITHOUT_MOA', message: `PO tanpa ${missing.join(' & ')}` });
  }

  // Remaining out-of-order completions (the PO and PVP cases are reported above).
  for (const m of work.milestones) {
    if (m.status !== 'DONE' || m.type === 'PO') continue;
    const missing = missingPrerequisites(m, work.milestones).filter((t) => t !== 'PVP');
    if (missing.length > 0) {
      issues.push({
        code: 'PREREQUISITE_NOT_MET',
        message: `${label(m.type)} selesai sebelum ${missing.map(label).join(', ')}`,
      });
    }
  }

  if (work.method === 'SPECIAL_EXTENSION') {
    if (!work.sourceAgreementId) {
      issues.push({ code: 'PK_SOURCE_MISSING', message: 'PK tanpa kontrak sumber' });
    }
    const last = finalMilestone(work.milestones);
    if (last?.status === 'DONE' && !work.pkResult) {
      issues.push({
        code: 'PK_RESULT_MISSING',
        message: 'Hasil PK (Addendum / Agreement baru) belum dipilih',
      });
    }
  }

  if (work.completions) {
    for (const m of work.milestones) {
      if (m.status !== 'DONE' || !DOCUMENT_MILESTONES.has(m.type) || work.completions[m.type])
        continue;
      issues.push(
        m.type === 'PVP'
          ? {
              code: 'PVP_INSUFFICIENT_APPROVALS',
              message: 'PVP tercatat selesai tanpa approval direktur yang cukup',
            }
          : { code: 'DOCUMENT_MISSING', message: `${label(m.type)} selesai tanpa dokumen` },
      );
    }
  }

  if (work.status === 'COMPLETED') {
    const last = finalMilestone(work.milestones);
    if (last && last.status !== 'DONE') {
      issues.push({
        code: 'COMPLETED_INCOMPLETE',
        message: `Pekerjaan selesai tetapi ${label(last.type)} belum tercatat`,
      });
    }
  }

  return issues;
}

/** ACTIVE works not updated for more than STALE_WORK_DAYS days. */
export function isStale(
  work: { status: WorkStatus; lastUpdatedAt: Date },
  settings: RuleSettings,
  now: Date = new Date(),
): boolean {
  if (work.status !== 'ACTIVE') return false;
  return now.getTime() - work.lastUpdatedAt.getTime() > settings.STALE_WORK_DAYS * 86_400_000;
}

export function staleCutoff(settings: RuleSettings, now: Date = new Date()): Date {
  return new Date(now.getTime() - settings.STALE_WORK_DAYS * 86_400_000);
}

// ─── Documents ↔ milestones (§6 Sinkronisasi) ────────────────────────────────

/** Milestones completed by recording a document; OFFICIAL_APPROVAL is set by hand. */
export const DOCUMENT_MILESTONES: ReadonlySet<MilestoneType> = new Set<MilestoneType>([
  'MEMO',
  'RFQ',
  'PVP',
  'MOA_METHOD',
  'MOA_COST',
  'LOA',
  'PO',
  'AGREEMENT',
  'AGREEMENT_OR_ADDENDUM',
]);

export { memoMilestone } from '@sipita/shared';

export interface DocumentSnapshot {
  memos: readonly { memoType: MemoType; memoDate: Date }[];
  rfq: { recordedAt: Date; loaNo: string | null; loaDate: Date | null } | null;
  pvp: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvals: readonly { decision: 'APPROVED' | 'REJECTED'; approvalDate: Date }[];
  } | null;
  purchaseOrders: readonly { poDate: Date }[];
  /** Agreements produced by the work. */
  agreements: readonly { periodStart: Date; recordedAt: Date }[];
  /** Addendums produced by the work (PK). */
  addendums: readonly { addendumDate: Date }[];
}

export type DocumentCompletions = Partial<Record<MilestoneType, Date>>;

const earliest = (dates: readonly Date[]) =>
  dates.length === 0 ? undefined : new Date(Math.min(...dates.map((d) => d.getTime())));
const latest = (dates: readonly Date[]) =>
  dates.length === 0 ? undefined : new Date(Math.max(...dates.map((d) => d.getTime())));

/**
 * For each document-backed milestone: the date its document completes it, or nothing when
 * the document is missing. RFQ completes when recorded (user decision 2026-10-25); PVP when
 * APPROVED with enough director approvals; an agreement on its start or recording date,
 * whichever is earlier.
 */
export function documentCompletions(
  method: ProcurementMethod,
  pkResult: PkResult | null,
  docs: DocumentSnapshot,
  minDirectorApprovals: number,
): DocumentCompletions {
  const result: DocumentCompletions = {};
  const memoDates = (type: MilestoneType) =>
    docs.memos.filter((m) => memoMilestone(m.memoType, method) === type).map((m) => m.memoDate);

  for (const type of ['MEMO', 'MOA_METHOD', 'MOA_COST'] as const) {
    const date = earliest(memoDates(type));
    if (date) result[type] = date;
  }
  if (docs.rfq) {
    result.RFQ = docs.rfq.recordedAt;
    if (docs.rfq.loaNo && docs.rfq.loaDate) result.LOA = docs.rfq.loaDate;
  }
  if (docs.pvp?.status === 'APPROVED') {
    const approved = docs.pvp.approvals.filter((a) => a.decision === 'APPROVED');
    if (approved.length >= minDirectorApprovals) {
      result.PVP = latest(approved.map((a) => a.approvalDate));
    }
  }
  const po = earliest(docs.purchaseOrders.map((p) => p.poDate));
  if (po) result.PO = po;

  const agreement = earliest(docs.agreements.map((a) => earliest([a.periodStart, a.recordedAt])!));
  if (method === 'SPECIAL_EXTENSION') {
    const final =
      pkResult === 'NEW_AGREEMENT'
        ? agreement
        : pkResult === 'ADDENDUM'
          ? earliest(docs.addendums.map((a) => a.addendumDate))
          : undefined;
    if (final) result.AGREEMENT_OR_ADDENDUM = final;
  } else if (agreement) {
    result.AGREEMENT = agreement;
  }
  return result;
}

/**
 * Status from the effective end date (YYYY-MM-DD, including addendum extensions): EXPIRED
 * after it, EXPIRING_SOON within the largest reminder window, ACTIVE otherwise. A manual
 * TERMINATED is kept.
 */
export function agreementStatus(
  effectiveEnd: string,
  today: string,
  reminderDays: readonly number[],
  current?: AgreementStatus,
): AgreementStatus {
  if (current === 'TERMINATED') return 'TERMINATED';
  if (effectiveEnd < today) return 'EXPIRED';
  const days = (Date.parse(effectiveEnd) - Date.parse(today)) / 86_400_000;
  return days <= Math.max(0, ...reminderDays) ? 'EXPIRING_SOON' : 'ACTIVE';
}
