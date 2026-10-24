import type { ApprovalRuleDto, ApprovalRuleListResult, ApprovalRulePayload } from '@sipita/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import {
  describeRange,
  findCoverageGaps,
  rangesOverlap,
  ruleMatches,
} from './approval-rules.logic.js';

const ENTITY = 'ApprovalRule';

type RuleRecord = Prisma.ApprovalRuleGetPayload<object>;

function toDto(r: RuleRecord): ApprovalRuleDto {
  return {
    id: r.id,
    name: r.name,
    minAmount: r.minAmount.toFixed(2),
    minInclusive: r.minInclusive,
    maxAmount: r.maxAmount ? r.maxAmount.toFixed(2) : null,
    maxInclusive: r.maxInclusive,
    levels: r.levels,
    isActive: r.isActive,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

function toData(input: ApprovalRulePayload) {
  return {
    ...input,
    minAmount: new Prisma.Decimal(input.minAmount),
    maxAmount: input.maxAmount === null ? null : new Prisma.Decimal(input.maxAmount),
  };
}

export async function list(): Promise<ApprovalRuleListResult> {
  const rules = await prisma.approvalRule.findMany({
    orderBy: [{ minAmount: 'asc' }, { createdAt: 'asc' }],
  });
  const gaps = findCoverageGaps(rules.filter((r) => r.isActive));
  return {
    rules: rules.map(toDto),
    warnings: gaps.map(
      (g) => `Nilai pengajuan ${describeRange(g)} belum tercakup aturan approval aktif.`,
    ),
  };
}

async function findOrThrow(id: string): Promise<RuleRecord> {
  const rule = await prisma.approvalRule.findUnique({ where: { id } });
  if (!rule) throw AppError.notFound('Aturan approval tidak ditemukan');
  return rule;
}

export async function get(id: string): Promise<ApprovalRuleDto> {
  return toDto(await findOrThrow(id));
}

/** Active rules must never overlap, otherwise an amount would map to two approval paths. */
async function assertNoOverlap(
  db: TxClient,
  data: ReturnType<typeof toData>,
  currentId?: string,
): Promise<void> {
  if (!data.isActive) return;
  const others = await db.approvalRule.findMany({
    where: { isActive: true, NOT: currentId ? { id: currentId } : undefined },
  });
  const clash = others.find((other) => rangesOverlap(data, other));
  if (clash) {
    throw AppError.conflict(
      `Rentang nilai bertabrakan dengan aturan "${clash.name}" (${describeRange(clash)})`,
    );
  }
}

// Serializable so two concurrent edits cannot both pass the overlap check.
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export async function create(input: ApprovalRulePayload, actor: Actor): Promise<ApprovalRuleDto> {
  const data = toData(input);
  const rule = await prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, data);
    const created = await tx.approvalRule.create({ data });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: toDto(created),
    });
    return created;
  }, serializable);
  return toDto(rule);
}

export async function update(
  id: string,
  input: ApprovalRulePayload,
  actor: Actor,
): Promise<ApprovalRuleDto> {
  const before = await findOrThrow(id);
  const data = toData(input);
  const rule = await prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, data, id);
    const updated = await tx.approvalRule.update({ where: { id }, data });
    await writeAuditLog(tx, {
      actor,
      action: before.isActive !== input.isActive ? 'STATUS_CHANGE' : 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDto(before),
      after: toDto(updated),
    });
    return updated;
  }, serializable);
  return toDto(rule);
}

export async function remove(id: string, actor: Actor): Promise<void> {
  const rule = await findOrThrow(id);
  await prisma.$transaction(async (tx) => {
    await tx.approvalRule.delete({ where: { id } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(rule),
    });
  });
}

/** Approval levels required for an estimated PR total, from the active rules. */
export async function resolveApprovalLevels(
  amount: number | string | Prisma.Decimal,
  db: TxClient = prisma,
): Promise<{ rule: ApprovalRuleDto; levels: number[] }> {
  const value = new Prisma.Decimal(amount);
  const rules = await db.approvalRule.findMany({ where: { isActive: true } });
  const rule = rules.find((r) => ruleMatches(r, value));
  if (!rule) {
    throw new AppError(
      422,
      'APPROVAL_RULE_NOT_FOUND',
      'Tidak ada aturan approval aktif untuk nilai pengajuan ini. Hubungi Super Admin.',
    );
  }
  return { rule: toDto(rule), levels: rule.levels };
}
