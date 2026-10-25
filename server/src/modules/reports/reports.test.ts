import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { closePdfBrowser } from '../../lib/pdf.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();
const M = 1_000_000;

beforeEach(resetDatabase);
afterAll(async () => {
  await closePdfBrowser();
  await prisma.$disconnect();
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

/** Two vendors over 2023–2025, one cancelled work, a legacy work with issues, two agreements. */
async function setup() {
  const andi = await createTestUser({ name: 'Andi' });
  const headers = authHeader(andi);
  const [v1, v2] = await Promise.all([
    prisma.vendor.create({ data: { code: 'V1', name: 'PT Lisensi' } }),
    prisma.vendor.create({ data: { code: 'V2', name: 'PT Aplikasi' } }),
  ]);
  let seq = 0;
  const work = (
    data: Partial<Prisma.WorkUncheckedCreateInput> & { amount: number; procurementYear: number },
  ) =>
    prisma.work.create({
      data: {
        code: `WRK-${data.procurementYear}-${String(++seq).padStart(4, '0')}`,
        title: `Pekerjaan ${seq}`,
        procurementType: 'RENEWAL_LICENSE',
        category: 'BAU',
        method: 'BIDDING',
        picId: andi.id,
        amountIdr: data.amount,
        status: 'COMPLETED',
        ...data,
      },
    });
  await work({ procurementYear: 2023, amount: 100 * M, vendorId: v1.id });
  await work({
    procurementYear: 2024,
    amount: 110 * M,
    vendorId: v1.id,
    previousPurchaseAmount: 100 * M,
    increasePercent: 10,
  });
  await work({
    procurementYear: 2024,
    amount: 50 * M,
    vendorId: v2.id,
    method: 'TENDER',
    category: 'PROJECT',
  });
  await work({ procurementYear: 2024, amount: 999 * M, vendorId: v2.id, status: 'CANCELLED' });
  const legacy = await work({
    procurementYear: 2015,
    amount: 20 * M,
    hasDataIssues: true,
    dataIssues: [{ code: 'PO_WITHOUT_MOA', message: 'PO tanpa MoA Biaya' }],
  });
  const active = await work({
    procurementYear: 2025,
    amount: 120 * M,
    vendorId: v1.id,
    status: 'ACTIVE',
  });
  await prisma.workMilestone.createMany({
    data: [
      {
        workId: active.id,
        type: 'MEMO',
        sequence: 1,
        executor: 'IT',
        status: 'DONE',
        prerequisites: [],
        startedAt: day(-30),
        completedAt: day(-20),
      },
      {
        workId: active.id,
        type: 'LOA',
        sequence: 5,
        executor: 'OTHER_TEAM',
        status: 'DONE',
        prerequisites: [],
        startedAt: day(-20),
        completedAt: day(-5),
      },
    ],
  });
  for (const [no, end] of [
    ['AGR-SOON', 20],
    ['AGR-LATER', 400],
  ] as const) {
    const po = await prisma.purchaseOrder.create({
      data: {
        workId: active.id,
        poNo: `PO-${no}`,
        poType: 'NEW',
        poName: no,
        poDate: day(-300),
        amount: 1,
        amountIdr: 1,
      },
    });
    await prisma.agreement.create({
      data: {
        agreementNo: no,
        agreementType: 'NEW',
        title: no,
        vendorId: v1.id,
        poId: po.id,
        workId: active.id,
        picId: andi.id,
        periodStart: day(-300),
        periodEnd: day(end),
        amount: 1,
        amountIdr: 1,
      },
    });
  }
  return { headers, v1, v2, legacy };
}

const get = (headers: Record<string, string>, path: string) =>
  request(app).get(`/api/v1/reports/${path}`).set(headers);

describe('reports', () => {
  it('annual summary per year, split by method, without cancelled works', async () => {
    const { headers } = await setup();
    const res = await get(headers, 'annual-summary?yearFrom=2023&yearTo=2024&groupBy=method');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.years).toEqual([
      { year: 2023, amountIdr: 100 * M, count: 1 },
      { year: 2024, amountIdr: 160 * M, count: 2 },
    ]);
    expect(res.body.data.total).toEqual({ amountIdr: 260 * M, count: 3 });
    expect(res.body.data.groups.map((g: { label: string }) => g.label)).toEqual([
      'Bidding',
      'Tender',
    ]);
  });

  it('year-to-year trend per work and per vendor', async () => {
    const { headers } = await setup();
    const works = (await get(headers, 'yoy-trend?year=2024')).body.data;
    expect(works.rows).toEqual([
      expect.objectContaining({ current: 110 * M, previous: 100 * M, increasePercent: 10 }),
    ]);
    const vendors = (await get(headers, 'yoy-trend?year=2024&groupBy=vendor')).body.data;
    expect(
      vendors.rows.map((r: { label: string; increasePercent: number | null }) => [
        r.label,
        r.increasePercent,
      ]),
    ).toEqual([
      ['PT Lisensi', 10],
      ['PT Aplikasi', null],
    ]);
  });

  it('expiring agreements within the window', async () => {
    const { headers } = await setup();
    const res = await get(headers, 'expiring-agreements?days=60');
    expect(res.body.data.agreements.map((a: { agreementNo: string }) => a.agreementNo)).toEqual([
      'AGR-SOON',
    ]);
  });

  it('vendor history totals', async () => {
    const { headers } = await setup();
    const rows = (await get(headers, 'vendor-history')).body.data;
    expect(rows[0]).toMatchObject({
      vendor: { code: 'V1' },
      workCount: 3,
      totalIdr: 330 * M,
      agreementCount: 2,
      firstYear: 2023,
      lastYear: 2025,
    });
    expect(rows[1]).toMatchObject({ vendor: { code: 'V2' }, workCount: 1, totalIdr: 50 * M });
  });

  it('compliance counts issues per code and filters works by code', async () => {
    const { headers, legacy } = await setup();
    const res = await get(headers, 'compliance?code=PO_WITHOUT_MOA');
    expect(res.body.data.byCode).toEqual([
      { code: 'PO_WITHOUT_MOA', label: 'PO tanpa MoA metode / MoA Biaya', count: 1 },
    ]);
    expect(res.body.data.works.map((w: { id: string }) => w.id)).toEqual([legacy.id]);
    const none = await get(headers, 'compliance?code=PVP_MISSING');
    expect(none.body.data.works).toEqual([]);
  });

  it('team performance: stage durations and IT vs outside-IT days', async () => {
    const { headers } = await setup();
    const d = (await get(headers, 'team-performance?yearFrom=2015&yearTo=2025')).body.data;
    const andi = d.staff.find((s: { user: { name: string } }) => s.user.name === 'Andi');
    expect(andi).toMatchObject({ active: 1, completed: 4, itDays: 10, outsideDays: 15 });
    expect(d.stages).toEqual([
      expect.objectContaining({ type: 'MEMO', avgDays: 10, samples: 1 }),
      expect.objectContaining({ type: 'LOA', executor: 'OTHER_TEAM', avgDays: 15 }),
    ]);
  });

  it('exports the same figures to Excel and PDF', async () => {
    const { headers } = await setup();
    const xlsx = await get(headers, 'annual-summary?yearFrom=2023&yearTo=2024&format=xlsx')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-disposition']).toMatch(/sipita-rekap-tahunan-\d{8}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(5).values).toEqual([undefined, 'Tahun', 'Jumlah pekerjaan', 'Nilai (IDR)']);
    expect(ws.getRow(8).values).toEqual([undefined, 'Total', 3, 260 * M]);

    const pdf = await get(headers, 'vendor-history?format=pdf')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);

  it('requires the REPORT permission', async () => {
    const blocked = await createTestUser({ permissions: { REPORT: { view: false } } });
    expect((await get(authHeader(blocked), 'vendor-history')).status).toBe(403);
  });
});
