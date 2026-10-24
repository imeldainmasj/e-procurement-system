import type { ApprovalInboxItemDto, approvalListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { type Email, sendMailInBackground } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta } from '../../utils/pagination.js';
import { approveStep, rejectStep } from './approval-workflow.js';

type ListQuery = z.output<typeof approvalListQuerySchema>;

const inboxSelect = {
  id: true,
  level: true,
  sequence: true,
  status: true,
  comment: true,
  actedAt: true,
  pendingSince: true,
  approver: { select: { id: true, name: true } },
  memo: {
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      _count: { select: { steps: true } },
      pr: {
        select: {
          id: true,
          number: true,
          title: true,
          priority: true,
          estimatedTotal: true,
          neededDate: true,
          requester: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.ApprovalStepSelect;

type InboxRecord = Prisma.ApprovalStepGetPayload<{ select: typeof inboxSelect }>;

function toDto(s: InboxRecord): ApprovalInboxItemDto {
  const { pr } = s.memo;
  return {
    id: s.id,
    level: s.level,
    sequence: s.sequence,
    status: s.status,
    approver: s.approver,
    comment: s.comment,
    actedAt: iso(s.actedAt),
    pendingSince: iso(s.pendingSince),
    memo: {
      id: s.memo.id,
      number: s.memo.number,
      subject: s.memo.subject,
      status: s.memo.status,
      totalLevels: s.memo._count.steps,
    },
    pr: {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      priority: pr.priority,
      estimatedTotal: pr.estimatedTotal.toFixed(2),
      neededDate: pr.neededDate.toISOString().slice(0, 10),
      requester: pr.requester,
      division: pr.division,
    },
  };
}

async function approverLevelOf(userId: string): Promise<number | null> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { approvalLevel: true },
  });
  return user.approvalLevel;
}

/** Steps waiting for the actor's level (excluding their own PRs). */
async function pendingWhere(actor: Actor): Promise<Prisma.ApprovalStepWhereInput | null> {
  const level = actor.roles.includes('APPROVER') ? await approverLevelOf(actor.userId) : null;
  if (level === null) return null;
  return { status: 'PENDING', level, memo: { pr: { requesterId: { not: actor.userId } } } };
}

export async function list(q: ListQuery, actor: Actor) {
  let where: Prisma.ApprovalStepWhereInput;
  if (q.tab === 'pending') {
    const pending = await pendingWhere(actor);
    if (!pending) return { data: [], meta: pageMeta(q, 0) };
    where = pending;
  } else {
    where = { approverId: actor.userId, ...(q.status && { status: q.status }) };
  }
  if (q.search) {
    const contains = { contains: q.search, mode: 'insensitive' as const };
    where = {
      AND: [
        where,
        {
          OR: [
            { memo: { number: contains } },
            { memo: { pr: { number: contains } } },
            { memo: { pr: { title: contains } } },
          ],
        },
      ],
    };
  }

  const [rows, total] = await prisma.$transaction([
    prisma.approvalStep.findMany({
      where,
      select: inboxSelect,
      orderBy: buildOrderBy<Prisma.ApprovalStepOrderByWithRelationInput>(
        q.sort,
        ['pendingSince', 'actedAt', 'memo.number', 'memo.pr.estimatedTotal', 'memo.pr.neededDate'],
        q.tab === 'pending' ? { pendingSince: 'asc' } : { actedAt: 'desc' },
      ),
      ...pageArgs(q),
    }),
    prisma.approvalStep.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

export async function pendingCount(actor: Actor): Promise<number> {
  const where = await pendingWhere(actor);
  return where ? prisma.approvalStep.count({ where }) : 0;
}

async function decide(
  run: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<Email[]>,
  stepId: string,
) {
  const emails = await prisma.$transaction(run);
  sendMailInBackground(emails);
  const step = await prisma.approvalStep.findUniqueOrThrow({
    where: { id: stepId },
    select: inboxSelect,
  });
  return toDto(step);
}

export function approve(stepId: string, comment: string | null, actor: Actor) {
  return decide((tx) => approveStep(tx, stepId, comment, actor), stepId);
}

export function reject(stepId: string, reason: string, actor: Actor) {
  return decide((tx) => rejectStep(tx, stepId, reason, actor), stepId);
}
