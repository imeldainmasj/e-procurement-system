import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

/** Downloads an export and returns the data rows below the header (row 5) of its first sheet. */
async function exportRows(path: string, headers: Record<string, string>) {
  const res = await request(app)
    .get(`/api/v1${path}`)
    .set(headers)
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  expect(res.status).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  const header = (ws.getRow(5).values as unknown[]).slice(1);
  const rows: Record<string, unknown>[] = [];
  for (let r = 6; r <= ws.rowCount; r++) {
    const values = (ws.getRow(r).values as unknown[]).slice(1);
    rows.push(Object.fromEntries(header.map((h, i) => [String(h), values[i] ?? null])));
  }
  return { res, rows };
}

async function setup() {
  const andi = await createTestUser({ name: 'Andi' });
  const dewi = await createTestUser({ name: 'Dewi' });
  const vendor = await prisma.vendor.create({ data: { code: 'V1', name: 'PT Lisensi' } });
  const work = (n: number, picId: string, method: 'TENDER' | 'BIDDING') =>
    prisma.work.create({
      data: {
        code: `WRK-2026-${String(n).padStart(4, '0')}`,
        title: `Pekerjaan ${n}`,
        procurementType: 'RENEWAL_LICENSE',
        category: 'BAU',
        method,
        procurementYear: 2026,
        picId,
        vendorId: vendor.id,
        amount: n * 1_000_000,
        amountIdr: n * 1_000_000,
      },
    });
  // More rows than one page of the list (limit 20), to prove the export takes all pages.
  for (let n = 1; n <= 23; n++) await work(n, andi.id, 'BIDDING');
  await work(24, dewi.id, 'TENDER');
  return { andi, headers: authHeader(andi) };
}

describe('list exports', () => {
  it('exports every work matching the filters, in the list order', async () => {
    const { headers } = await setup();
    const { res, rows } = await exportRows(
      '/works/export?method=BIDDING&sort=code:asc&limit=5&page=3',
      headers,
    );
    expect(res.headers['content-disposition']).toMatch(/sipita-pekerjaan-\d{8}\.xlsx/);
    expect(rows).toHaveLength(23);
    expect(rows[0]).toMatchObject({
      Kode: 'WRK-2026-0001',
      Metode: 'Bidding',
      PIC: 'Andi',
      Vendor: 'PT Lisensi',
      'Nilai (IDR)': 1_000_000,
      Status: 'Aktif',
    });
  });

  it('limits "Pekerjaan Saya" to the current user', async () => {
    const { headers } = await setup();
    const { rows } = await exportRows('/works/mine/export?method=TENDER', headers);
    expect(rows).toHaveLength(0);
  });

  it('exports vendors and agreements, and needs view permission', async () => {
    const { headers } = await setup();
    const vendors = await exportRows('/vendors/export', headers);
    expect(vendors.rows).toEqual([
      expect.objectContaining({ Kode: 'V1', Nama: 'PT Lisensi', Pekerjaan: 24 }),
    ]);
    expect((await exportRows('/agreements/export', headers)).rows).toHaveLength(0);

    const blind = await createTestUser({ permissions: { VENDOR: { view: false } } });
    const denied = await request(app).get('/api/v1/vendors/export').set(authHeader(blind));
    expect(denied.status).toBe(403);
  });
});
