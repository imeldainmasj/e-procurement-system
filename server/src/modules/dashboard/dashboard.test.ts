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
const year = new Date().getFullYear();

beforeEach(async () => {
  await resetDatabase();
  await seedMilestoneTemplates();
});
afterAll(() => prisma.$disconnect());

async function createWork(
  headers: Record<string, string>,
  picId: string,
  over: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/v1/works')
    .set(headers)
    .send({
      title: 'Pekerjaan',
      procurementType: 'NEW_LICENSE',
      category: 'BAU',
      method: 'BIDDING',
      procurementYear: year,
      picId,
      amount: 200 * M,
      ...over,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; milestones: { id: string; type: string }[] };
}

async function setup() {
  const andi = await createTestUser({ name: 'Andi' });
  const dewi = await createTestUser({ name: 'Dewi' });
  const manager = await createTestUser({ name: 'Hendra', jobLevel: 'MANAGER_L2' });
  const ha = authHeader(andi);
  const hd = authHeader(dewi);

  const a1 = await createWork(ha, andi.id, { title: 'A1 aktif' });
  await createWork(ha, andi.id, { title: 'A2 lama', amount: 300 * M });
  const d1 = await createWork(hd, dewi.id, { title: 'D1 PL', method: 'DIRECT_APPOINTMENT' });
  await createWork(hd, dewi.id, {
    title: 'D2 tahun lalu',
    procurementYear: year - 1,
    amount: 100 * M,
  });

  // A2 has not been updated for 10 days.
  await prisma.work.updateMany({
    where: { title: 'A2 lama' },
    data: { lastUpdatedAt: new Date(Date.now() - 10 * 86_400_000) },
  });
  // D1: memo recorded → waiting for the official (outside IT).
  await request(app)
    .post(`/api/v1/works/${d1.id}/memos`)
    .set(hd)
    .send({ memoNo: 'M-PL-1', memoType: 'MEMO_PL', title: 'Memo PL', memoDate: `${year}-01-10` });
  return { andi, dewi, manager, ha, hd, a1, d1 };
}

describe('dashboards', () => {
  it('shows a staff member their own stale and waiting works', async () => {
    const { dewi, ha, hd } = await setup();
    const andiBoard = (await request(app).get('/api/v1/dashboard/staff').set(ha)).body.data;
    expect(andiBoard).toMatchObject({ activeCount: 2, staleDays: 7 });
    expect(andiBoard.stale.map((w: { title: string }) => w.title)).toEqual(['A2 lama']);

    const dewiBoard = (await request(app).get('/api/v1/dashboard/staff').set(hd)).body.data;
    expect(dewiBoard.waitingOutside).toEqual([
      expect.objectContaining({
        title: 'D1 PL',
        waitingOutsideIt: true,
        pic: { id: dewi.id, name: 'Dewi' },
        currentStages: [
          expect.objectContaining({ type: 'OFFICIAL_APPROVAL', executor: 'OFFICIAL' }),
        ],
      }),
    ]);
  });

  it('gives managers team KPIs aggregated per year, staff and stage', async () => {
    const { manager, ha } = await setup();
    expect((await request(app).get('/api/v1/dashboard/manager').set(ha)).status).toBe(403);

    const res = await request(app).get('/api/v1/dashboard/manager').set(authHeader(manager));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.kpi).toMatchObject({
      active: 4,
      valueThisYear: 700 * M,
      valueLastYear: 100 * M,
      stale: 1,
      expiringAgreements: 0,
    });
    expect(d.valueByYear).toEqual([
      { year: year - 1, amountIdr: 100 * M, count: 1 },
      { year, amountIdr: 700 * M, count: 3 },
    ]);
    expect(d.workload).toEqual(
      expect.arrayContaining([
        { user: expect.objectContaining({ name: 'Andi' }), active: 2, onHold: 0, stale: 1 },
        { user: expect.objectContaining({ name: 'Dewi' }), active: 2, onHold: 0, stale: 0 },
      ]),
    );
    expect(d.stageDistribution).toEqual([
      expect.objectContaining({ type: 'MEMO', count: 3 }),
      expect.objectContaining({ type: 'OFFICIAL_APPROVAL', count: 1, executor: 'OFFICIAL' }),
    ]);
  });
});

describe('Monitoring Tim', () => {
  it('summarises each staff member and places works on the stage board', async () => {
    const { manager, andi } = await setup();
    const h = authHeader(manager);

    const team = (await request(app).get('/api/v1/monitoring/team').set(h)).body.data;
    const andiRow = team.find((t: { user: { id: string } }) => t.user.id === andi.id);
    expect(andiRow).toMatchObject({
      active: 2,
      stale: 1,
      oldestWithoutUpdate: expect.objectContaining({ title: 'A2 lama' }),
    });

    const board = (await request(app).get('/api/v1/monitoring/board').set(h)).body.data;
    expect(board.map((c: { type: string; works: unknown[] }) => [c.type, c.works.length])).toEqual([
      ['MEMO', 3],
      ['OFFICIAL_APPROVAL', 1],
    ]);

    const staff = (await request(app).get(`/api/v1/monitoring/staff/${andi.id}`).set(h)).body.data;
    expect(staff.works).toHaveLength(2);
    expect(staff.works[0].lastUpdate).toMatchObject({ note: 'Pekerjaan dibuat', author: 'Andi' });
  });

  it('is limited to managers', async () => {
    const { ha } = await setup();
    expect((await request(app).get('/api/v1/monitoring/team').set(ha)).status).toBe(403);
  });
});
