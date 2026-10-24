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

beforeEach(async () => {
  await resetDatabase();
  await seedMilestoneTemplates();
});
afterAll(() => prisma.$disconnect());

function workBody(picId: string, over: Record<string, unknown> = {}) {
  return {
    title: 'Renewal Microsoft 365 E3',
    procurementType: 'RENEWAL_LICENSE',
    category: 'BAU',
    method: 'TENDER',
    procurementYear: 2026,
    picId,
    amount: 2_000 * M,
    currency: 'IDR',
    exchangeRate: 1,
    previousPurchaseAmount: 1_900 * M,
    ...over,
  };
}

async function setup() {
  const staff = await createTestUser({ name: 'Andi' });
  const other = await createTestUser({ name: 'Dewi' });
  const manager = await createTestUser({ name: 'Hendra', jobLevel: 'MANAGER_L2' });
  return { staff, other, manager, headers: authHeader(staff) };
}

async function createWork(headers: Record<string, string>, body: Record<string, unknown>) {
  const res = await request(app).post('/api/v1/works').set(headers).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as {
    id: string;
    code: string;
    milestones: { id: string; type: string; status: string }[];
  } & Record<string, unknown>;
}

const milestoneId = (work: { milestones: { id: string; type: string }[] }, type: string) =>
  work.milestones.find((m) => m.type === type)!.id;

async function setMilestone(
  headers: Record<string, string>,
  workId: string,
  id: string,
  body: Record<string, unknown>,
) {
  return request(app).patch(`/api/v1/works/${workId}/milestones/${id}`).set(headers).send(body);
}

describe('creating works', () => {
  it('generates the code, milestones from the template, and computed PVP fields', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));

    expect(work.code).toBe('WRK-2026-0001');
    expect(work).toMatchObject({
      amountIdr: 2_000 * M,
      increasePercent: 5.26,
      pvpRequired: true,
      suggestedMethod: 'TENDER',
      issues: [],
    });
    expect(work.milestones.map((m) => m.type)).toEqual([
      'MEMO',
      'RFQ',
      'PVP',
      'MOA_METHOD',
      'MOA_COST',
      'LOA',
      'PO',
      'AGREEMENT',
    ]);
    expect(work.currentStages).toEqual([expect.objectContaining({ type: 'MEMO' })]);

    const log = await prisma.auditLog.findFirst({ where: { entity: 'Work', entityId: work.id } });
    expect(log?.action).toBe('CREATE');
  });

  it('marks PVP not applicable below the thresholds and converts foreign currency', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(
      headers,
      workBody(staff.id, {
        method: 'BIDDING',
        amount: 20_000,
        currency: 'usd',
        exchangeRate: 16_250.5,
        previousPurchaseAmount: 320 * M,
      }),
    );
    expect(work).toMatchObject({ currency: 'USD', amountIdr: 325_010_000, pvpRequired: false });
    expect(work.milestones.find((m) => m.type === 'PVP')?.status).toBe('NOT_APPLICABLE');
  });

  it('stores a method/value mismatch as a data issue without blocking', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id, { method: 'BIDDING' }));
    expect(work.issues).toEqual([expect.objectContaining({ code: 'METHOD_MISMATCH' })]);

    const flagged = await request(app).get('/api/v1/works?hasIssues=true').set(headers);
    expect(flagged.body.data.map((w: { id: string }) => w.id)).toEqual([work.id]);
  });

  it('lets staff create works only for themselves', async () => {
    const { other, headers } = await setup();
    const res = await request(app).post('/api/v1/works').set(headers).send(workBody(other.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_WORK_OWNER');
  });

  it('requires a source agreement for Perpanjangan Khusus', async () => {
    const { staff, headers } = await setup();
    const res = await request(app)
      .post('/api/v1/works')
      .set(headers)
      .send(workBody(staff.id, { method: 'SPECIAL_EXTENSION' }));
    expect(res.status).toBe(400);
  });
});

describe('ownership', () => {
  it('lets staff change and delete only their own works; managers any', async () => {
    const { staff, other, manager, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    const otherHeaders = authHeader(other);

    const patch = { ...workBody(staff.id), status: 'ACTIVE', title: 'Diubah' };
    const denied = await request(app)
      .patch(`/api/v1/works/${work.id}`)
      .set(otherHeaders)
      .send(patch);
    expect(denied.status).toBe(403);
    expect((await request(app).delete(`/api/v1/works/${work.id}`).set(otherHeaders)).status).toBe(
      403,
    );

    const byManager = await request(app)
      .patch(`/api/v1/works/${work.id}`)
      .set(authHeader(manager))
      .send(patch);
    expect(byManager.status).toBe(200);

    expect((await request(app).delete(`/api/v1/works/${work.id}`).set(headers)).status).toBe(200);
    expect((await request(app).get(`/api/v1/works/${work.id}`).set(headers)).status).toBe(404);
  });

  it('lets only managers reassign the PIC and logs it', async () => {
    const { staff, other, manager, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));

    const byStaff = await request(app)
      .post(`/api/v1/works/${work.id}/reassign`)
      .set(headers)
      .send({ picId: other.id });
    expect(byStaff.status).toBe(403);

    const res = await request(app)
      .post(`/api/v1/works/${work.id}/reassign`)
      .set(authHeader(manager))
      .send({ picId: other.id, note: 'Andi cuti' });
    expect(res.status).toBe(200);
    expect(res.body.data.pic.id).toBe(other.id);

    const mine = await request(app).get('/api/v1/works/mine').set(authHeader(other));
    expect(mine.body.meta.total).toBe(1);
  });

  it('respects a narrowed WORK delete permission', async () => {
    const staff = await createTestUser({ permissions: { WORK: { delete: false } } });
    const headers = authHeader(staff);
    const work = await createWork(headers, workBody(staff.id));
    expect((await request(app).delete(`/api/v1/works/${work.id}`).set(headers)).status).toBe(403);
  });
});

describe('milestone rules (§5.5)', () => {
  it('blocks a milestone before its prerequisites and logs status changes', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));

    const early = await setMilestone(headers, work.id, milestoneId(work, 'RFQ'), {
      status: 'IN_PROGRESS',
    });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('MILESTONE_PREREQUISITE_NOT_MET');

    const memo = await setMilestone(headers, work.id, milestoneId(work, 'MEMO'), {
      status: 'DONE',
      completedAt: '2026-02-12',
      referenceNo: '021/MEMO/IT-SAPM/II/2026',
    });
    expect(memo.status).toBe(200);
    expect(memo.body.data.currentStages.map((s: { type: string }) => s.type)).toEqual(['RFQ']);

    const updates = await request(app).get(`/api/v1/works/${work.id}/updates`).set(headers);
    expect(updates.body.data[0]).toMatchObject({
      statusFrom: 'NOT_STARTED',
      statusTo: 'DONE',
      milestone: { type: 'MEMO' },
    });
  });

  it('requires both MoAs before the PO and enough director approvals for PVP', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    const done = (type: string) =>
      setMilestone(headers, work.id, milestoneId(work, type), { status: 'DONE' });

    await done('MEMO');
    await done('RFQ');
    const pvp = await done('PVP');
    expect(pvp.body.error.code).toBe('PVP_INSUFFICIENT_APPROVALS');

    const forum = await prisma.pvpForum.create({
      data: { workId: work.id, pvpDate: new Date('2026-04-18'), status: 'APPROVED' },
    });
    await prisma.pvpApproval.createMany({
      data: ['Direktur Operasional', 'Direktur Keuangan'].map((directorName) => ({
        pvpForumId: forum.id,
        directorName,
        decision: 'APPROVED' as const,
        approvalDate: new Date('2026-04-19'),
      })),
    });
    expect((await done('PVP')).status).toBe(200);

    await done('MOA_METHOD');
    const po = await setMilestone(headers, work.id, milestoneId(work, 'PO'), {
      status: 'IN_PROGRESS',
    });
    expect(po.body.error.code).toBe('MILESTONE_PREREQUISITE_NOT_MET');
    await done('MOA_COST');
    expect((await done('PO')).status).toBe(200);

    // MEMO cannot be reopened once later milestones depend on it.
    const reopen = await setMilestone(headers, work.id, milestoneId(work, 'MEMO'), {
      status: 'IN_PROGRESS',
    });
    expect(reopen.body.error.code).toBe('MILESTONE_HAS_DEPENDENTS');
  });

  it('only completes a work whose final milestone is done', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    const res = await request(app)
      .patch(`/api/v1/works/${work.id}`)
      .set(headers)
      .send({ ...workBody(staff.id), status: 'COMPLETED' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WORK_NOT_FINISHED');
  });

  it('enforces PK rules: active source agreement on the memo date and a chosen result', async () => {
    const { staff, headers } = await setup();
    const vendor = await prisma.vendor.create({ data: { code: 'V1', name: 'PT Backup' } });
    const sourceWork = await createWork(
      headers,
      workBody(staff.id, { method: 'BIDDING', amount: 800 * M }),
    );
    const po = await prisma.purchaseOrder.create({
      data: {
        workId: sourceWork.id,
        poNo: '4500100001',
        poType: 'NEW',
        poName: 'Backup 2025',
        poDate: new Date('2025-06-01'),
        amount: 800 * M,
        amountIdr: 800 * M,
      },
    });
    const agreement = await prisma.agreement.create({
      data: {
        agreementNo: 'AGR/IT/2025/015',
        agreementType: 'NEW',
        title: 'Lisensi Backup',
        vendorId: vendor.id,
        poId: po.id,
        workId: sourceWork.id,
        picId: staff.id,
        periodStart: new Date('2025-07-01'),
        periodEnd: new Date('2026-06-30'),
        amount: 800 * M,
        amountIdr: 800 * M,
      },
    });

    const pk = await createWork(
      headers,
      workBody(staff.id, {
        method: 'SPECIAL_EXTENSION',
        amount: 820 * M,
        previousPurchaseAmount: 800 * M,
        sourceAgreementId: agreement.id,
      }),
    );
    const memoId = milestoneId(pk, 'MEMO');
    const late = await setMilestone(headers, pk.id, memoId, {
      status: 'DONE',
      completedAt: '2026-07-15',
    });
    expect(late.body.error.code).toBe('PK_SOURCE_AGREEMENT_INACTIVE');
    expect(
      (await setMilestone(headers, pk.id, memoId, { status: 'DONE', completedAt: '2026-04-01' }))
        .status,
    ).toBe(200);

    for (const type of ['OFFICIAL_APPROVAL', 'MOA_METHOD', 'MOA_COST', 'PO']) {
      const res = await setMilestone(headers, pk.id, milestoneId(pk, type), { status: 'DONE' });
      expect(res.status, type).toBe(200);
    }
    const final = await setMilestone(headers, pk.id, milestoneId(pk, 'AGREEMENT_OR_ADDENDUM'), {
      status: 'DONE',
    });
    expect(final.body.error.code).toBe('PK_RESULT_REQUIRED');
  });
});

describe('method changes', () => {
  it('rebuilds milestones while untouched and locks the method afterwards', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    const toPl = await request(app)
      .patch(`/api/v1/works/${work.id}`)
      .set(headers)
      .send({ ...workBody(staff.id, { method: 'DIRECT_APPOINTMENT' }), status: 'ACTIVE' });
    expect(toPl.status).toBe(200);
    expect(toPl.body.data.milestones.map((m: { type: string }) => m.type)).toContain(
      'OFFICIAL_APPROVAL',
    );

    await setMilestone(headers, work.id, milestoneId(toPl.body.data, 'MEMO'), {
      status: 'IN_PROGRESS',
    });
    const back = await request(app)
      .patch(`/api/v1/works/${work.id}`)
      .set(headers)
      .send({ ...workBody(staff.id), status: 'ACTIVE' });
    expect(back.body.error.code).toBe('METHOD_LOCKED');
  });
});

describe('progress log', () => {
  it('appends notes and bumps lastUpdatedAt', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    await prisma.work.update({
      where: { id: work.id },
      data: { lastUpdatedAt: new Date(Date.now() - 10 * 86_400_000) },
    });
    const stale = await request(app).get('/api/v1/works?stale=true').set(headers);
    expect(stale.body.meta.total).toBe(1);

    const res = await request(app)
      .post(`/api/v1/works/${work.id}/updates`)
      .set(headers)
      .field('note', 'Menunggu draft RFQ dari procurement');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ note: 'Menunggu draft RFQ dari procurement' });

    const after = await request(app).get('/api/v1/works?stale=true').set(headers);
    expect(after.body.meta.total).toBe(0);
  });
});

describe('GET /procurement-rules/evaluate', () => {
  it('previews method and PVP for the form', async () => {
    const { headers } = await setup();
    const res = await request(app)
      .get('/api/v1/procurement-rules/evaluate?amountIdr=600000000')
      .set(headers);
    expect(res.body.data).toEqual({
      suggestedMethod: 'BIDDING',
      increasePercent: null,
      pvpRequired: true,
    });
  });
});
