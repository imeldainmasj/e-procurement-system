import {
  canViewAllPrs,
  DASHBOARD_ANALYTICS_ROLES,
  hasAnyRole,
  type DashboardSummaryDto,
  type LeadTimeDto,
  type PoStatus,
  type PrStatus,
  type SpendingDto,
  type SpendingGroup,
  type VendorPerformanceDto,
} from '@sipita/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import * as prService from '../purchase-requests/purchase-requests.service.js';

/** Committed spend: POs that were issued (CLAUDE.md §6 "ISSUED ke atas"). */
const SPEND_STATUSES: PoStatus[] = ['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'];
const FINISHED: PrStatus[] = [
  'DRAFT',
  'COMPLETED',
  'FULFILLED_FROM_STOCK',
  'REJECTED',
  'CANCELLED',
];

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const zero = () => new Prisma.Decimal(0);
const currentYear = () => dayjs().tz().year();
/** PO dates are DATE columns (UTC midnight), so their calendar day is the ISO date. */
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (list: number[]) =>
  list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null;
const daysBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86_400_000;

function yearRange(year: number) {
  return { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) };
}

const isAnalyst = (actor: Actor) => hasAnyRole(actor.roles, DASHBOARD_ANALYTICS_ROLES);

// ─── Summary ─────────────────────────────────────────────────────────────────

async function spendBetween(from: string, to: string) {
  const agg = await prisma.purchaseOrder.aggregate({
    where: {
      status: { in: SPEND_STATUSES },
      orderDate: { gte: new Date(from), lte: new Date(to) },
    },
    _sum: { total: true },
    _count: { _all: true },
  });
  return { amount: agg._sum.total ?? zero(), count: agg._count._all };
}

export async function summary(actor: Actor): Promise<DashboardSummaryDto> {
  const visible = prService.visibilityFilter(actor);
  const grouped = await prisma.purchaseRequest.groupBy({
    by: ['status'],
    where: visible,
    _count: { _all: true },
  });
  const prByStatus: Partial<Record<PrStatus, number>> = {};
  for (const row of grouped) prByStatus[row.status] = row._count._all;
  const count = (statuses: PrStatus[]) =>
    statuses.reduce((sum, s) => sum + (prByStatus[s] ?? 0), 0);
  const activePrs = grouped
    .filter((r) => !FINISHED.includes(r.status))
    .reduce((sum, r) => sum + r._count._all, 0);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { approvalLevel: true },
  });
  const pendingMyApprovals =
    actor.roles.includes('APPROVER') && user.approvalLevel !== null
      ? await prisma.approvalStep.count({
          where: {
            status: 'PENDING',
            level: user.approvalLevel,
            memo: { pr: { requesterId: { not: actor.userId } } },
          },
        })
      : null;

  const analyst = isAnalyst(actor);
  let spending: DashboardSummaryDto['spending'] = null;
  if (analyst) {
    const now = dayjs().tz();
    const [thisMonth, lastMonth, ytd] = await Promise.all([
      spendBetween(
        now.startOf('month').format('YYYY-MM-DD'),
        now.endOf('month').format('YYYY-MM-DD'),
      ),
      spendBetween(
        now.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
        now.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
      ),
      spendBetween(now.startOf('year').format('YYYY-MM-DD'), now.format('YYYY-MM-DD')),
    ]);
    spending = {
      thisMonth: thisMonth.amount.toFixed(2),
      lastMonth: lastMonth.amount.toFixed(2),
      yearToDate: ytd.amount.toFixed(2),
      purchaseOrdersThisMonth: thisMonth.count,
    };
  }

  const recent = await prService.list(
    { page: 1, limit: 5, sort: 'createdAt:desc' } as Parameters<typeof prService.list>[0],
    actor,
  );

  return {
    scope: canViewAllPrs({ id: actor.userId, roles: actor.roles }) ? 'all' : 'own',
    prByStatus,
    activePrs,
    awaitingQuotation: count(['APPROVED', 'QUOTATION']),
    openPurchaseOrders:
      analyst || hasAnyRole(actor.roles, ['WAREHOUSE'])
        ? await prisma.purchaseOrder.count({
            where: { status: { in: ['ISSUED', 'PARTIALLY_RECEIVED'] } },
          })
        : count(['PO_ISSUED', 'PARTIALLY_RECEIVED']),
    pendingMyApprovals,
    awaitingStockCheck: hasAnyRole(actor.roles, ['WAREHOUSE'])
      ? count(['SUBMITTED', 'STOCK_CHECK'])
      : null,
    spending,
    recentPrs: recent.data,
  };
}

// ─── Spending ────────────────────────────────────────────────────────────────

/**
 * Committed spend for `year`, grouped. Amounts include PPN; for the category breakdown each
 * PO line gets its share of the PO's tax.
 */
export async function spending(groupBy: SpendingGroup, year = currentYear()): Promise<SpendingDto> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { status: { in: SPEND_STATUSES }, orderDate: yearRange(year) },
    select: {
      id: true,
      orderDate: true,
      subtotal: true,
      total: true,
      vendor: { select: { id: true, name: true } },
      pr: { select: { division: { select: { id: true, name: true } } } },
      items: {
        select: {
          subtotal: true,
          item: { select: { category: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const rows = new Map<string, { label: string; amount: Prisma.Decimal; pos: Set<string> }>();
  const add = (key: string, label: string, amount: Prisma.Decimal, poId: string) => {
    const row = rows.get(key) ?? { label, amount: zero(), pos: new Set<string>() };
    row.amount = row.amount.add(amount);
    row.pos.add(poId);
    rows.set(key, row);
  };
  if (groupBy === 'month') {
    MONTH_LABELS.forEach((label, i) =>
      rows.set(String(i + 1).padStart(2, '0'), { label, amount: zero(), pos: new Set() }),
    );
  }

  for (const po of pos) {
    if (groupBy === 'month') {
      const month = ymd(po.orderDate).slice(5, 7);
      add(month, MONTH_LABELS[Number(month) - 1]!, po.total, po.id);
    } else if (groupBy === 'vendor') {
      add(po.vendor.id, po.vendor.name, po.total, po.id);
    } else if (groupBy === 'division') {
      add(po.pr.division.id, po.pr.division.name, po.total, po.id);
    } else {
      const ratio = po.subtotal.isZero() ? new Prisma.Decimal(1) : po.total.div(po.subtotal);
      for (const line of po.items) {
        const category = line.item?.category;
        add(
          category?.id ?? 'other',
          category?.name ?? 'Lainnya (item manual)',
          line.subtotal.mul(ratio),
          po.id,
        );
      }
    }
  }

  const list = [...rows.entries()].map(([key, r]) => ({
    key,
    label: r.label,
    amount: r.amount.toDecimalPlaces(2).toFixed(2),
    purchaseOrders: r.pos.size,
  }));
  if (groupBy !== 'month') list.sort((a, b) => Number(b.amount) - Number(a.amount));
  return {
    year,
    groupBy,
    total: pos.reduce((sum, po) => sum.add(po.total), zero()).toFixed(2),
    rows: list,
  };
}

// ─── Lead time ───────────────────────────────────────────────────────────────

/**
 * Average days from submission to PO issue (by PO issue month), to goods received (from the
 * PR status history), and for the approval itself (memo created → decided).
 */
export async function leadTime(year = currentYear()): Promise<LeadTimeDto> {
  const range = {
    gte: dayjs.tz(`${year}-01-01`).startOf('day').toDate(),
    lte: dayjs.tz(`${year}-12-31`).endOf('day').toDate(),
  };
  const [pos, memos, receivedLogs] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { in: SPEND_STATUSES }, issuedAt: range },
      select: { issuedAt: true, pr: { select: { submittedAt: true } } },
    }),
    prisma.internalMemo.findMany({
      where: { status: 'APPROVED', decidedAt: range },
      select: { createdAt: true, decidedAt: true },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: 'PurchaseRequest',
        action: 'STATUS_CHANGE',
        createdAt: range,
        after: { path: ['status'], equals: 'RECEIVED' },
      },
      select: { entityId: true, createdAt: true },
    }),
  ]);

  const submitToPo = pos.flatMap((po) =>
    po.issuedAt && po.pr.submittedAt
      ? [
          {
            month: dayjs(po.issuedAt).tz().format('MM'),
            days: daysBetween(po.pr.submittedAt, po.issuedAt),
          },
        ]
      : [],
  );
  const submittedAt = new Map(
    (
      await prisma.purchaseRequest.findMany({
        where: { id: { in: receivedLogs.map((l) => l.entityId) } },
        select: { id: true, submittedAt: true },
      })
    ).map((pr) => [pr.id, pr.submittedAt]),
  );
  const toReceived = receivedLogs.flatMap((log) => {
    const submitted = submittedAt.get(log.entityId);
    return submitted ? [daysBetween(submitted, log.createdAt)] : [];
  });

  return {
    year,
    submitToPoDays: avg(submitToPo.map((s) => s.days)),
    submitToReceivedDays: avg(toReceived),
    approvalDays: avg(memos.map((m) => daysBetween(m.createdAt, m.decidedAt!))),
    byMonth: MONTH_LABELS.map((label, i) => {
      const month = String(i + 1).padStart(2, '0');
      const inMonth = submitToPo.filter((s) => s.month === month).map((s) => s.days);
      return { month: label, submitToPoDays: avg(inMonth), count: inMonth.length };
    }),
  };
}

// ─── Vendor performance ──────────────────────────────────────────────────────

/** Vendors with committed spend in `year`, by amount, with their all-time rating. */
export async function vendorPerformance(year = currentYear()): Promise<VendorPerformanceDto[]> {
  const spend = await prisma.purchaseOrder.groupBy({
    by: ['vendorId'],
    where: { status: { in: SPEND_STATUSES }, orderDate: yearRange(year) },
    _sum: { total: true },
    _count: { _all: true },
  });
  const ids = spend.map((s) => s.vendorId);
  const [vendors, ratings] = await Promise.all([
    prisma.vendor.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    }),
    prisma.vendorRating.groupBy({
      by: ['vendorId'],
      where: { vendorId: { in: ids } },
      _avg: { onTime: true, quality: true, price: true, service: true },
      _count: { _all: true },
    }),
  ]);
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const ratingById = new Map(ratings.map((r) => [r.vendorId, r]));

  return spend
    .map((s) => {
      const r = ratingById.get(s.vendorId);
      const parts = r ? [r._avg.onTime, r._avg.quality, r._avg.price, r._avg.service] : [];
      const overall =
        parts.length && parts.every((p) => p !== null)
          ? round1((parts as number[]).reduce((a, b) => a + b, 0) / parts.length)
          : null;
      return {
        vendor: vendorById.get(s.vendorId)!,
        purchaseOrders: s._count._all,
        amount: (s._sum.total ?? zero()).toFixed(2),
        rating: overall,
        ratingCount: r?._count._all ?? 0,
        onTimeRating: r?._avg.onTime != null ? round1(r._avg.onTime) : null,
      };
    })
    .sort((a, b) => Number(b.amount) - Number(a.amount));
}
