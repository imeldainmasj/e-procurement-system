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
      'LOA',
      'MOA_COST',
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

describe('manual milestone changes (§5.5)', () => {
  it('blocks a milestone before its prerequisites', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    const early = await setMilestone(headers, work.id, milestoneId(work, 'RFQ'), {
      status: 'IN_PROGRESS',
    });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('MILESTONE_PREREQUISITE_NOT_MET');

    const started = await setMilestone(headers, work.id, milestoneId(work, 'MEMO'), {
      status: 'IN_PROGRESS',
      note: 'Draft memo disusun',
    });
    expect(started.status).toBe(200);
    const updates = await request(app).get(`/api/v1/works/${work.id}/updates`).set(headers);
    expect(updates.body.data[0]).toMatchObject({
      note: 'Draft memo disusun',
      statusFrom: 'NOT_STARTED',
      statusTo: 'IN_PROGRESS',
      milestone: { type: 'MEMO' },
    });
  });

  it('completes document-backed milestones only through their document (rule 8)', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(headers, workBody(staff.id));
    const res = await setMilestone(headers, work.id, milestoneId(work, 'MEMO'), { status: 'DONE' });
    expect(res.body.error.code).toBe('MILESTONE_REQUIRES_DOCUMENT');
  });

  it('lets Approval Pejabat be completed by hand', async () => {
    const { staff, headers } = await setup();
    const work = await createWork(
      headers,
      workBody(staff.id, {
        method: 'DIRECT_APPOINTMENT',
        amount: 300 * M,
        previousPurchaseAmount: null,
      }),
    );
    const memo = await request(app)
      .post(`/api/v1/works/${work.id}/memos`)
      .set(headers)
      .send({ memoNo: 'M-PL-1', memoType: 'MEMO_PL', title: 'Memo PL', memoDate: '2026-03-02' });
    expect(memo.status).toBe(201);

    const official = await setMilestone(headers, work.id, milestoneId(work, 'OFFICIAL_APPROVAL'), {
      status: 'DONE',
      completedAt: '2026-03-20',
      referenceNo: 'DISP/PROC/2026/031',
      notes: 'Hartono Wibisono — VP Procurement',
    });
    expect(official.status).toBe(200);
    const m = official.body.data.milestones.find(
      (x: { type: string }) => x.type === 'OFFICIAL_APPROVAL',
    );
    expect(m).toMatchObject({ status: 'DONE', completedAt: '2026-03-20' });
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
