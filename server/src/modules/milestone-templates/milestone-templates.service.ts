import type {
  MilestoneTemplateDto,
  MilestoneTemplatePayload,
  ProcurementMethod,
} from '@sipita/shared';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';

const select = {
  id: true,
  method: true,
  type: true,
  sequence: true,
  executor: true,
  prerequisites: true,
  isConditional: true,
  isActive: true,
} as const;

const order = [{ method: 'asc' as const }, { sequence: 'asc' as const }, { type: 'asc' as const }];

export async function list(): Promise<MilestoneTemplateDto[]> {
  return prisma.milestoneTemplate.findMany({ select, orderBy: order });
}

/** Active template rows used to build the milestones of a new work. */
export async function activeFor(
  db: TxClient,
  method: ProcurementMethod,
): Promise<MilestoneTemplateDto[]> {
  return db.milestoneTemplate.findMany({
    where: { method, isActive: true },
    select,
    orderBy: { sequence: 'asc' },
  });
}

/**
 * Replaces one method's template. Existing works keep their milestones (CLAUDE.md §5.4);
 * only works created afterwards use the new template.
 */
export async function replace(
  method: ProcurementMethod,
  input: MilestoneTemplatePayload,
  actor: Actor,
): Promise<MilestoneTemplateDto[]> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.milestoneTemplate.findMany({
      where: { method },
      select,
      orderBy: order,
    });
    await tx.milestoneTemplate.deleteMany({ where: { method } });
    await tx.milestoneTemplate.createMany({
      data: input.items.map((item) => ({ method, ...item })),
    });
    const after = await tx.milestoneTemplate.findMany({
      where: { method },
      select,
      orderBy: order,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: 'MilestoneTemplate',
      entityId: method,
      before,
      after,
    });
    return after;
  });
}
