import type { ImportConflictDto, SettingsDto } from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { refreshAgreementStatus } from '../agreements/agreements.service.js';
import { refreshWorkIssues, syncMilestones } from '../works/work-state.js';

/**
 * Undoing a committed import (CLAUDE.md §7): rows the batch created are soft-deleted, rows it
 * updated get their `before` snapshot back. Refused while anything of the batch was changed
 * afterwards (through the app or another import).
 */

/** Tables an import writes, by AuditLog entity name. */
const DELEGATES = {
  Vendor: (tx: TxClient) => tx.vendor,
  Work: (tx: TxClient) => tx.work,
  Memo: (tx: TxClient) => tx.memo,
  Rfq: (tx: TxClient) => tx.rfq,
  PvpForum: (tx: TxClient) => tx.pvpForum,
  PvpApproval: (tx: TxClient) => tx.pvpApproval,
  WorkMilestone: (tx: TxClient) => tx.workMilestone,
  PurchaseOrder: (tx: TxClient) => tx.purchaseOrder,
  PoPaymentTerm: (tx: TxClient) => tx.poPaymentTerm,
  Agreement: (tx: TxClient) => tx.agreement,
  Addendum: (tx: TxClient) => tx.addendum,
} as const;
type Entity = keyof typeof DELEGATES;

/** Minimal delegate surface shared by all the tables above. */
interface Delegate {
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
}
const delegate = (tx: TxClient, entity: Entity) => DELEGATES[entity](tx) as unknown as Delegate;

const ENTITY_LABELS: Record<string, string> = {
  Vendor: 'Vendor',
  Work: 'Pekerjaan',
  Memo: 'Memo',
  Rfq: 'RFQ',
  PvpForum: 'PVP',
  PvpApproval: 'Approval direktur',
  WorkMilestone: 'Milestone',
  PurchaseOrder: 'PO',
  PoPaymentTerm: 'Termin PO',
  Agreement: 'Agreement',
  Addendum: 'Addendum',
};

async function batchEntries(db: TxClient, batchId: string) {
  return db.auditLog.findMany({
    where: { importBatchId: batchId, source: 'IMPORT' },
    select: {
      id: true,
      entity: true,
      entityId: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Changes made after the commit to anything this batch wrote. */
export async function findConflicts(
  batchId: string,
  committedAt: Date,
): Promise<ImportConflictDto[]> {
  const entries = await batchEntries(prisma, batchId);
  const touchedIds = [...new Set(entries.map((e) => e.entityId))];
  const workIds = [...new Set(entries.filter((e) => e.entity === 'Work').map((e) => e.entityId))];
  const milestoneIds = (
    await prisma.workMilestone.findMany({
      where: { workId: { in: workIds } },
      select: { id: true },
    })
  ).map((m) => m.id);

  // Changes by people (system jobs have no user) after the commit, outside this batch.
  // Later imports that were rolled back themselves no longer count.
  const undone = (
    await prisma.importBatch.findMany({ where: { status: 'ROLLED_BACK' }, select: { id: true } })
  ).map((b) => b.id);
  const later = await prisma.auditLog.findMany({
    where: {
      createdAt: { gt: committedAt },
      userId: { not: null },
      entityId: { in: [...touchedIds, ...milestoneIds] },
      OR: [{ importBatchId: null }, { importBatchId: { notIn: [batchId, ...undone] } }],
      NOT: { entity: 'ImportBatch' },
    },
    select: {
      entity: true,
      entityId: true,
      action: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const conflicts: ImportConflictDto[] = later.map((l) => ({
    entity: ENTITY_LABELS[l.entity] ?? l.entity,
    entityId: l.entityId,
    action: l.action,
    changedBy: l.user?.name ?? null,
    changedAt: l.createdAt.toISOString(),
  }));

  // Documents recorded later through the app on works this batch created.
  const newWorkIds = entries
    .filter((e) => e.entity === 'Work' && e.action === 'CREATE')
    .map((e) => e.entityId);
  if (newWorkIds.length > 0) {
    const where = {
      workId: { in: newWorkIds },
      createdAt: { gt: committedAt },
      deletedAt: null,
      importBatchId: null,
    };
    const [memos, pos, agreements] = await Promise.all([
      prisma.memo.findMany({ where, select: { id: true, memoNo: true, createdAt: true } }),
      prisma.purchaseOrder.findMany({ where, select: { id: true, poNo: true, createdAt: true } }),
      prisma.agreement.findMany({
        where,
        select: { id: true, agreementNo: true, createdAt: true },
      }),
    ]);
    for (const [entity, list] of [
      ['Memo', memos],
      ['PO', pos],
      ['Agreement', agreements],
    ] as const) {
      for (const d of list) {
        conflicts.push({
          entity: `${entity} baru`,
          entityId: d.id,
          action: 'CREATE',
          changedBy: null,
          changedAt: d.createdAt.toISOString(),
        });
      }
    }
  }
  return conflicts;
}

/** Converts a JSON snapshot back into update data (dates/decimals stay strings, Prisma parses them). */
function restoreData(before: Prisma.JsonValue): Record<string, unknown> {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = before as Record<string, unknown>;
  return rest;
}

export async function performRollback(
  tx: TxClient,
  batchId: string,
  actor: Actor,
  settings: SettingsDto,
): Promise<void> {
  const entries = await batchEntries(tx, batchId);
  const now = new Date();
  const works = new Set<string>();
  const agreements = new Set<string>();

  // Undo in reverse order: documents before the works and vendors they point to.
  for (const e of [...entries].reverse()) {
    const entity = e.entity as Entity;
    if (!(entity in DELEGATES)) continue;
    const table = delegate(tx, entity);
    if (e.action === 'CREATE') {
      await table.update({
        where: { id: e.entityId },
        data: { deletedAt: now, updatedById: actor.userId },
      });
    } else if (e.before) {
      await table.update({ where: { id: e.entityId }, data: restoreData(e.before) });
    }
    if (entity === 'Work') works.add(e.entityId);
    if (entity === 'Agreement') agreements.add(e.entityId);
    const row = await table.findUnique({ where: { id: e.entityId } });
    const workId = row?.['workId'];
    if (typeof workId === 'string') works.add(workId);
    const agreementId = row?.['agreementId'];
    if (typeof agreementId === 'string') agreements.add(agreementId);
  }

  // Existing works touched by the batch: milestones follow their remaining documents.
  for (const id of works) {
    const work = await tx.work.findUnique({ where: { id }, select: { deletedAt: true } });
    if (!work || work.deletedAt) continue;
    await syncMilestones(tx, id, settings, {
      authorId: actor.userId,
      reason: 'import dibatalkan (rollback)',
      strict: false,
    });
    await refreshWorkIssues(tx, id, settings);
  }
  for (const id of agreements) {
    const a = await tx.agreement.findUnique({ where: { id }, select: { deletedAt: true } });
    if (a && !a.deletedAt) await refreshAgreementStatus(tx, id, settings.CONTRACT_REMINDER_DAYS);
  }

  await tx.importBatch.update({
    where: { id: batchId },
    data: { status: 'ROLLED_BACK', rolledBackAt: now },
  });
  await writeAuditLog(tx, {
    actor,
    action: 'ROLLBACK',
    entity: 'ImportBatch',
    entityId: batchId,
    after: { undone: entries.length },
  });
}
