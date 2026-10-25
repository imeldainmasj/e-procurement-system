import path from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { SETTING_DEFAULTS } from '@sipita/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createAdmin,
  createTestUser,
  resetDatabase,
  seedMilestoneTemplates,
} from '../../test/db.js';
import { SHEETS, sheetSpec, type SheetName } from './import.spec.js';
import { settled } from './import.service.js';
import { buildTemplate } from './import.template.js';

const app = createApp();
const M = 1_000_000;
type Headers = Record<string, string>;
type Rows = Partial<Record<SheetName, Record<string, ExcelJS.CellValue>[]>>;

beforeEach(async () => {
  await resetDatabase();
  await seedMilestoneTemplates();
  await prisma.directorate.create({ data: { code: 'DIR-OPS', name: 'Operasional' } });
});
afterAll(() => prisma.$disconnect());

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** The official template filled with rows (values by column key, labels as in Excel). */
async function workbook(data: Rows): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildTemplate(SETTING_DEFAULTS)) as unknown as ArrayBuffer);
  for (const [sheet, rows] of Object.entries(data) as [SheetName, Rows[SheetName]][]) {
    const ws = wb.getWorksheet(sheet)!;
    sheetSpec(sheet).columns.forEach((c, col) => {
      rows!.forEach((values, i) => {
        if (values[c.key] !== undefined) ws.getRow(i + 2).getCell(col + 1).value = values[c.key]!;
      });
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(headers: Headers, buffer: Buffer) {
  const res = await request(app)
    .post('/api/v1/imports')
    .set(headers)
    .attach('file', buffer, 'pengadaan.xlsx');
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  await settled(res.body.data.id);
  return (await request(app).get(`/api/v1/imports/${res.body.data.id}`).set(headers)).body.data;
}

async function commit(headers: Headers, id: string) {
  const res = await request(app).post(`/api/v1/imports/${id}/commit`).set(headers);
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  await settled(id);
  return (await request(app).get(`/api/v1/imports/${id}`).set(headers)).body.data;
}

async function issues(headers: Headers, id: string) {
  const res = await request(app).get(`/api/v1/imports/${id}/issues?limit=500`).set(headers);
  return res.body.data as { sheet: string; rowNumber: number; level: string; message: string }[];
}

/** R1: complete Tender with PVP; R2: legacy 2015 Bidding without MoA Biaya. */
function sampleRows(): Rows {
  return {
    Vendor: [
      {
        code: 'V001',
        name: 'PT Solusi Lisensi Nusantara',
        address: 'Jakarta',
        picName: 'Rina',
        npwp: '0012345678901001',
      },
    ],
    Pekerjaan: [
      {
        ref: 'R1',
        title: 'Renewal Microsoft 365 E3 2024',
        procurementType: 'Renewal License',
        category: 'BAU',
        method: 'Tender',
        procurementYear: 2024,
        pic: 'andi.pratama',
        directorate: 'DIR-OPS',
        vendor: 'V001',
        currency: 'IDR',
        amount: 4_850 * M,
        exchangeRate: 1,
        previousPurchaseAmount: 4_300 * M,
        periodStart: d('2024-07-01'),
        periodEnd: d('2025-06-30'),
        status: 'Selesai',
      },
      {
        ref: 'R2',
        title: 'Antivirus 2015',
        procurementType: 'Renewal License',
        category: 'BAU',
        method: 'Bidding',
        procurementYear: 2015,
        pic: 'andi.pratama',
        vendor: 'V001',
        currency: 'IDR',
        amount: 300 * M,
        exchangeRate: 1,
        status: 'Selesai',
        periodStart: '01/07/2015',
        periodEnd: '30/06/2016',
      },
    ],
    Memo: [
      {
        workRef: 'R1',
        memoNo: '021/MEMO/2024',
        memoType: 'Memo Pengadaan',
        title: 'Pengadaan M365',
        memoDate: d('2024-02-12'),
        requesterName: 'Andi',
      },
      {
        workRef: 'R1',
        memoNo: 'MOA-HT/2024',
        memoType: 'MoA Hasil Tender',
        title: 'MoA',
        memoDate: d('2024-05-02'),
        requesterName: 'Andi',
      },
      {
        workRef: 'R1',
        memoNo: 'MOA-B/2024',
        memoType: 'MoA Biaya',
        title: 'MoA Biaya',
        memoDate: d('2024-06-01'),
        requesterName: 'Andi',
      },
      {
        workRef: 'R2',
        memoNo: '005/MEMO/2015',
        memoType: 'Memo Pengadaan',
        title: 'Antivirus',
        memoDate: d('2015-02-10'),
        requesterName: 'Andi',
      },
      {
        workRef: 'R2',
        memoNo: 'MOA-HT/2015',
        memoType: 'MoA Hasil Tender',
        title: 'MoA',
        memoDate: d('2015-04-10'),
        requesterName: 'Andi',
      },
    ],
    RFQ: [
      {
        workRef: 'R1',
        rfqNo: 'RFQ/IT/2024/003',
        method: 'Tender',
        loaNo: 'LOA/PROC/2024/017',
        loaDate: d('2024-05-27'),
        loaProcessedBy: 'Procurement',
      },
      {
        workRef: 'R2',
        rfqNo: 'RFQ/IT/2015/001',
        method: 'Bidding',
        loaNo: 'LOA/2015/1',
        loaDate: d('2015-05-01'),
      },
    ],
    PVP: [{ workRef: 'R1', pvpDate: d('2024-04-18'), status: 'Disetujui' }],
    PVP_Approval: [
      {
        workRef: 'R1',
        directorName: 'Direktur Operasional',
        decision: 'Disetujui',
        approvalDate: d('2024-04-19'),
      },
      {
        workRef: 'R1',
        directorName: 'Direktur Keuangan',
        decision: 'Disetujui',
        approvalDate: d('2024-04-20'),
      },
    ],
    PO: [
      {
        workRef: 'R1',
        poNo: '4500123401',
        poType: 'Renewal',
        poName: 'M365 E3',
        poDate: d('2024-06-10'),
        currency: 'IDR',
        amount: 4_850 * M,
        exchangeRate: 1,
        previousPoNo: '4500118820',
      },
      {
        workRef: 'R2',
        poNo: '4500000015',
        poType: 'New',
        poName: 'Antivirus',
        poDate: d('2015-06-01'),
        currency: 'IDR',
        amount: 300 * M,
        exchangeRate: 1,
      },
    ],
    PO_TOP: [
      {
        poNo: '4500123401',
        sequence: 1,
        description: 'Pembayaran penuh',
        percentage: 1,
        isPaid: 'Ya',
      },
    ],
    Agreement: [
      {
        workRef: 'R1',
        agreementNo: 'AGR/IT/2024/008',
        agreementType: 'Renewal',
        title: 'Perjanjian M365',
        vendor: 'V001',
        poNo: '4500123401',
        pic: 'andi.pratama',
        periodStart: d('2024-07-01'),
        periodEnd: d('2025-06-30'),
        currency: 'IDR',
        amount: 4_850 * M,
        exchangeRate: 1,
      },
      {
        workRef: 'R2',
        agreementNo: 'AGR/IT/2015/002',
        agreementType: 'New',
        title: 'Perjanjian Antivirus',
        vendor: 'V001',
        poNo: '4500000015',
        pic: 'andi.pratama',
        periodStart: d('2015-07-01'),
        periodEnd: d('2016-06-30'),
        currency: 'IDR',
        amount: 300 * M,
        exchangeRate: 1,
      },
    ],
  };
}

describe('template', () => {
  it('has the same sheets, headers and dropdown lists as docs/import/template-import.xlsx', async () => {
    const reference = new ExcelJS.Workbook();
    await reference.xlsx.readFile(
      path.resolve(process.cwd(), '../docs/import/template-import.xlsx'),
    );
    const generated = new ExcelJS.Workbook();
    await generated.xlsx.load((await buildTemplate(SETTING_DEFAULTS)) as unknown as ArrayBuffer);

    const names = (wb: ExcelJS.Workbook) => wb.worksheets.map((w) => `${w.name}:${w.state}`).sort();
    expect(names(generated)).toEqual(names(reference));

    const headers = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);
    for (const sheet of SHEETS) {
      expect(headers(generated.getWorksheet(sheet.name)!), sheet.name).toEqual(
        headers(reference.getWorksheet(sheet.name)!),
      );
      expect(
        generated.getWorksheet(sheet.name)!.getRow(2).getCell(1).value,
        `${sheet.name} has no sample data`,
      ).toBeNull();
    }
    const lists = (wb: ExcelJS.Workbook) => {
      const ws = wb.getWorksheet('Daftar')!;
      return ws
        .getSheetValues()
        .slice(1)
        .map((row) => (row as unknown[] | undefined)?.slice(1));
    };
    expect(lists(generated)).toEqual(lists(reference));
  });

  it('is downloadable with the IMPORT permission', async () => {
    const staff = await createTestUser();
    const res = await request(app).get('/api/v1/imports/template').set(authHeader(staff));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });
});

describe('import flow', () => {
  it('previews, then commits rows with warnings and computes derived values', async () => {
    await createTestUser({ username: 'andi.pratama' });
    const { headers } = await createAdmin();
    const batch = await upload(headers, await workbook(sampleRows()));

    expect(batch).toMatchObject({ status: 'PREVIEW', phase: null, errorRows: 0 });
    const preview = await issues(headers, batch.id);
    expect(preview).toEqual([
      expect.objectContaining({
        sheet: 'Pekerjaan',
        rowNumber: 3,
        level: 'WARNING',
        message: 'PO tanpa MoA Biaya',
      }),
    ]);
    expect(await prisma.work.count()).toBe(0); // nothing written yet

    const done = await commit(headers, batch.id);
    expect(done).toMatchObject({ status: 'COMMITTED', phase: null });
    expect(done.summary.Work).toEqual({ created: 2, updated: 0 });

    const r1 = await prisma.work.findFirstOrThrow({
      where: { title: 'Renewal Microsoft 365 E3 2024' },
      include: { milestones: true },
    });
    expect(r1).toMatchObject({
      code: 'WRK-2024-0001',
      pvpRequired: true,
      hasDataIssues: false,
      importBatchId: batch.id,
    });
    expect(Number(r1.increasePercent)).toBe(12.79);
    expect(r1.milestones.every((m) => m.status === 'DONE')).toBe(true);
    expect(r1.milestones.find((m) => m.type === 'LOA')!.completedAt).toEqual(d('2024-05-27'));

    const r2 = await prisma.work.findFirstOrThrow({ where: { procurementYear: 2015 } });
    expect(r2.dataIssues).toEqual([expect.objectContaining({ code: 'PO_WITHOUT_MOA' })]);

    const term = await prisma.poPaymentTerm.findFirstOrThrow();
    expect({
      pct: Number(term.percentage),
      amount: Number(term.amount),
      paid: term.isPaid,
    }).toEqual({ pct: 100, amount: 4_850 * M, paid: true });
    const agreement = await prisma.agreement.findFirstOrThrow();
    expect(agreement.status).toBe('EXPIRED');
    expect(
      await prisma.auditLog.count({ where: { importBatchId: batch.id, source: 'IMPORT' } }),
    ).toBeGreaterThan(10);
  });

  it('rejects broken rows and saves only the valid ones', async () => {
    await createTestUser({ username: 'andi.pratama' });
    const { headers } = await createAdmin();
    const rows = sampleRows();
    rows.Pekerjaan![1]!.method = 'Lelang'; // not in the list → R2 rejected
    rows.Memo!.push({
      workRef: 'R9',
      memoNo: 'X-1',
      memoType: 'Memo Pengadaan',
      title: 'x',
      memoDate: d('2024-01-01'),
      requesterName: 'A',
    });
    rows.Memo!.push({
      workRef: 'R1',
      memoNo: '021/MEMO/2024',
      memoType: 'Memo Pengadaan',
      title: 'dup',
      memoDate: d('2024-01-01'),
      requesterName: 'A',
    });
    rows.Memo!.push({
      workRef: 'R1',
      memoNo: 'M-PL',
      memoType: 'Memo PL',
      title: 'x',
      memoDate: d('2024-01-01'),
      requesterName: 'A',
    });
    rows.Memo!.push({
      workRef: 'R1',
      memoNo: 'NO-DATE',
      memoType: 'Memo Pengadaan',
      title: 'x',
      memoDate: 'kemarin',
      requesterName: 'A',
    });

    const batch = await upload(headers, await workbook(rows));
    const found = await issues(headers, batch.id);
    const errors = found
      .filter((i) => i.level === 'ERROR')
      .map((i) => `${i.sheet}:${i.rowNumber} ${i.message}`);
    expect(errors).toEqual(
      expect.arrayContaining([
        "Pekerjaan:3 Metode Pengadaan 'Lelang' tidak ada di daftar",
        'Memo:5 Pekerjaan R2 ditolak (lihat error di sheet Pekerjaan)',
        'Memo:7 Pekerjaan R9 tidak ditemukan di file maupun di sistem',
        'Memo:8 No. memo 021/MEMO/2024 ganda di file ini (baris 2)',
        'Memo:9 Jenis memo tidak sesuai metode Tender',
        'Memo:10 Tanggal Memo format tanggal salah (gunakan dd/mm/yyyy)',
      ]),
    );
    expect(batch.errorRows).toBeGreaterThanOrEqual(9);

    await commit(headers, batch.id);
    expect(await prisma.work.count()).toBe(1);
    expect(await prisma.memo.count()).toBe(3);
  });

  it('updates existing records by number on a second import instead of duplicating', async () => {
    await createTestUser({ username: 'andi.pratama' });
    const { headers } = await createAdmin();
    await commit(headers, (await upload(headers, await workbook(sampleRows()))).id);
    const code = (await prisma.work.findFirstOrThrow({ where: { procurementYear: 2015 } })).code;

    // Second file: the 2015 work by its code, a corrected memo title and the missing cost MoA.
    const second = await upload(
      headers,
      await workbook({
        Memo: [
          {
            workRef: code,
            memoNo: '005/MEMO/2015',
            memoType: 'Memo Pengadaan',
            title: 'Antivirus (koreksi)',
            memoDate: d('2015-02-10'),
            requesterName: 'Andi',
          },
          {
            workRef: code,
            memoNo: 'MOA-B/2015',
            memoType: 'MoA Biaya',
            title: 'MoA Biaya',
            memoDate: d('2015-05-15'),
            requesterName: 'Andi',
          },
        ],
      }),
    );
    expect(second.errorRows).toBe(0);
    await commit(headers, second.id);

    expect(await prisma.memo.count({ where: { memoNo: '005/MEMO/2015' } })).toBe(1);
    expect((await prisma.memo.findFirstOrThrow({ where: { memoNo: '005/MEMO/2015' } })).title).toBe(
      'Antivirus (koreksi)',
    );
    const work = await prisma.work.findFirstOrThrow({ where: { code } });
    expect(work.hasDataIssues).toBe(false); // cost MoA now recorded
    const update = await prisma.auditLog.findFirstOrThrow({
      where: { importBatchId: second.id, entity: 'Memo', action: 'UPDATE' },
    });
    expect(update.source).toBe('IMPORT');
  });
});

describe('rollback', () => {
  it('soft-deletes created rows and restores updated ones', async () => {
    await createTestUser({ username: 'andi.pratama' });
    const { headers } = await createAdmin();
    const first = await commit(headers, (await upload(headers, await workbook(sampleRows()))).id);
    const code = (await prisma.work.findFirstOrThrow({ where: { procurementYear: 2015 } })).code;
    const second = await upload(
      headers,
      await workbook({
        Memo: [
          {
            workRef: code,
            memoNo: '005/MEMO/2015',
            memoType: 'Memo Pengadaan',
            title: 'Diubah',
            memoDate: d('2015-02-10'),
            requesterName: 'Andi',
          },
        ],
      }),
    );
    await commit(headers, second.id);

    const res = await request(app).post(`/api/v1/imports/${second.id}/rollback`).set(headers);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    await settled(second.id);
    expect((await prisma.memo.findFirstOrThrow({ where: { memoNo: '005/MEMO/2015' } })).title).toBe(
      'Antivirus',
    );

    const firstRollback = await request(app)
      .post(`/api/v1/imports/${first.id}/rollback`)
      .set(headers);
    expect(firstRollback.status, JSON.stringify(firstRollback.body)).toBe(202);
    await settled(first.id);
    expect(await prisma.work.count({ where: { deletedAt: null } })).toBe(0);
    expect(await prisma.memo.count({ where: { deletedAt: null } })).toBe(0);
    const batch = (await request(app).get(`/api/v1/imports/${first.id}`).set(headers)).body.data;
    expect(batch.status).toBe('ROLLED_BACK');

    // The same file can be imported again afterwards (soft-deleted rows are revived).
    const again = await upload(headers, await workbook(sampleRows()));
    expect(again.errorRows).toBe(0);
    await commit(headers, again.id);
    expect(await prisma.memo.count({ where: { deletedAt: null } })).toBe(5);
  });

  it('is refused once imported data was changed in the app, and admin-only', async () => {
    const andi = await createTestUser({ username: 'andi.pratama' });
    const { headers } = await createAdmin();
    const batch = await commit(headers, (await upload(headers, await workbook(sampleRows()))).id);

    const notAdmin = await request(app)
      .post(`/api/v1/imports/${batch.id}/rollback`)
      .set(authHeader(andi));
    expect(notAdmin.status).toBe(403);

    const work = await prisma.work.findFirstOrThrow({ where: { procurementYear: 2015 } });
    const edit = await request(app)
      .patch(`/api/v1/works/${work.id}`)
      .set(authHeader(andi))
      .send({
        title: 'Antivirus 2015 (dikoreksi)',
        procurementType: 'RENEWAL_LICENSE',
        category: 'BAU',
        method: 'BIDDING',
        procurementYear: 2015,
        picId: andi.id,
        amount: 300 * M,
        status: 'COMPLETED',
      });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);

    const res = await request(app).post(`/api/v1/imports/${batch.id}/rollback`).set(headers);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IMPORT_ROLLBACK_CONFLICT');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ entity: 'Pekerjaan', entityId: work.id }),
    ]);
  });
});

describe('access', () => {
  it('needs the IMPORT permission and rejects non-xlsx files', async () => {
    const noImport = await createTestUser({
      permissions: { IMPORT: { view: false, create: false } },
    });
    const res = await request(app)
      .post('/api/v1/imports')
      .set(authHeader(noImport))
      .attach('file', await workbook({}), 'x.xlsx');
    expect(res.status).toBe(403);

    const staff = await createTestUser();
    const fake = await request(app)
      .post('/api/v1/imports')
      .set(authHeader(staff))
      .attach('file', Buffer.from('bukan excel'), 'x.xlsx');
    expect(fake.status).toBe(400);
  });
});
