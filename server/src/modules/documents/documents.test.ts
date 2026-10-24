import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestUser,
  resetDatabase,
  seedMilestoneTemplates,
} from '../../test/db.js';

const app = createApp();
const M = 1_000_000;
type Headers = Record<string, string>;

beforeEach(async () => {
  await resetDatabase();
  await seedMilestoneTemplates();
});
afterAll(() => prisma.$disconnect());

interface Milestone {
  type: string;
  status: string;
  completedAt: string | null;
}

async function setup() {
  const staff = await createTestUser({ name: 'Andi' });
  const vendor = await prisma.vendor.create({ data: { code: 'V001', name: 'PT Solusi Lisensi' } });
  return { staff, vendor, headers: authHeader(staff) };
}

async function newWork(headers: Headers, picId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/works')
    .set(headers)
    .send({
      title: 'Renewal Microsoft 365 E3',
      procurementType: 'RENEWAL_LICENSE',
      category: 'BAU',
      method: 'TENDER',
      procurementYear: 2026,
      picId,
      amount: 2_000 * M,
      previousPurchaseAmount: 1_900 * M, // +5.26% → PVP required
      ...over,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string };
}

const api = (headers: Headers) => ({
  post: (path: string, body: object) => request(app).post(`/api/v1${path}`).set(headers).send(body),
  put: (path: string, body: object) => request(app).put(`/api/v1${path}`).set(headers).send(body),
  patch: (path: string, body: object) =>
    request(app).patch(`/api/v1${path}`).set(headers).send(body),
  del: (path: string) => request(app).delete(`/api/v1${path}`).set(headers),
  get: (path: string) => request(app).get(`/api/v1${path}`).set(headers),
});

async function milestones(headers: Headers, workId: string): Promise<Record<string, Milestone>> {
  const res = await api(headers).get(`/works/${workId}`);
  return Object.fromEntries(res.body.data.milestones.map((m: Milestone) => [m.type, m]));
}

const memo = (memoNo: string, memoType: string, memoDate: string) => ({
  memoNo,
  memoType,
  title: memoNo,
  memoDate,
  requesterName: 'Andi Pratama',
});

const rfq = (over: Record<string, unknown> = {}) => ({
  rfqNo: 'RFQ/IT/2026/003',
  method: 'TENDER',
  periodStart: '2026-07-01',
  periodEnd: '2027-06-30',
  amount: 2_000 * M,
  ...over,
});

/** Records the Tender documents up to (not including) the given step. */
async function tenderUntil(
  headers: Headers,
  workId: string,
  until: 'MOA_COST' | 'PO' | 'AGREEMENT',
) {
  const a = api(headers);
  expect(
    (await a.post(`/works/${workId}/memos`, memo('MEMO-1', 'MEMO_PROCUREMENT', '2026-02-12')))
      .status,
  ).toBe(201);
  expect((await a.put(`/works/${workId}/rfq`, rfq())).status).toBe(200);
  await a.put(`/works/${workId}/pvp`, { pvpDate: '2026-04-18', status: 'PENDING' });
  for (const directorName of ['Direktur Operasional', 'Direktur Keuangan']) {
    await a.post(`/works/${workId}/pvp/approvals`, {
      directorName,
      decision: 'APPROVED',
      approvalDate: '2026-04-19',
    });
  }
  expect(
    (await a.put(`/works/${workId}/pvp`, { pvpDate: '2026-04-18', status: 'APPROVED' })).status,
  ).toBe(200);
  expect(
    (await a.post(`/works/${workId}/memos`, memo('MOA-1', 'MOA_TENDER_RESULT', '2026-05-02')))
      .status,
  ).toBe(201);
  expect(
    (
      await a.put(
        `/works/${workId}/rfq`,
        rfq({ loaNo: 'LOA/PROC/2026/017', loaDate: '2026-05-27' }),
      )
    ).status,
  ).toBe(200);
  if (until === 'MOA_COST') return;
  expect(
    (await a.post(`/works/${workId}/memos`, memo('MOA-COST-1', 'MOA_COST', '2026-06-02'))).status,
  ).toBe(201);
  if (until === 'PO') return;
  const po = await a.post(`/works/${workId}/purchase-orders`, {
    poNo: '4500123401',
    poType: 'RENEWAL',
    poName: 'Microsoft 365 E3 2026-2027',
    poDate: '2026-06-10',
    amount: 2_000 * M,
  });
  expect(po.status).toBe(201);
  return po.body.data as { id: string };
}

describe('Tender documents ↔ milestones', () => {
  it('completes each milestone from its document and its date', async () => {
    const { staff, vendor, headers } = await setup();
    const work = await newWork(headers, staff.id);
    const po = await tenderUntil(headers, work.id, 'AGREEMENT');

    const term = await api(headers).post(
      `/works/${work.id}/purchase-orders/${po!.id}/payment-terms`,
      {
        sequence: 1,
        description: 'Pembayaran penuh setelah lisensi aktif',
        percentage: 100,
        dueDate: '2026-07-31',
      },
    );
    expect(term.body.data).toMatchObject({ amount: 2_000 * M, percentage: 100 });

    const agreement = await api(headers).post('/agreements', {
      workId: work.id,
      agreementNo: 'AGR/IT/2026/008',
      agreementType: 'RENEWAL',
      title: 'Perjanjian Lisensi Microsoft 365 E3',
      vendorId: vendor.id,
      poId: po!.id,
      picId: staff.id,
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
      amount: 2_000 * M,
    });
    expect(agreement.status, JSON.stringify(agreement.body)).toBe(201);

    const ms = await milestones(headers, work.id);
    expect(Object.values(ms).every((m) => m.status === 'DONE')).toBe(true);
    expect(ms.MEMO!.completedAt).toBe('2026-02-12');
    expect(ms.PVP!.completedAt).toBe('2026-04-19');
    expect(ms.LOA!.completedAt).toBe('2026-05-27');
    expect(ms.PO!.completedAt).toBe('2026-06-10');

    const detail = await api(headers).get(`/works/${work.id}`);
    expect(detail.body.data.issues).toEqual([]);

    const log = await api(headers).get(`/works/${work.id}/updates?limit=50`);
    expect(log.body.data.some((u: { note: string }) => u.note === 'LoA: RFQ/LoA dicatat')).toBe(
      true,
    );

    const docs = await api(headers).get(`/works/${work.id}/documents`);
    expect(docs.body.data).toMatchObject({
      memos: [{ memoNo: 'MEMO-1' }, { memoNo: 'MOA-1' }, { memoNo: 'MOA-COST-1' }],
      rfq: { loaNo: 'LOA/PROC/2026/017' },
      pvp: { status: 'APPROVED', approvedCount: 2, minApprovals: 2 },
      purchaseOrders: [{ poNo: '4500123401', agreement: { agreementNo: 'AGR/IT/2026/008' } }],
      agreements: [{ agreementNo: 'AGR/IT/2026/008' }],
    });
  });

  it('rejects documents whose milestone prerequisites are open (rule 7)', async () => {
    const { staff, headers } = await setup();
    const work = await newWork(headers, staff.id);
    const a = api(headers);

    const early = await a.put(`/works/${work.id}/rfq`, rfq());
    expect(early.body.error.code).toBe('MILESTONE_PREREQUISITE_NOT_MET');
    expect(await prisma.rfq.count()).toBe(0); // rolled back

    await tenderUntil(headers, work.id, 'MOA_COST');
    // LoA is recorded; now the cost MoA may follow, but not a PO before it.
    const po = await a.post(`/works/${work.id}/purchase-orders`, {
      poNo: 'PO-EARLY',
      poType: 'NEW',
      poName: 'PO',
      poDate: '2026-06-01',
      amount: 1,
    });
    expect(po.body.error.code).toBe('PO_REQUIRES_MOA');
  });

  it('enforces the new Tender order: cost MoA only after the LoA', async () => {
    const { staff, headers } = await setup();
    const work = await newWork(headers, staff.id);
    const a = api(headers);
    await a.post(`/works/${work.id}/memos`, memo('MEMO-1', 'MEMO_PROCUREMENT', '2026-02-12'));
    await a.put(`/works/${work.id}/rfq`, rfq());
    await a.put(`/works/${work.id}/pvp`, { pvpDate: '2026-04-18', status: 'PENDING' });
    const notEnough = await a.put(`/works/${work.id}/pvp`, {
      pvpDate: '2026-04-18',
      status: 'APPROVED',
    });
    expect(notEnough.body.error.code).toBe('PVP_INSUFFICIENT_APPROVALS');

    for (const directorName of ['Direktur A', 'Direktur B']) {
      await a.post(`/works/${work.id}/pvp/approvals`, {
        directorName,
        decision: 'APPROVED',
        approvalDate: '2026-04-19',
      });
    }
    await a.put(`/works/${work.id}/pvp`, { pvpDate: '2026-04-18', status: 'APPROVED' });
    await a.post(`/works/${work.id}/memos`, memo('MOA-1', 'MOA_TENDER_RESULT', '2026-05-02'));
    const cost = await a.post(
      `/works/${work.id}/memos`,
      memo('MOA-COST-1', 'MOA_COST', '2026-05-03'),
    );
    expect(cost.body.error.code).toBe('MILESTONE_PREREQUISITE_NOT_MET');
    expect(cost.body.error.message).toContain('LoA');
  });

  it('validates memo types and documents against the method', async () => {
    const { staff, headers } = await setup();
    const tender = await newWork(headers, staff.id);
    const wrong = await api(headers).post(
      `/works/${tender.id}/memos`,
      memo('M-PL', 'MEMO_PL', '2026-02-12'),
    );
    expect(wrong.body.error.code).toBe('MEMO_TYPE_NOT_ALLOWED');

    const pl = await newWork(headers, staff.id, { method: 'DIRECT_APPOINTMENT', amount: 300 * M });
    const rfqOnPl = await api(headers).put(`/works/${pl.id}/rfq`, rfq());
    expect(rfqOnPl.body.error.code).toBe('DOCUMENT_NOT_IN_TEMPLATE');
  });

  it('keeps document numbers unique across works (rule 6)', async () => {
    const { staff, headers } = await setup();
    const a = await newWork(headers, staff.id);
    const b = await newWork(headers, staff.id);
    await api(headers).post(
      `/works/${a.id}/memos`,
      memo('021/MEMO/2026', 'MEMO_PROCUREMENT', '2026-02-12'),
    );
    const dup = await api(headers).post(
      `/works/${b.id}/memos`,
      memo('021/MEMO/2026', 'MEMO_PROCUREMENT', '2026-02-13'),
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_DOCUMENT_NUMBER');
  });

  it('reopens a milestone when its document is removed, unless later steps depend on it', async () => {
    const { staff, headers } = await setup();
    const work = await newWork(headers, staff.id);
    const po = await tenderUntil(headers, work.id, 'AGREEMENT');

    const memos = (await api(headers).get(`/works/${work.id}/documents`)).body.data.memos as {
      id: string;
      memoNo: string;
    }[];
    const first = memos.find((m) => m.memoNo === 'MEMO-1')!;
    const blocked = await api(headers).del(`/works/${work.id}/memos/${first.id}`);
    expect(blocked.body.error.code).toBe('MILESTONE_HAS_DEPENDENTS');

    expect((await api(headers).del(`/works/${work.id}/purchase-orders/${po!.id}`)).status).toBe(
      200,
    );
    expect((await milestones(headers, work.id)).PO!.status).toBe('IN_PROGRESS');
  });

  it('lets only the PIC (or a manager) record documents', async () => {
    const { staff, headers } = await setup();
    const work = await newWork(headers, staff.id);
    const other = authHeader(await createTestUser());
    const res = await api(other).post(
      `/works/${work.id}/memos`,
      memo('X-1', 'MEMO_PROCUREMENT', '2026-02-12'),
    );
    expect(res.body.error.code).toBe('NOT_WORK_OWNER');
  });
});

describe('Perpanjangan Khusus', () => {
  async function sourceAgreement(staffId: string, vendorId: string) {
    const work = await prisma.work.create({
      data: {
        code: 'WRK-2025-0001',
        title: 'Lisensi Backup 2025',
        procurementType: 'RENEWAL_LICENSE',
        category: 'BAU',
        method: 'BIDDING',
        procurementYear: 2025,
        picId: staffId,
        amount: 800 * M,
        amountIdr: 800 * M,
        status: 'COMPLETED',
      },
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        workId: work.id,
        poNo: '4500100001',
        poType: 'NEW',
        poName: 'Backup 2025',
        poDate: new Date('2025-06-01'),
        amount: 800 * M,
        amountIdr: 800 * M,
      },
    });
    return prisma.agreement.create({
      data: {
        agreementNo: 'AGR/IT/2025/015',
        agreementType: 'NEW',
        title: 'Lisensi Backup',
        vendorId,
        poId: po.id,
        workId: work.id,
        picId: staffId,
        periodStart: new Date('2025-07-01'),
        periodEnd: new Date('2026-06-30'),
        amount: 800 * M,
        amountIdr: 800 * M,
      },
    });
  }

  it('checks the source agreement on the Memo PK date and ends with an addendum', async () => {
    const { staff, vendor, headers } = await setup();
    const agreement = await sourceAgreement(staff.id, vendor.id);
    const pkBody = {
      method: 'SPECIAL_EXTENSION',
      amount: 820 * M,
      previousPurchaseAmount: 800 * M,
      sourceAgreementId: agreement.id,
    };
    const pk = await newWork(headers, staff.id, pkBody);
    const a = api(headers);

    const late = await a.post(`/works/${pk.id}/memos`, memo('MEMO-PK', 'MEMO_PK', '2026-07-15'));
    expect(late.body.error.code).toBe('PK_SOURCE_AGREEMENT_INACTIVE');
    expect(
      (await a.post(`/works/${pk.id}/memos`, memo('MEMO-PK', 'MEMO_PK', '2026-04-01'))).status,
    ).toBe(201);

    const ms = await milestones(headers, pk.id);
    expect(ms.PVP!.status).toBe('NOT_APPLICABLE'); // +2.5%
    const officialId = (await a.get(`/works/${pk.id}`)).body.data.milestones.find(
      (m: { type: string }) => m.type === 'OFFICIAL_APPROVAL',
    ).id;
    await a.patch(`/works/${pk.id}/milestones/${officialId}`, {
      status: 'DONE',
      completedAt: '2026-04-20',
    });
    await a.post(`/works/${pk.id}/memos`, memo('MOA-PK', 'MOA_PK', '2026-05-01'));
    await a.post(`/works/${pk.id}/memos`, memo('MOA-COST-PK', 'MOA_COST', '2026-05-02'));
    const po = await a.post(`/works/${pk.id}/purchase-orders`, {
      poNo: '4500131190',
      poType: 'RENEWAL',
      poName: 'Backup 2026',
      poDate: '2026-06-01',
      amount: 820 * M,
    });
    expect(po.status).toBe(201);

    const addendum = {
      workId: pk.id,
      addendumNo: 'ADD-01/AGR/IT/2025/015',
      title: 'Addendum I Perpanjangan',
      addendumDate: '2026-06-15',
      newPeriodEnd: '2027-06-30',
      valueChange: 820 * M,
      poId: po.body.data.id,
    };
    const noResult = await a.post(`/agreements/${agreement.id}/addendums`, addendum);
    expect(noResult.body.error.code).toBe('PK_RESULT_REQUIRED');

    await a.patch(`/works/${pk.id}`, {
      title: 'Renewal Microsoft 365 E3',
      procurementType: 'RENEWAL_LICENSE',
      category: 'BAU',
      procurementYear: 2026,
      picId: staff.id,
      status: 'ACTIVE',
      pkResult: 'ADDENDUM',
      ...pkBody,
    });
    const res = await a.post(`/agreements/${agreement.id}/addendums`, addendum);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({
      periodEnd: '2026-06-30',
      effectivePeriodEnd: '2027-06-30',
      status: 'ACTIVE',
      addendums: [{ addendumNo: 'ADD-01/AGR/IT/2025/015' }],
    });
    expect((await milestones(headers, pk.id)).AGREEMENT_OR_ADDENDUM).toMatchObject({
      status: 'DONE',
      completedAt: '2026-06-15',
    });
  });
});

describe('agreements list', () => {
  it('filters agreements ending soon', async () => {
    const { staff, vendor, headers } = await setup();
    const work = await prisma.work.create({
      data: {
        code: 'WRK-2025-0009',
        title: 'Lisensi X',
        procurementType: 'NEW_LICENSE',
        category: 'BAU',
        method: 'BIDDING',
        procurementYear: 2025,
        picId: staff.id,
        amount: 1,
        amountIdr: 1,
      },
    });
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
    for (const [no, end] of [
      ['AGR-SOON', 20],
      ['AGR-LATER', 200],
    ] as const) {
      const po = await prisma.purchaseOrder.create({
        data: {
          workId: work.id,
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
          vendorId: vendor.id,
          poId: po.id,
          workId: work.id,
          picId: staff.id,
          periodStart: day(-300),
          periodEnd: day(end),
          amount: 1,
          amountIdr: 1,
        },
      });
    }
    const res = await api(headers).get('/agreements?expiringWithin=30');
    expect(res.body.data.map((a: { agreementNo: string }) => a.agreementNo)).toEqual(['AGR-SOON']);
    expect(res.body.data[0].daysLeft).toBeGreaterThan(18);
  });
});
