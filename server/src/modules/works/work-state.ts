import { milestoneLabel, type MilestoneStatus } from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { num } from '../../utils/money.js';
import {
  documentCompletions,
  DOCUMENT_MILESTONES,
  getDataIssues,
  missingPrerequisites,
  type DocumentCompletions,
  type DocumentSnapshot,
  type RuleSettings,
} from '../../utils/procurementRules.js';
// Circular with settings.service (it refreshes issues on threshold changes); runtime-only.
import { getSettings } from '../settings/settings.service.js';

/**
 * State derived from a work's documents: milestone completion (CLAUDE.md §6 Sinkronisasi)
 * and the cached data issues. Shared by the work, document and import modules.
 */

type Settings = RuleSettings & { PVP_MIN_DIRECTOR_APPROVALS: number };

const live = { deletedAt: null };

export async function loadSnapshot(db: TxClient, workId: string): Promise<DocumentSnapshot> {
  const [memos, rfq, pvp, purchaseOrders, agreements, addendums] = await Promise.all([
    db.memo.findMany({ where: { workId, ...live }, select: { memoType: true, memoDate: true } }),
    db.rfq.findFirst({
      where: { workId, ...live },
      select: { createdAt: true, loaNo: true, loaDate: true },
    }),
    db.pvpForum.findFirst({
      where: { workId, ...live },
      select: {
        status: true,
        approvals: { where: live, select: { decision: true, approvalDate: true } },
      },
    }),
    db.purchaseOrder.findMany({ where: { workId, ...live }, select: { poDate: true } }),
    db.agreement.findMany({
      where: { workId, ...live },
      select: { periodStart: true, createdAt: true },
    }),
    db.addendum.findMany({ where: { workId, ...live }, select: { addendumDate: true } }),
  ]);
  return {
    memos,
    rfq: rfq && { recordedAt: rfq.createdAt, loaNo: rfq.loaNo, loaDate: rfq.loaDate },
    pvp,
    purchaseOrders,
    agreements: agreements.map((a) => ({ periodStart: a.periodStart, recordedAt: a.createdAt })),
    addendums,
  };
}

async function completionsFor(
  db: TxClient,
  work: {
    id: string;
    method: Parameters<typeof documentCompletions>[0];
    pkResult: Parameters<typeof documentCompletions>[1];
  },
  settings: Settings,
): Promise<DocumentCompletions> {
  return documentCompletions(
    work.method,
    work.pkResult,
    await loadSnapshot(db, work.id),
    settings.PVP_MIN_DIRECTOR_APPROVALS,
  );
}

/** Recomputes and stores the work's data issues; call inside the write transaction. */
export async function refreshWorkIssues(
  tx: TxClient,
  workId: string,
  settings: Settings,
): Promise<void> {
  const w = await tx.work.findUniqueOrThrow({
    where: { id: workId },
    select: {
      id: true,
      method: true,
      amountIdr: true,
      status: true,
      pvpRequired: true,
      sourceAgreementId: true,
      pkResult: true,
      lastUpdatedAt: true,
      milestones: { select: { type: true, sequence: true, status: true, prerequisites: true } },
    },
  });
  const completions = await completionsFor(tx, w, settings);
  const issues = getDataIssues({ ...w, amountIdr: num(w.amountIdr), completions }, settings);
  await tx.work.update({
    where: { id: workId },
    data: {
      dataIssues: issues as unknown as Prisma.InputJsonValue,
      hasDataIssues: issues.length > 0,
    },
  });
}

/** After a threshold change every work's cached issues may be outdated. */
export async function refreshAllWorkIssues(): Promise<number> {
  const settings = await getSettings();
  const works = await prisma.work.findMany({ where: live, select: { id: true } });
  for (const { id } of works) {
    await prisma.$transaction((tx) => refreshWorkIssues(tx, id, settings));
  }
  return works.length;
}

export interface SyncOptions {
  /** Author of the generated progress entries. */
  authorId: string;
  /** Short reason appended to the progress entry, e.g. "dokumen Memo dicatat". */
  reason: string;
  /**
   * App input (true): a document whose milestone prerequisites are open is rejected, and a
   * removed document may not reopen a milestone others depend on (§5.5 rules 1, 2, 7).
   * Import (false): milestones follow the documents as they are; issues mark the gaps.
   */
  strict: boolean;
}

/**
 * Brings document-backed milestones in line with the recorded documents: DONE (dated by
 * the document) when a document exists, back to IN_PROGRESS when it was removed.
 * Each status change is written to the progress log. Returns the number of changes.
 */
export async function syncMilestones(
  tx: TxClient,
  workId: string,
  settings: Settings,
  options: SyncOptions,
): Promise<number> {
  const work = await tx.work.findUniqueOrThrow({
    where: { id: workId },
    select: {
      id: true,
      method: true,
      pkResult: true,
      milestones: {
        select: {
          id: true,
          type: true,
          sequence: true,
          status: true,
          prerequisites: true,
          startedAt: true,
          completedAt: true,
        },
        orderBy: { sequence: 'asc' },
      },
    },
  });
  const completions = await completionsFor(tx, work, settings);
  const label = (t: (typeof work.milestones)[number]['type']) => milestoneLabel(t, work.method);
  let changes = 0;

  for (const m of work.milestones) {
    if (!DOCUMENT_MILESTONES.has(m.type) || m.status === 'NOT_APPLICABLE') continue;
    const completedAt = completions[m.type];
    let next: MilestoneStatus = m.status;

    if (completedAt && m.status !== 'DONE') {
      const missing = missingPrerequisites(m, work.milestones);
      if (options.strict && missing.length > 0) {
        if (m.type === 'PO') {
          throw new AppError(
            422,
            'PO_REQUIRES_MOA',
            'PO tidak dapat dicatat sebelum MoA sesuai metode dan MoA Biaya selesai',
          );
        }
        throw new AppError(
          422,
          'MILESTONE_PREREQUISITE_NOT_MET',
          `Dokumen ${label(m.type)} belum dapat dicatat: tunggu ${missing.map(label).join(', ')} selesai`,
        );
      }
      next = 'DONE';
    } else if (!completedAt && m.status === 'DONE') {
      if (options.strict) {
        const dependent = work.milestones.find(
          (x) =>
            x.prerequisites.includes(m.type) && (x.status === 'DONE' || x.status === 'IN_PROGRESS'),
        );
        if (dependent) {
          throw new AppError(
            422,
            'MILESTONE_HAS_DEPENDENTS',
            `Dokumen ${label(m.type)} tidak dapat dihapus karena ${label(dependent.type)} sudah berjalan`,
          );
        }
      }
      next = 'IN_PROGRESS';
    }

    const sameDate = completedAt?.getTime() === m.completedAt?.getTime();
    if (next === m.status && (next !== 'DONE' || sameDate)) continue;

    await tx.workMilestone.update({
      where: { id: m.id },
      data: {
        status: next,
        completedAt: next === 'DONE' ? completedAt : null,
        startedAt: m.startedAt ?? completedAt ?? new Date(),
        updatedById: options.authorId,
      },
    });
    if (next !== m.status) {
      await tx.workUpdate.create({
        data: {
          workId,
          milestoneId: m.id,
          authorId: options.authorId,
          note: `${label(m.type)}: ${options.reason}`,
          statusFrom: m.status,
          statusTo: next,
        },
      });
      changes++;
    }
    m.status = next; // later milestones see the new state
  }
  return changes;
}
