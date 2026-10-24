import {
  canViewPr,
  hasAnyRole,
  type MemoDto,
  type MemoListItemDto,
  type memoListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta } from '../../utils/pagination.js';
import { toStepDto } from '../purchase-requests/purchase-requests.service.js';

type ListQuery = z.output<typeof memoListQuerySchema>;

/** Roles with access to the memo list; others reach a memo through its PR. */
export const MEMO_ROLES = ['PROCUREMENT', 'APPROVER'] as const;

const listSelect = {
  id: true,
  number: true,
  subject: true,
  status: true,
  totalAmount: true,
  createdAt: true,
  decidedAt: true,
  steps: { where: { status: 'PENDING' }, select: { level: true }, take: 1 },
  pr: {
    select: {
      id: true,
      number: true,
      title: true,
      requester: { select: { id: true, name: true } },
      division: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InternalMemoSelect;

const stepSelect = {
  id: true,
  level: true,
  sequence: true,
  status: true,
  comment: true,
  actedAt: true,
  pendingSince: true,
  approver: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalStepSelect;

const detailSelect = {
  id: true,
  number: true,
  subject: true,
  body: true,
  status: true,
  totalAmount: true,
  createdAt: true,
  decidedAt: true,
  createdBy: { select: { id: true, name: true } },
  steps: { orderBy: { sequence: 'asc' }, select: stepSelect },
  pr: {
    select: {
      ...listSelect.pr.select,
      priority: true,
      neededDate: true,
      status: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          itemId: true,
          freeTextName: true,
          unit: true,
          qty: true,
          estimatedUnitPrice: true,
          subtotal: true,
          notes: true,
          item: { select: { id: true, code: true, name: true, isAsset: true } },
        },
      },
    },
  },
} satisfies Prisma.InternalMemoSelect;

export type MemoDetailRecord = Prisma.InternalMemoGetPayload<{ select: typeof detailSelect }>;

type ListRecord = Prisma.InternalMemoGetPayload<{ select: typeof listSelect }>;

function toListDto(m: ListRecord): MemoListItemDto {
  return {
    id: m.id,
    number: m.number,
    subject: m.subject,
    status: m.status,
    totalAmount: m.totalAmount.toFixed(2),
    currentLevel: m.steps[0]?.level ?? null,
    pr: { id: m.pr.id, number: m.pr.number, title: m.pr.title },
    requester: m.pr.requester,
    division: m.pr.division,
    createdAt: iso(m.createdAt),
    decidedAt: iso(m.decidedAt),
  };
}

export async function list(q: ListQuery) {
  const contains = q.search ? { contains: q.search, mode: 'insensitive' as const } : undefined;
  const where: Prisma.InternalMemoWhereInput = {
    ...(q.status && { status: q.status }),
    ...(contains && {
      OR: [{ number: contains }, { subject: contains }, { pr: { number: contains } }],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.internalMemo.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy<Prisma.InternalMemoOrderByWithRelationInput>(
        q.sort,
        ['number', 'subject', 'status', 'totalAmount', 'createdAt', 'decidedAt'],
        { createdAt: 'desc' },
      ),
      ...pageArgs(q),
    }),
    prisma.internalMemo.count({ where }),
  ]);
  return { data: rows.map(toListDto), meta: pageMeta(q, total) };
}

/** Loads a memo with everything the detail page and the PDF need, enforcing visibility. */
export async function findVisible(id: string, actor: Actor): Promise<MemoDetailRecord> {
  const memo = await prisma.internalMemo.findUnique({ where: { id }, select: detailSelect });
  const allowed =
    memo !== null &&
    (hasAnyRole(actor.roles, [...MEMO_ROLES]) ||
      canViewPr(
        { requesterId: memo.pr.requester.id, status: memo.pr.status },
        { id: actor.userId, roles: actor.roles },
      ));
  if (!memo || !allowed) throw AppError.notFound('Memo tidak ditemukan');
  return memo;
}

export async function get(id: string, actor: Actor): Promise<MemoDto> {
  const memo = await findVisible(id, actor);
  const pendingLevels = memo.steps
    .filter((s) => s.status === 'PENDING')
    .map((s) => ({ level: s.level }));
  return {
    ...toListDto({ ...memo, steps: pendingLevels }),
    body: memo.body,
    priority: memo.pr.priority,
    neededDate: memo.pr.neededDate.toISOString().slice(0, 10),
    createdBy: memo.createdBy,
    steps: memo.steps.map(toStepDto),
    items: memo.pr.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      item: i.item,
      freeTextName: i.freeTextName,
      name: i.item?.name ?? i.freeTextName ?? '',
      unit: i.unit,
      qty: i.qty,
      estimatedUnitPrice: i.estimatedUnitPrice.toFixed(2),
      subtotal: i.subtotal.toFixed(2),
      notes: i.notes,
    })),
  };
}
