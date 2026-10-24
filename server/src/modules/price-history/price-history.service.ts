import type {
  PriceHistoryDto,
  PriceSourceType,
  PriceSummaryDto,
  priceHistoryQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { buildOrderBy, pageArgs, pageMeta } from '../../utils/pagination.js';

type ListQuery = z.output<typeof priceHistoryQuerySchema>;

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

// ─── Recording (called inside quotation / PO transactions) ───────────────────

interface PriceLine {
  itemId: string | null;
  unitPrice: Prisma.Decimal;
}

/**
 * Replaces the price rows of one source document. Free-text lines (no catalog item) are
 * skipped, since there is nothing to compare them with.
 */
export async function recordPrices(
  tx: TxClient,
  source: { type: PriceSourceType; id: string; vendorId: string; date: Date },
  lines: PriceLine[],
): Promise<void> {
  await removePrices(tx, source.type, source.id);
  const data = lines.flatMap((line) =>
    line.itemId
      ? [
          {
            itemId: line.itemId,
            vendorId: source.vendorId,
            unitPrice: line.unitPrice,
            sourceType: source.type,
            sourceId: source.id,
            recordedAt: source.date,
          },
        ]
      : [],
  );
  if (data.length > 0) await tx.priceHistory.createMany({ data });
}

export async function removePrices(
  tx: TxClient,
  type: PriceSourceType,
  sourceId: string,
): Promise<void> {
  await tx.priceHistory.deleteMany({ where: { sourceType: type, sourceId } });
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const select = {
  id: true,
  unitPrice: true,
  sourceType: true,
  sourceId: true,
  recordedAt: true,
  item: { select: { id: true, code: true, name: true, unit: true } },
  vendor: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PriceHistorySelect;

type Row = Prisma.PriceHistoryGetPayload<{ select: typeof select }>;

/** Source document numbers and links, looked up in bulk. */
async function sourceRefs(rows: Row[]) {
  const ids = (type: PriceSourceType) =>
    rows.filter((r) => r.sourceType === type).map((r) => r.sourceId);
  const [quotes, pos] = await Promise.all([
    prisma.quotation.findMany({
      where: { id: { in: ids('QUOTATION') } },
      select: { id: true, quoteNumber: true, prId: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { id: { in: ids('PO') } },
      select: { id: true, number: true },
    }),
  ]);
  const refs = new Map<string, { number: string; link: string }>();
  for (const q of quotes) refs.set(q.id, { number: q.quoteNumber, link: `/penawaran/${q.prId}` });
  for (const po of pos) refs.set(po.id, { number: po.number, link: `/purchase-order/${po.id}` });
  return refs;
}

export async function list(q: ListQuery) {
  const contains = q.search ? { contains: q.search, mode: 'insensitive' as const } : undefined;
  const where: Prisma.PriceHistoryWhereInput = {
    ...(q.itemId && { itemId: q.itemId }),
    ...(q.vendorId && { vendorId: q.vendorId }),
    ...(q.sourceType && { sourceType: q.sourceType }),
    ...((q.dateFrom || q.dateTo) && {
      recordedAt: {
        ...(q.dateFrom && { gte: new Date(q.dateFrom) }),
        ...(q.dateTo && { lte: new Date(q.dateTo) }),
      },
    }),
    ...(contains && {
      OR: [
        { item: { name: contains } },
        { item: { code: contains } },
        { vendor: { name: contains } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.priceHistory.findMany({
      where,
      select,
      orderBy: buildOrderBy<Prisma.PriceHistoryOrderByWithRelationInput>(
        q.sort,
        ['recordedAt', 'unitPrice', 'sourceType', 'item.name', 'vendor.name'],
        { recordedAt: 'desc' },
      ),
      ...pageArgs(q),
    }),
    prisma.priceHistory.count({ where }),
  ]);
  const refs = await sourceRefs(rows);
  const data: PriceHistoryDto[] = rows.map((r) => ({
    id: r.id,
    item: r.item,
    vendor: r.vendor,
    unitPrice: r.unitPrice.toFixed(2),
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    sourceNumber: refs.get(r.sourceId)?.number ?? null,
    sourceLink: refs.get(r.sourceId)?.link ?? null,
    recordedAt: dateOnly(r.recordedAt),
  }));
  return { data, meta: pageMeta(q, total) };
}

const TREND_MONTHS = 24;

/** Statistics per item and per vendor plus the trend points of the last 24 months. */
export async function itemSummary(itemId: string): Promise<PriceSummaryDto> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, code: true, name: true, unit: true },
  });
  if (!item) throw AppError.notFound('Item tidak ditemukan');

  const since = dayjs().tz().subtract(TREND_MONTHS, 'month').format('YYYY-MM-DD');
  const rows = await prisma.priceHistory.findMany({
    where: { itemId, recordedAt: { gte: new Date(since) } },
    orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    select,
  });

  const money = (d: Prisma.Decimal) => d.toFixed(2);
  const avg = (list: Row[]) =>
    list
      .reduce((sum, r) => sum.add(r.unitPrice), new Prisma.Decimal(0))
      .div(list.length)
      .toDecimalPlaces(2);
  const minOf = (list: Row[]) => Prisma.Decimal.min(...list.map((r) => r.unitPrice));
  const maxOf = (list: Row[]) => Prisma.Decimal.max(...list.map((r) => r.unitPrice));

  const byVendor = new Map<string, Row[]>();
  for (const row of rows)
    byVendor.set(row.vendor.id, [...(byVendor.get(row.vendor.id) ?? []), row]);
  const latest = rows.at(-1);

  return {
    item,
    stats: {
      count: rows.length,
      min: rows.length ? money(minOf(rows)) : null,
      max: rows.length ? money(maxOf(rows)) : null,
      avg: rows.length ? money(avg(rows)) : null,
      latest: latest ? money(latest.unitPrice) : null,
      latestAt: latest ? dateOnly(latest.recordedAt) : null,
    },
    byVendor: [...byVendor.values()]
      .map((list) => {
        const last = list.at(-1)!;
        return {
          vendor: last.vendor,
          count: list.length,
          min: money(minOf(list)),
          avg: money(avg(list)),
          latest: money(last.unitPrice),
          latestAt: dateOnly(last.recordedAt),
        };
      })
      .sort((a, b) => Number(a.avg) - Number(b.avg)),
    points: rows.map((r) => ({
      date: dateOnly(r.recordedAt),
      vendorId: r.vendor.id,
      unitPrice: money(r.unitPrice),
      sourceType: r.sourceType,
    })),
  };
}
