import {
  MILESTONE_TYPE_LABELS,
  MILESTONE_TYPES,
  milestoneLabel,
  type AgreementBriefDto,
  type BoardColumnDto,
  type ManagerDashboardDto,
  type StaffDashboardDto,
  type StaffMonitoringDto,
  type StageCountDto,
  type TeamMemberDto,
  type WorkBriefDto,
} from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { num } from '../../utils/money.js';
import { currentStages, isStale, staleCutoff } from '../../utils/procurementRules.js';
import { effectiveEnd } from '../agreements/agreements.dto.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * Dashboard & Monitoring Tim (CLAUDE.md §10). Counts and sums are aggregated in the
 * database; the "current stage" is derived from milestones and therefore computed only
 * for the open (ACTIVE / ON_HOLD) works, never over the whole history.
 */

const live = { deletedAt: null };
const OPEN = { in: ['ACTIVE' as const, 'ON_HOLD' as const] };
const today = () => dayjs().tz().format('YYYY-MM-DD');

const briefSelect = {
  id: true,
  code: true,
  title: true,
  status: true,
  method: true,
  lastUpdatedAt: true,
  pic: { select: { id: true, name: true } },
  milestones: {
    select: { type: true, sequence: true, status: true, prerequisites: true, executor: true },
    orderBy: { sequence: 'asc' },
  },
} satisfies Prisma.WorkSelect;

type BriefRecord = Prisma.WorkGetPayload<{ select: typeof briefSelect }>;
type Settings = Awaited<ReturnType<typeof getSettings>>;

function toBrief(w: BriefRecord, settings: Settings): WorkBriefDto {
  const stages = currentStages(w.milestones).map((m) => ({
    type: m.type,
    label: milestoneLabel(m.type, w.method),
    executor: m.executor,
    status: m.status,
  }));
  return {
    id: w.id,
    code: w.code,
    title: w.title,
    status: w.status,
    pic: w.pic,
    lastUpdatedAt: iso(w.lastUpdatedAt),
    isStale: isStale(w, settings),
    currentStages: stages,
    waitingOutsideIt: stages.length > 0 && stages.every((s) => s.executor !== 'IT'),
  };
}

async function openWorks(
  where: Prisma.WorkWhereInput,
  settings: Settings,
): Promise<WorkBriefDto[]> {
  const rows = await prisma.work.findMany({
    where: { ...live, status: OPEN, ...where },
    select: briefSelect,
    orderBy: { lastUpdatedAt: 'asc' },
  });
  return rows.map((w) => toBrief(w, settings));
}

const reminderWindow = (s: Settings) => Math.max(0, ...s.CONTRACT_REMINDER_DAYS);

// ─── Staff dashboard ─────────────────────────────────────────────────────────

export async function staffDashboard(userId: string): Promise<StaffDashboardDto> {
  const settings = await getSettings();
  const window = reminderWindow(settings);
  const t = today();
  const [works, agreements] = await Promise.all([
    openWorks({ picId: userId }, settings),
    prisma.agreement.findMany({
      where: {
        ...live,
        picId: userId,
        status: { not: 'TERMINATED' },
        // Addendums can only extend the end date, so the stored end is a safe lower bound.
        periodEnd: { lte: new Date(dayjs(t).add(window, 'day').format('YYYY-MM-DD')) },
      },
      select: {
        id: true,
        agreementNo: true,
        title: true,
        status: true,
        periodEnd: true,
        vendor: { select: { name: true } },
        addendums: { where: live, select: { newPeriodEnd: true } },
      },
    }),
  ]);

  const expiring: AgreementBriefDto[] = agreements
    .map((a) => {
      const end = effectiveEnd(a);
      return {
        id: a.id,
        agreementNo: a.agreementNo,
        title: a.title,
        vendorName: a.vendor.name,
        effectivePeriodEnd: end,
        daysLeft: Math.round((Date.parse(end) - Date.parse(t)) / 86_400_000),
        status: a.status,
      };
    })
    .filter((a) => a.daysLeft >= 0 && a.daysLeft <= window)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    activeCount: works.filter((w) => w.status === 'ACTIVE').length,
    onHoldCount: works.filter((w) => w.status === 'ON_HOLD').length,
    staleDays: settings.STALE_WORK_DAYS,
    stale: works.filter((w) => w.isStale),
    waitingOutside: works.filter((w) => w.status === 'ACTIVE' && w.waitingOutsideIt),
    reminderWindow: window,
    expiringAgreements: expiring,
  };
}

// ─── Manager dashboard ───────────────────────────────────────────────────────

function stageDistribution(works: WorkBriefDto[]): StageCountDto[] {
  const counts = new Map<string, StageCountDto>();
  for (const w of works) {
    if (w.status !== 'ACTIVE') continue;
    for (const s of w.currentStages) {
      const c = counts.get(s.type) ?? {
        type: s.type,
        // Generic name: the same column collects e.g. Memo, Memo PL and Memo PK.
        label: MILESTONE_TYPE_LABELS[s.type],
        executor: s.executor,
        count: 0,
      };
      c.count++;
      counts.set(s.type, c);
    }
  }
  return MILESTONE_TYPES.map((t) => counts.get(t)).filter(
    (c): c is StageCountDto => c !== undefined,
  );
}

export async function managerDashboard(): Promise<ManagerDashboardDto> {
  const settings = await getSettings();
  const year = dayjs().tz().year();
  const cutoff = staleCutoff(settings);
  const notCancelled = { ...live, status: { not: 'CANCELLED' as const } };

  const [
    statusCounts,
    completedThisYear,
    valueThis,
    valueLast,
    expiring,
    byYear,
    workloadRows,
    staleRows,
    works,
  ] = await Promise.all([
    prisma.work.groupBy({
      by: ['status'],
      where: { ...live, status: OPEN },
      _count: { _all: true },
    }),
    prisma.work.count({ where: { ...live, status: 'COMPLETED', procurementYear: year } }),
    prisma.work.aggregate({
      where: { ...notCancelled, procurementYear: year },
      _sum: { amountIdr: true },
    }),
    prisma.work.aggregate({
      where: { ...notCancelled, procurementYear: year - 1 },
      _sum: { amountIdr: true },
    }),
    prisma.agreement.count({ where: { ...live, status: 'EXPIRING_SOON' } }),
    prisma.work.groupBy({
      by: ['procurementYear'],
      where: notCancelled,
      _sum: { amountIdr: true },
      _count: { _all: true },
      orderBy: { procurementYear: 'asc' },
    }),
    prisma.work.groupBy({
      by: ['picId', 'status'],
      where: { ...live, status: OPEN },
      _count: { _all: true },
    }),
    prisma.work.groupBy({
      by: ['picId'],
      where: { ...live, status: 'ACTIVE', lastUpdatedAt: { lt: cutoff } },
      _count: { _all: true },
    }),
    openWorks({}, settings),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(workloadRows.map((r) => r.picId))] } },
    select: { id: true, name: true },
  });
  const workload = users
    .map((user) => {
      const count = (status: string) =>
        workloadRows.find((r) => r.picId === user.id && r.status === status)?._count._all ?? 0;
      return {
        user,
        active: count('ACTIVE'),
        onHold: count('ON_HOLD'),
        stale: staleRows.find((r) => r.picId === user.id)?._count._all ?? 0,
      };
    })
    .sort((a, b) => b.active + b.onHold - (a.active + a.onHold));
  const statusCount = (s: string) => statusCounts.find((r) => r.status === s)?._count._all ?? 0;
  const stale = works.filter((w) => w.isStale);

  return {
    year,
    staleDays: settings.STALE_WORK_DAYS,
    reminderWindow: reminderWindow(settings),
    kpi: {
      active: statusCount('ACTIVE'),
      onHold: statusCount('ON_HOLD'),
      completedThisYear,
      valueThisYear: valueThis._sum.amountIdr ? num(valueThis._sum.amountIdr) : 0,
      valueLastYear: valueLast._sum.amountIdr ? num(valueLast._sum.amountIdr) : 0,
      expiringAgreements: expiring,
      stale: stale.length,
    },
    workload,
    stale: stale.slice(0, 10),
    stageDistribution: stageDistribution(works),
    valueByYear: byYear.map((r) => ({
      year: r.procurementYear,
      amountIdr: r._sum.amountIdr ? num(r._sum.amountIdr) : 0,
      count: r._count._all,
    })),
  };
}

// ─── Monitoring Tim ──────────────────────────────────────────────────────────

/** Per staff member: open/completed counts, last update and the longest-waiting work. */
export async function team(): Promise<TeamMemberDto[]> {
  const settings = await getSettings();
  const cutoff = staleCutoff(settings);
  const [users, byStatus, lastUpdates, oldest, staleRows] = await Promise.all([
    prisma.user.findMany({
      where: { ...live, isActive: true },
      select: { id: true, name: true, jobLevel: true },
      orderBy: { name: 'asc' },
    }),
    prisma.work.groupBy({ by: ['picId', 'status'], where: live, _count: { _all: true } }),
    prisma.work.groupBy({
      by: ['picId'],
      where: { ...live, status: OPEN },
      _max: { lastUpdatedAt: true },
    }),
    prisma.work.groupBy({
      by: ['picId'],
      where: { ...live, status: 'ACTIVE' },
      _min: { lastUpdatedAt: true },
    }),
    prisma.work.groupBy({
      by: ['picId'],
      where: { ...live, status: 'ACTIVE', lastUpdatedAt: { lt: cutoff } },
      _count: { _all: true },
    }),
  ]);
  const oldestWorks = await prisma.work.findMany({
    where: {
      ...live,
      status: 'ACTIVE',
      OR: oldest.map((o) => ({ picId: o.picId, lastUpdatedAt: o._min.lastUpdatedAt! })),
    },
    select: { id: true, code: true, title: true, lastUpdatedAt: true, picId: true },
  });

  return users
    .map((user) => {
      const count = (status: string) =>
        byStatus.find((r) => r.picId === user.id && r.status === status)?._count._all ?? 0;
      const last = lastUpdates.find((r) => r.picId === user.id)?._max.lastUpdatedAt ?? null;
      const old = oldestWorks.find((w) => w.picId === user.id);
      return {
        user,
        active: count('ACTIVE'),
        onHold: count('ON_HOLD'),
        completed: count('COMPLETED'),
        stale: staleRows.find((r) => r.picId === user.id)?._count._all ?? 0,
        lastUpdateAt: iso(last),
        oldestWithoutUpdate: old
          ? { id: old.id, code: old.code, title: old.title, lastUpdatedAt: iso(old.lastUpdatedAt) }
          : null,
      };
    })
    .filter((m) => m.active + m.onHold + m.completed > 0 || m.user.jobLevel === 'STAFF');
}

/** Active works placed in the column of each current stage (a work with parallel stages appears in each). */
export async function board(): Promise<BoardColumnDto[]> {
  const settings = await getSettings();
  const works = await openWorks({ status: 'ACTIVE' }, settings);
  const columns = new Map<string, BoardColumnDto>();
  for (const w of works) {
    for (const s of w.currentStages) {
      const col = columns.get(s.type) ?? {
        type: s.type,
        label: MILESTONE_TYPE_LABELS[s.type],
        executor: s.executor,
        works: [],
      };
      col.works.push(w);
      columns.set(s.type, col);
    }
  }
  return MILESTONE_TYPES.map((t) => columns.get(t)).filter(
    (c): c is BoardColumnDto => c !== undefined,
  );
}

/** A staff member's open works with their current stage and latest progress note. */
export async function staff(userId: string): Promise<StaffMonitoringDto> {
  const settings = await getSettings();
  const user = await prisma.user.findFirst({
    where: { id: userId, ...live },
    select: { id: true, name: true, jobLevel: true },
  });
  if (!user) throw AppError.notFound('Pengguna tidak ditemukan');
  const works = await openWorks({ picId: userId }, settings);
  const latest = await prisma.workUpdate.findMany({
    where: { workId: { in: works.map((w) => w.id) } },
    distinct: ['workId'],
    orderBy: [{ workId: 'asc' }, { createdAt: 'desc' }],
    select: { workId: true, note: true, createdAt: true, author: { select: { name: true } } },
  });
  return {
    user,
    works: works.map((w) => {
      const u = latest.find((l) => l.workId === w.id);
      return {
        ...w,
        lastUpdate: u ? { note: u.note, createdAt: iso(u.createdAt), author: u.author.name } : null,
      };
    }),
  };
}
