import {
  ANNUAL_GROUP_LABELS,
  DATA_ISSUE_LABELS,
  MILESTONE_TYPE_LABELS,
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  WORK_STATUS_LABELS,
  type AnnualGroupBy,
  type AnnualSummaryDto,
  type ComplianceDto,
  type DataIssue,
  type Executor,
  type ExpiringAgreementsDto,
  type MilestoneType,
  type ReportFilter,
  type TeamPerformanceDto,
  type VendorHistoryRowDto,
  type YoyTrendDto,
} from '@sipita/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import type { ReportDocument } from '../../lib/report-document.js';
import { num } from '../../utils/money.js';
import { computeIncreasePercent, staleCutoff } from '../../utils/procurementRules.js';
import { effectiveEnd } from '../agreements/agreements.dto.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * The six reports of CLAUDE.md §10. Aggregation runs in the database (Prisma groupBy /
 * aggregate, or parameterised SQL where Prisma cannot express it); each report returns
 * its JSON data plus the same figures as tables for the Excel/PDF export.
 */

export interface ReportResult<T> {
  data: T;
  document: ReportDocument;
}

const live = { deletedAt: null };
const thisYear = () => dayjs().tz().year();
const today = () => dayjs().tz().format('YYYY-MM-DD');
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Filters ─────────────────────────────────────────────────────────────────

/** Prisma filter for works; cancelled works are left out unless a status is chosen. */
function workWhere(
  f: ReportFilter,
  options: { year?: boolean } = { year: true },
): Prisma.WorkWhereInput {
  const years =
    options.year === false
      ? {}
      : f.year !== undefined
        ? { procurementYear: f.year }
        : f.yearFrom !== undefined || f.yearTo !== undefined
          ? { procurementYear: { gte: f.yearFrom, lte: f.yearTo } }
          : {};
  return {
    ...live,
    ...years,
    status: f.status ?? { not: 'CANCELLED' },
    ...(f.method && { method: f.method }),
    ...(f.procurementType && { procurementType: f.procurementType }),
    ...(f.category && { category: f.category }),
    ...(f.vendorId && { vendorId: f.vendorId }),
    ...(f.picId && { picId: f.picId }),
  };
}

/** Same filter as parameterised SQL on the `works` table aliased `w`. */
function workSql(f: ReportFilter): Prisma.Sql {
  const c: Prisma.Sql[] = [Prisma.sql`w.deleted_at IS NULL`];
  if (f.year !== undefined) c.push(Prisma.sql`w.procurement_year = ${f.year}`);
  if (f.yearFrom !== undefined) c.push(Prisma.sql`w.procurement_year >= ${f.yearFrom}`);
  if (f.yearTo !== undefined) c.push(Prisma.sql`w.procurement_year <= ${f.yearTo}`);
  c.push(
    f.status
      ? Prisma.sql`w.status = ${f.status}::"WorkStatus"`
      : Prisma.sql`w.status <> 'CANCELLED'::"WorkStatus"`,
  );
  if (f.method) c.push(Prisma.sql`w.method = ${f.method}::"ProcurementMethod"`);
  if (f.procurementType)
    c.push(Prisma.sql`w.procurement_type = ${f.procurementType}::"ProcurementType"`);
  if (f.category) c.push(Prisma.sql`w.category = ${f.category}::"ProjectCategory"`);
  if (f.vendorId) c.push(Prisma.sql`w.vendor_id = ${f.vendorId}::uuid`);
  if (f.picId) c.push(Prisma.sql`w.pic_id = ${f.picId}::uuid`);
  return Prisma.join(c, ' AND ');
}

/** Human-readable filter summary for the export header. */
async function filterText(f: ReportFilter, extra: string[] = []): Promise<string[]> {
  const out: string[] = [];
  if (f.year !== undefined) out.push(`Tahun ${f.year}`);
  else if (f.yearFrom !== undefined || f.yearTo !== undefined) {
    out.push(`Tahun ${f.yearFrom ?? '…'}–${f.yearTo ?? '…'}`);
  }
  if (f.method) out.push(`Metode: ${PROCUREMENT_METHOD_LABELS[f.method]}`);
  if (f.procurementType) out.push(`Jenis: ${PROCUREMENT_TYPE_LABELS[f.procurementType]}`);
  if (f.category) out.push(`Kategori: ${PROJECT_CATEGORY_LABELS[f.category]}`);
  if (f.status) out.push(`Status: ${WORK_STATUS_LABELS[f.status]}`);
  if (f.vendorId) {
    const v = await prisma.vendor.findUnique({ where: { id: f.vendorId }, select: { name: true } });
    out.push(`Vendor: ${v?.name ?? '-'}`);
  }
  if (f.picId) {
    const u = await prisma.user.findUnique({ where: { id: f.picId }, select: { name: true } });
    out.push(`PIC: ${u?.name ?? '-'}`);
  }
  return [...out, ...extra];
}

const sumOf = (d: Prisma.Decimal | null) => (d ? num(d) : 0);

// ─── 1. Rekap tahunan ────────────────────────────────────────────────────────

const GROUP_FIELD = {
  method: 'method',
  procurementType: 'procurementType',
  category: 'category',
  vendor: 'vendorId',
  directorate: 'requesterDirectorateId',
} as const satisfies Record<AnnualGroupBy, keyof Prisma.WorkGroupByOutputType>;

export async function annualSummary(
  f: ReportFilter,
  groupBy: AnnualGroupBy | undefined,
): Promise<ReportResult<AnnualSummaryDto>> {
  const where = workWhere(f);
  const years = await prisma.work.groupBy({
    by: ['procurementYear'],
    where,
    _sum: { amountIdr: true },
    _count: { _all: true },
    orderBy: { procurementYear: 'asc' },
  });

  let groups: AnnualSummaryDto['groups'] = [];
  let cells: AnnualSummaryDto['cells'] = [];
  if (groupBy) {
    const field = GROUP_FIELD[groupBy];
    const rows = await prisma.work.groupBy({
      by: ['procurementYear', field],
      where,
      _sum: { amountIdr: true },
      _count: { _all: true },
      orderBy: { procurementYear: 'asc' },
    });
    const keyOf = (r: (typeof rows)[number]) => String(r[field] ?? 'NONE');
    const ids = [
      ...new Set(rows.map((r) => r[field]).filter((v): v is string => typeof v === 'string')),
    ];
    const names = new Map<string, string>(
      groupBy === 'vendor'
        ? (
            await prisma.vendor.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
            })
          ).map((v) => [v.id, v.name])
        : groupBy === 'directorate'
          ? (
              await prisma.directorate.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
              })
            ).map((d) => [d.id, d.name])
          : Object.entries(
              groupBy === 'method'
                ? PROCUREMENT_METHOD_LABELS
                : groupBy === 'procurementType'
                  ? PROCUREMENT_TYPE_LABELS
                  : PROJECT_CATEGORY_LABELS,
            ),
    );
    cells = rows.map((r) => ({
      year: r.procurementYear,
      key: keyOf(r),
      amountIdr: sumOf(r._sum.amountIdr),
      count: r._count._all,
    }));
    const totals = new Map<string, { amountIdr: number; count: number }>();
    for (const c of cells) {
      const t = totals.get(c.key) ?? { amountIdr: 0, count: 0 };
      totals.set(c.key, { amountIdr: t.amountIdr + c.amountIdr, count: t.count + c.count });
    }
    groups = [...totals.entries()]
      .map(([key, t]) => ({
        key,
        label: key === 'NONE' ? '(Tidak diisi)' : (names.get(key) ?? key),
        ...t,
      }))
      .sort((a, b) => b.amountIdr - a.amountIdr);
  }

  const data: AnnualSummaryDto = {
    groupBy: groupBy ?? null,
    years: years.map((y) => ({
      year: y.procurementYear,
      amountIdr: sumOf(y._sum.amountIdr),
      count: y._count._all,
    })),
    groups,
    cells,
    total: years.reduce(
      (t, y) => ({
        amountIdr: t.amountIdr + sumOf(y._sum.amountIdr),
        count: t.count + y._count._all,
      }),
      { amountIdr: 0, count: 0 },
    ),
  };

  const label = (key: string) => groups.find((g) => g.key === key)?.label ?? key;
  return {
    data,
    document: {
      title: 'Rekap Nilai Pengadaan per Tahun',
      filters: await filterText(
        f,
        groupBy ? [`Dipecah per ${ANNUAL_GROUP_LABELS[groupBy].toLowerCase()}`] : [],
      ),
      tables: [
        {
          title: 'Per tahun',
          columns: [
            { key: 'year', label: 'Tahun', kind: 'text', width: 10 },
            { key: 'count', label: 'Jumlah pekerjaan', kind: 'int', width: 18 },
            { key: 'amountIdr', label: 'Nilai (IDR)', kind: 'money', width: 22 },
          ],
          rows: [
            ...data.years.map((y) => ({
              year: String(y.year),
              count: y.count,
              amountIdr: y.amountIdr,
            })),
            { year: 'Total', count: data.total.count, amountIdr: data.total.amountIdr },
          ],
        },
        ...(groupBy
          ? [
              {
                title: `Per tahun & ${ANNUAL_GROUP_LABELS[groupBy].toLowerCase()}`,
                columns: [
                  { key: 'year', label: 'Tahun', kind: 'text' as const, width: 10 },
                  { key: 'group', label: ANNUAL_GROUP_LABELS[groupBy], width: 34 },
                  { key: 'count', label: 'Jumlah pekerjaan', kind: 'int' as const, width: 18 },
                  { key: 'amountIdr', label: 'Nilai (IDR)', kind: 'money' as const, width: 22 },
                ],
                rows: cells.map((c) => ({
                  year: String(c.year),
                  group: label(c.key),
                  count: c.count,
                  amountIdr: c.amountIdr,
                })),
              },
            ]
          : []),
      ],
    },
  };
}

// ─── 2. Tren year-to-year ────────────────────────────────────────────────────

export async function yoyTrend(
  f: ReportFilter,
  groupBy: 'work' | 'vendor',
): Promise<ReportResult<YoyTrendDto>> {
  const year = f.year ?? thisYear();
  let rows: YoyTrendDto['rows'];

  if (groupBy === 'work') {
    const works = await prisma.work.findMany({
      where: { ...workWhere({ ...f, year }), previousPurchaseAmount: { not: null } },
      select: {
        id: true,
        code: true,
        title: true,
        amountIdr: true,
        previousPurchaseAmount: true,
        increasePercent: true,
        vendor: { select: { id: true, name: true } },
      },
      orderBy: { increasePercent: 'desc' },
    });
    rows = works.map((w) => ({
      key: w.id,
      label: w.title,
      sub: [w.code, w.vendor?.name].filter(Boolean).join(' · '),
      workId: w.id,
      vendorId: w.vendor?.id ?? null,
      current: num(w.amountIdr),
      previous: w.previousPurchaseAmount ? num(w.previousPurchaseAmount) : null,
      increasePercent: w.increasePercent ? num(w.increasePercent) : null,
    }));
  } else {
    const sums = await prisma.work.groupBy({
      by: ['vendorId', 'procurementYear'],
      where: {
        ...workWhere({ ...f, year: undefined, yearFrom: year - 1, yearTo: year }),
        vendorId: { not: null },
      },
      _sum: { amountIdr: true },
    });
    const vendorIds = [...new Set(sums.map((s) => s.vendorId!))];
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, code: true, name: true },
    });
    rows = vendors
      .map((v) => {
        const at = (y: number) => sums.find((s) => s.vendorId === v.id && s.procurementYear === y);
        const current = sumOf(at(year)?._sum.amountIdr ?? null);
        const prev = at(year - 1);
        const previous = prev ? sumOf(prev._sum.amountIdr) : null;
        return {
          key: v.id,
          label: v.name,
          sub: v.code,
          workId: null,
          vendorId: v.id,
          current,
          previous,
          increasePercent: computeIncreasePercent(current, previous),
        };
      })
      .sort((a, b) => (b.increasePercent ?? -Infinity) - (a.increasePercent ?? -Infinity));
  }

  return {
    data: { year, groupBy, rows },
    document: {
      title: `Tren Kenaikan Year-to-Year ${year}`,
      filters: await filterText({ ...f, year }, [
        groupBy === 'work' ? 'Per pekerjaan' : 'Per vendor',
      ]),
      tables: [
        {
          columns: [
            { key: 'label', label: groupBy === 'work' ? 'Pekerjaan' : 'Vendor', width: 48 },
            { key: 'sub', label: groupBy === 'work' ? 'Kode · Vendor' : 'Kode', width: 30 },
            { key: 'previous', label: `${year - 1} (IDR)`, kind: 'money', width: 20 },
            { key: 'current', label: `${year} (IDR)`, kind: 'money', width: 20 },
            { key: 'increasePercent', label: 'Kenaikan', kind: 'percent', width: 12 },
          ],
          rows: rows.map((r) => ({
            label: r.label,
            sub: r.sub,
            previous: r.previous,
            current: r.current,
            increasePercent: r.increasePercent,
          })),
        },
      ],
    },
  };
}

// ─── 3. Jatuh tempo ──────────────────────────────────────────────────────────

export async function expiringAgreements(
  f: ReportFilter,
  days: number,
): Promise<ReportResult<ExpiringAgreementsDto>> {
  const t = today();
  const until = dayjs(t).add(days, 'day').format('YYYY-MM-DD');
  const rows = await prisma.agreement.findMany({
    where: {
      ...live,
      status: { not: 'TERMINATED' },
      // Addendums only extend contracts, so the stored end is a lower bound of the effective one.
      periodEnd: { lte: new Date(until) },
      ...(f.vendorId && { vendorId: f.vendorId }),
      ...(f.picId && { picId: f.picId }),
    },
    select: {
      id: true,
      agreementNo: true,
      title: true,
      periodEnd: true,
      amountIdr: true,
      vendor: { select: { id: true, name: true } },
      pic: { select: { id: true, name: true } },
      work: { select: { id: true, code: true } },
      addendums: { where: live, select: { newPeriodEnd: true } },
      extensions: {
        where: { ...live, status: { not: 'CANCELLED' } },
        select: { id: true, code: true, status: true },
        take: 1,
      },
    },
  });
  const agreements = rows
    .map((a) => {
      const end = effectiveEnd(a);
      return {
        id: a.id,
        agreementNo: a.agreementNo,
        title: a.title,
        vendor: a.vendor,
        pic: a.pic,
        work: a.work,
        effectivePeriodEnd: end,
        daysLeft: Math.round((Date.parse(end) - Date.parse(t)) / 86_400_000),
        amountIdr: num(a.amountIdr),
        renewal: a.extensions[0] ?? null,
      };
    })
    .filter((a) => a.effectivePeriodEnd >= t && a.effectivePeriodEnd <= until)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    data: { days, agreements },
    document: {
      title: `Agreement Jatuh Tempo ≤ ${days} Hari`,
      filters: await filterText({ ...f, year: undefined }, [
        `Per ${dayjs(t).format('DD/MM/YYYY')}`,
      ]),
      tables: [
        {
          columns: [
            { key: 'effectivePeriodEnd', label: 'Berakhir', kind: 'date', width: 12 },
            { key: 'daysLeft', label: 'Sisa hari', kind: 'int', width: 10 },
            { key: 'agreementNo', label: 'No. Agreement', width: 22 },
            { key: 'title', label: 'Judul', width: 44 },
            { key: 'vendor', label: 'Vendor', width: 30 },
            { key: 'pic', label: 'PIC', width: 18 },
            { key: 'amountIdr', label: 'Nilai (IDR)', kind: 'money', width: 20 },
            { key: 'renewal', label: 'Perpanjangan', width: 22 },
          ],
          rows: agreements.map((a) => ({
            effectivePeriodEnd: a.effectivePeriodEnd,
            daysLeft: a.daysLeft,
            agreementNo: a.agreementNo,
            title: a.title,
            vendor: a.vendor.name,
            pic: a.pic.name,
            amountIdr: a.amountIdr,
            renewal: a.renewal
              ? `${a.renewal.code} (${WORK_STATUS_LABELS[a.renewal.status as keyof typeof WORK_STATUS_LABELS]})`
              : 'Belum ada',
          })),
        },
      ],
    },
  };
}

// ─── 4. Riwayat vendor ───────────────────────────────────────────────────────

export async function vendorHistory(f: ReportFilter): Promise<ReportResult<VendorHistoryRowDto[]>> {
  const [works, agreements, active] = await Promise.all([
    prisma.work.groupBy({
      by: ['vendorId'],
      where: { ...workWhere(f), vendorId: f.vendorId ?? { not: null } },
      _count: { _all: true },
      _sum: { amountIdr: true },
      _min: { procurementYear: true },
      _max: { procurementYear: true },
    }),
    prisma.agreement.groupBy({
      by: ['vendorId'],
      where: { ...live, work: workWhere(f) },
      _count: { _all: true },
    }),
    prisma.agreement.groupBy({
      by: ['vendorId'],
      where: { ...live, status: { in: ['ACTIVE', 'EXPIRING_SOON'] }, work: workWhere(f) },
      _count: { _all: true },
    }),
  ]);
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: works.map((w) => w.vendorId!) } },
    select: { id: true, code: true, name: true },
  });
  const rows: VendorHistoryRowDto[] = works
    .map((w) => ({
      vendor: vendors.find((v) => v.id === w.vendorId)!,
      workCount: w._count._all,
      totalIdr: sumOf(w._sum.amountIdr),
      agreementCount: agreements.find((a) => a.vendorId === w.vendorId)?._count._all ?? 0,
      activeAgreements: active.find((a) => a.vendorId === w.vendorId)?._count._all ?? 0,
      firstYear: w._min.procurementYear,
      lastYear: w._max.procurementYear,
    }))
    .filter((r) => r.vendor)
    .sort((a, b) => b.totalIdr - a.totalIdr);

  return {
    data: rows,
    document: {
      title: 'Riwayat & Total Pengadaan per Vendor',
      filters: await filterText(f),
      tables: [
        {
          columns: [
            { key: 'code', label: 'Kode', width: 10 },
            { key: 'name', label: 'Vendor', width: 40 },
            { key: 'workCount', label: 'Pekerjaan', kind: 'int', width: 12 },
            { key: 'totalIdr', label: 'Total nilai (IDR)', kind: 'money', width: 22 },
            { key: 'agreementCount', label: 'Agreement', kind: 'int', width: 12 },
            { key: 'activeAgreements', label: 'Agreement aktif', kind: 'int', width: 16 },
            { key: 'years', label: 'Periode', width: 14 },
          ],
          rows: rows.map((r) => ({
            code: r.vendor.code,
            name: r.vendor.name,
            workCount: r.workCount,
            totalIdr: r.totalIdr,
            agreementCount: r.agreementCount,
            activeAgreements: r.activeAgreements,
            years:
              r.firstYear === r.lastYear ? String(r.firstYear) : `${r.firstYear}–${r.lastYear}`,
          })),
        },
      ],
    },
  };
}

// ─── 5. Kepatuhan ────────────────────────────────────────────────────────────

export async function compliance(
  f: ReportFilter,
  q: { code?: string; page: number; limit: number },
  all = false,
): Promise<ReportResult<ComplianceDto>> {
  // Cancelled works are kept here: incomplete documents matter for clean-up anyway.
  const filter: ReportFilter = { ...f };
  const byCode = await prisma.$queryRaw<{ code: string; count: bigint }[]>`
    SELECT issue->>'code' AS code, COUNT(DISTINCT w.id) AS count
    FROM works w, jsonb_array_elements(w.data_issues) AS issue
    WHERE ${workSql(filter)} AND w.has_data_issues
    GROUP BY 1 ORDER BY 2 DESC`;
  const where: Prisma.WorkWhereInput = {
    ...workWhere(filter),
    hasDataIssues: true,
    ...(q.code && { dataIssues: { array_contains: [{ code: q.code }] } }),
  };
  const [works, total, totalWorks] = await Promise.all([
    prisma.work.findMany({
      where,
      select: {
        id: true,
        code: true,
        title: true,
        procurementYear: true,
        method: true,
        dataIssues: true,
        pic: { select: { id: true, name: true } },
      },
      orderBy: [{ procurementYear: 'asc' }, { code: 'asc' }],
      // Exports list every matching work (capped); the page shows one page at a time.
      skip: all ? 0 : (q.page - 1) * q.limit,
      take: all ? 5000 : q.limit,
    }),
    prisma.work.count({ where }),
    prisma.work.count({ where: { ...workWhere(filter), hasDataIssues: true } }),
  ]);

  const data: ComplianceDto = {
    byCode: byCode.map((r) => ({
      code: r.code,
      label: DATA_ISSUE_LABELS[r.code] ?? r.code,
      count: Number(r.count),
    })),
    totalWorks,
    works: works.map((w) => ({ ...w, issues: w.dataIssues as unknown as DataIssue[] })),
    meta: { page: q.page, limit: q.limit, total },
  };
  return {
    data,
    document: {
      title: 'Kepatuhan & Kelengkapan Data',
      filters: await filterText(
        filter,
        q.code ? [`Masalah: ${DATA_ISSUE_LABELS[q.code] ?? q.code}`] : [],
      ),
      tables: [
        {
          title: 'Ringkasan',
          columns: [
            { key: 'label', label: 'Masalah', width: 44 },
            { key: 'count', label: 'Jumlah pekerjaan', kind: 'int', width: 18 },
          ],
          rows: data.byCode.map((r) => ({ label: r.label, count: r.count })),
        },
        {
          title: 'Daftar pekerjaan',
          columns: [
            { key: 'code', label: 'Kode', width: 16 },
            { key: 'title', label: 'Pekerjaan', width: 48 },
            { key: 'year', label: 'Tahun', kind: 'text', width: 8 },
            { key: 'method', label: 'Metode', width: 20 },
            { key: 'pic', label: 'PIC', width: 18 },
            { key: 'issues', label: 'Masalah', width: 60 },
          ],
          rows: data.works.map((w) => ({
            code: w.code,
            title: w.title,
            year: String(w.procurementYear),
            method: PROCUREMENT_METHOD_LABELS[w.method],
            pic: w.pic.name,
            issues: w.issues.map((i) => i.message).join('; '),
          })),
        },
      ],
    },
  };
}

// ─── 6. Kinerja tim ──────────────────────────────────────────────────────────

/**
 * Days each completed milestone took: from the completion of the previous stage (the latest
 * DONE milestone with a lower sequence, so parallel branches and N/A PVP are handled) to its
 * own completion; the first stage falls back to its explicit start. `startedAt` alone is not
 * used because a milestone completed by its document starts and ends on the document date.
 * Out-of-order (negative) durations from imported data are left out.
 */
function stageDurations(range: ReportFilter): Prisma.Sql {
  return Prisma.sql`
    SELECT * FROM (
      SELECT w.pic_id, m.type, m.executor,
             EXTRACT(EPOCH FROM (m.completed_at - COALESCE(prev.done, m.started_at))) / 86400 AS days
      FROM work_milestones m
      JOIN works w ON w.id = m.work_id
      LEFT JOIN LATERAL (
        SELECT MAX(p.completed_at) AS done FROM work_milestones p
        WHERE p.work_id = m.work_id AND p.status = 'DONE' AND p.sequence < m.sequence
      ) prev ON true
      WHERE ${workSql(range)} AND m.status = 'DONE' AND m.completed_at IS NOT NULL
    ) x
    WHERE days IS NOT NULL AND days >= 0`;
}

export async function teamPerformance(f: ReportFilter): Promise<ReportResult<TeamPerformanceDto>> {
  const settings = await getSettings();
  const range: ReportFilter =
    f.year === undefined && f.yearFrom === undefined && f.yearTo === undefined
      ? { ...f, year: thisYear() }
      : f;
  const where = workWhere(range);
  const [users, completed, active, late, stageRows, splitRows] = await Promise.all([
    prisma.user.findMany({
      where: { ...live, isActive: true },
      select: { id: true, name: true, jobLevel: true, isAdmin: true },
      orderBy: { name: 'asc' },
    }),
    prisma.work.groupBy({
      by: ['picId'],
      where: { ...where, status: 'COMPLETED' },
      _count: { _all: true },
    }),
    // Open work is the current load, whatever its procurement year.
    prisma.work.groupBy({
      by: ['picId'],
      where: { ...workWhere(f, { year: false }), status: 'ACTIVE' },
      _count: { _all: true },
    }),
    prisma.work.groupBy({
      by: ['picId'],
      where: {
        ...workWhere(f, { year: false }),
        status: 'ACTIVE',
        lastUpdatedAt: { lt: staleCutoff(settings) },
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      { type: MilestoneType; executor: Executor; avg_days: number; samples: bigint }[]
    >`
      WITH d AS (${stageDurations(range)})
      SELECT type, executor, AVG(days)::float AS avg_days, COUNT(*) AS samples
      FROM d GROUP BY type, executor`,
    prisma.$queryRaw<{ pic_id: string; outside: boolean; days: number }[]>`
      WITH d AS (${stageDurations(range)})
      SELECT pic_id, (executor <> 'IT') AS outside, SUM(days)::float AS days
      FROM d GROUP BY pic_id, (executor <> 'IT')`,
  ]);

  const count = (rows: { picId: string; _count: { _all: number } }[], id: string) =>
    rows.find((r) => r.picId === id)?._count._all ?? 0;
  const days = (id: string, outside: boolean) =>
    round2(splitRows.find((r) => r.pic_id === id && r.outside === outside)?.days ?? 0);
  const staff = users
    .map(({ isAdmin, ...user }) => ({
      isAdmin,
      user,
      active: count(active, user.id),
      completed: count(completed, user.id),
      late: count(late, user.id),
      itDays: days(user.id, false),
      outsideDays: days(user.id, true),
    }))
    // Idle staff are listed (workload planning); the admin account only when it has data.
    .filter(
      (s) =>
        s.active + s.completed + s.itDays + s.outsideDays > 0 ||
        (s.user.jobLevel === 'STAFF' && !s.isAdmin),
    )
    .map(({ isAdmin: _isAdmin, ...s }) => s);
  const order = Object.keys(MILESTONE_TYPE_LABELS);
  const stages = stageRows
    .map((r) => ({
      type: r.type,
      label: MILESTONE_TYPE_LABELS[r.type],
      executor: r.executor,
      avgDays: round2(r.avg_days),
      samples: Number(r.samples),
    }))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return {
    data: { staff, stages },
    document: {
      title: 'Kinerja Tim',
      filters: await filterText(range),
      tables: [
        {
          title: 'Per staff',
          columns: [
            { key: 'name', label: 'Staff', width: 24 },
            { key: 'active', label: 'Aktif', kind: 'int', width: 10 },
            { key: 'completed', label: 'Selesai', kind: 'int', width: 10 },
            {
              key: 'late',
              label: `Tidak di-update > ${settings.STALE_WORK_DAYS} hari`,
              kind: 'int',
              width: 22,
            },
            { key: 'itDays', label: 'Hari di IT', kind: 'int', width: 12 },
            { key: 'outsideDays', label: 'Hari di luar IT', kind: 'int', width: 16 },
            { key: 'itShare', label: 'Porsi IT', kind: 'percent', width: 10 },
          ],
          rows: staff.map((s) => {
            const totalDays = s.itDays + s.outsideDays;
            return {
              name: s.user.name,
              active: s.active,
              completed: s.completed,
              late: s.late,
              itDays: Math.round(s.itDays),
              outsideDays: Math.round(s.outsideDays),
              itShare: totalDays > 0 ? round2((s.itDays / totalDays) * 100) : null,
            };
          }),
        },
        {
          title: 'Rata-rata durasi per tahapan',
          columns: [
            { key: 'label', label: 'Tahapan', width: 28 },
            { key: 'executor', label: 'Pelaksana', width: 18 },
            { key: 'avgDays', label: 'Rata-rata (hari)', kind: 'decimal', width: 16 },
            { key: 'samples', label: 'Jumlah data', kind: 'int', width: 12 },
          ],
          rows: stages.map((s) => ({
            label: s.label,
            executor: s.executor,
            avgDays: s.avgDays,
            samples: s.samples,
          })),
        },
      ],
    },
  };
}
