import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sipita/shared';
import { createApp } from '../../app.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createTestUser,
  resetDatabase,
  seedDefaultApprovalRules,
} from '../../test/db.js';

const app = createApp();
const api = '/api/v1/purchase-requests';
const tomorrow = () => dayjs().tz().add(1, 'day').format('YYYY-MM-DD');

let laptopId: string;
let divisionId: string;

async function userWith(roles: Role[]) {
  const user = await createTestUser({ roles, divisionId });
  return { user, headers: authHeader(user, roles) };
}

function prPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Laptop staf baru',
    justification: 'Dua staf baru bergabung bulan depan',
    priority: 'HIGH',
    neededDate: tomorrow(),
    items: [
      { itemId: laptopId, qty: 2, estimatedUnitPrice: 15_000_000, unit: 'diabaikan' },
      { freeTextName: 'Kabel HDMI 5m', unit: 'pcs', qty: 3, estimatedUnitPrice: 75_000.5 },
    ],
    ...overrides,
  };
}

async function createDraft(headers: Record<string, string>) {
  const res = await request(app).post(api).set(headers).send(prPayload());
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

async function submitted(headers: Record<string, string>) {
  const pr = await createDraft(headers);
  await request(app).post(`${api}/${pr.id}/submit`).set(headers).expect(200);
  return pr;
}

beforeEach(async () => {
  await resetDatabase();
  const division = await prisma.division.create({ data: { code: 'OPS', name: 'Operasional' } });
  divisionId = division.id;
  const category = await prisma.itemCategory.create({ data: { code: 'HW', name: 'Hardware' } });
  const laptop = await prisma.item.create({
    data: { code: 'LPT', name: 'Laptop', unit: 'unit', isAsset: true, categoryId: category.id },
  });
  laptopId = laptop.id;
});
afterAll(() => prisma.$disconnect());

describe('creating and editing drafts', () => {
  it('creates a draft without a number, computing totals and catalog units server-side', async () => {
    const { user, headers } = await userWith(['REQUESTER']);
    const res = await request(app).post(api).set(headers).send(prPayload());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      number: null,
      status: 'DRAFT',
      priority: 'HIGH',
      neededDate: tomorrow(),
      estimatedTotal: '30225001.50',
      requester: { id: user.id },
      division: { code: 'OPS' },
    });
    expect(res.body.data.items).toMatchObject([
      { name: 'Laptop', unit: 'unit', qty: 2, subtotal: '30000000.00', item: { code: 'LPT' } },
      {
        name: 'Kabel HDMI 5m',
        unit: 'pcs',
        qty: 3,
        estimatedUnitPrice: '75000.50',
        subtotal: '225001.50',
        item: null,
      },
    ]);
  });

  it('requires the REQUESTER role, a division, and a future date', async () => {
    const { headers: whHeaders } = await userWith(['WAREHOUSE']);
    expect((await request(app).post(api).set(whHeaders).send(prPayload())).status).toBe(403);

    const noDivision = await createTestUser({ roles: ['REQUESTER'] });
    const res = await request(app)
      .post(api)
      .set(authHeader(noDivision, ['REQUESTER']))
      .send(prPayload());
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('divisi');

    const { headers } = await userWith(['REQUESTER']);
    const past = await request(app)
      .post(api)
      .set(headers)
      .send(prPayload({ neededDate: '2020-01-01' }));
    expect(past.status).toBe(400);
    expect(past.body.error.details[0].path).toBe('neededDate');
  });

  it('rejects unknown catalog items with a field path', async () => {
    const { headers } = await userWith(['REQUESTER']);
    const res = await request(app)
      .post(api)
      .set(headers)
      .send(prPayload({ items: [{ itemId: crypto.randomUUID(), qty: 1, estimatedUnitPrice: 1 }] }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('items.0.itemId');
  });

  it('lets only the owner edit or delete, and only while DRAFT', async () => {
    const { headers } = await userWith(['REQUESTER']);
    const { headers: otherHeaders } = await userWith(['REQUESTER', 'PROCUREMENT']);
    const pr = await createDraft(headers);

    const edit = await request(app)
      .put(`${api}/${pr.id}`)
      .set(headers)
      .send(
        prPayload({
          title: 'Diubah',
          items: [{ itemId: laptopId, qty: 1, estimatedUnitPrice: 10 }],
        }),
      );
    expect(edit.body.data).toMatchObject({ title: 'Diubah', estimatedTotal: '10.00' });
    expect(edit.body.data.items).toHaveLength(1);

    // Another user cannot even see someone else's draft.
    expect(
      (await request(app).put(`${api}/${pr.id}`).set(otherHeaders).send(prPayload())).status,
    ).toBe(404);

    await request(app).post(`${api}/${pr.id}/submit`).set(headers).expect(200);
    const late = await request(app).put(`${api}/${pr.id}`).set(headers).send(prPayload());
    expect(late.status).toBe(409);
    expect((await request(app).delete(`${api}/${pr.id}`).set(headers)).status).toBe(409);
  });

  it('hard-deletes drafts', async () => {
    const { headers } = await userWith(['REQUESTER']);
    const pr = await createDraft(headers);
    expect((await request(app).delete(`${api}/${pr.id}`).set(headers)).status).toBe(200);
    expect(await prisma.purchaseRequest.count()).toBe(0);
    expect(await prisma.purchaseRequestItem.count()).toBe(0);
  });
});

describe('visibility', () => {
  it('shows requesters only their own PRs and hides drafts from everyone else', async () => {
    const a = await userWith(['REQUESTER']);
    const b = await userWith(['REQUESTER']);
    const viewer = await userWith(['VIEWER']);
    await createDraft(a.headers);
    const aSubmitted = await submitted(a.headers);
    await createDraft(b.headers);

    const listA = await request(app).get(api).set(a.headers);
    expect(listA.body.meta.total).toBe(2);
    const listB = await request(app).get(api).set(b.headers);
    expect(listB.body.meta.total).toBe(1);

    const listViewer = await request(app).get(api).set(viewer.headers);
    expect(listViewer.body.data.map((p: { id: string }) => p.id)).toEqual([aSubmitted.id]);

    expect((await request(app).get(`${api}/${aSubmitted.id}`).set(b.headers)).status).toBe(404);
    expect((await request(app).get(`${api}/${aSubmitted.id}`).set(viewer.headers)).status).toBe(
      200,
    );
  });

  it('filters by status, mine and search', async () => {
    const a = await userWith(['REQUESTER', 'PROCUREMENT']);
    const b = await userWith(['REQUESTER']);
    await createDraft(a.headers);
    const bPr = await submitted(b.headers);
    const number = (await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: bPr.id } }))
      .number!;

    expect((await request(app).get(`${api}?status=SUBMITTED`).set(a.headers)).body.meta.total).toBe(
      1,
    );
    expect((await request(app).get(`${api}?mine=true`).set(a.headers)).body.meta.total).toBe(1);
    const search = await request(app)
      .get(`${api}?search=${encodeURIComponent(number)}`)
      .set(a.headers);
    expect(search.body.data.map((p: { id: string }) => p.id)).toEqual([bPr.id]);
  });

  it('filters by requester and lists only requesters with visible PRs', async () => {
    const budi = await createTestUser({ name: 'Budi Santoso', roles: ['REQUESTER'], divisionId });
    const budiHeaders = authHeader(budi, ['REQUESTER']);
    const citra = await createTestUser({ name: 'Citra Lestari', roles: ['REQUESTER'], divisionId });
    const citraHeaders = authHeader(citra, ['REQUESTER']);
    const dewi = await createTestUser({ name: 'Dewi Anggraini', roles: ['REQUESTER'], divisionId });
    const viewer = await userWith(['VIEWER']);
    const budiPr = await submitted(budiHeaders);
    await submitted(citraHeaders);
    // Dewi only has a draft, which the viewer cannot see.
    await createDraft(authHeader(dewi, ['REQUESTER']));

    const filtered = await request(app).get(`${api}?requesterId=${budi.id}`).set(viewer.headers);
    expect(filtered.body.data.map((p: { id: string }) => p.id)).toEqual([budiPr.id]);

    const options = await request(app).get(`${api}/requesters`).set(viewer.headers);
    expect(options.status).toBe(200);
    expect(options.body.data).toMatchObject([
      { id: budi.id, name: 'Budi Santoso', division: { name: 'Operasional' } },
      { id: citra.id, name: 'Citra Lestari' },
    ]);

    const searched = await request(app).get(`${api}/requesters?search=citra`).set(viewer.headers);
    expect(searched.body.data.map((u: { id: string }) => u.id)).toEqual([citra.id]);

    // A requester only ever sees themselves.
    const own = await request(app).get(`${api}/requesters`).set(budiHeaders);
    expect(own.body.data.map((u: { id: string }) => u.id)).toEqual([budi.id]);
  });
});

describe('workflow', () => {
  it('submit assigns the next PR number and records the history', async () => {
    const { headers } = await userWith(['REQUESTER']);
    const first = await createDraft(headers);
    const second = await createDraft(headers);

    // Numbers follow submission order, not creation order.
    const s2 = await request(app).post(`${api}/${second.id}/submit`).set(headers);
    const s1 = await request(app).post(`${api}/${first.id}/submit`).set(headers);
    const ym = dayjs().tz().format('YYYY/MM');
    expect(s2.body.data).toMatchObject({ status: 'SUBMITTED', number: `PR-IT/${ym}/0001` });
    expect(s1.body.data.number).toBe(`PR-IT/${ym}/0002`);
    expect(s1.body.data.submittedAt).toEqual(expect.any(String));

    const history = await request(app).get(`${api}/${first.id}/history`).set(headers);
    expect(
      history.body.data.map((h: { fromStatus: string; toStatus: string }) => [
        h.fromStatus,
        h.toStatus,
      ]),
    ).toEqual([
      [null, 'DRAFT'],
      ['DRAFT', 'SUBMITTED'],
    ]);
  });

  it('runs the stock check: available → fulfilled from stock', async () => {
    const requester = await userWith(['REQUESTER']);
    const warehouse = await userWith(['WAREHOUSE']);
    const pr = await submitted(requester.headers);

    // Cannot decide before starting, and only the warehouse can start.
    expect(
      (
        await request(app)
          .post(`${api}/${pr.id}/stock-check`)
          .set(warehouse.headers)
          .send({ available: true })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).post(`${api}/${pr.id}/start-stock-check`).set(requester.headers)).status,
    ).toBe(403);

    await request(app).post(`${api}/${pr.id}/start-stock-check`).set(warehouse.headers).expect(200);
    const done = await request(app)
      .post(`${api}/${pr.id}/stock-check`)
      .set(warehouse.headers)
      .send({ available: true, notes: 'Ambil dari rak A2' });
    expect(done.body.data).toMatchObject({
      status: 'FULFILLED_FROM_STOCK',
      stockCheck: { by: { id: warehouse.user.id }, notes: 'Ambil dari rak A2' },
    });

    const audit = await prisma.auditLog.findMany({
      where: { entityId: pr.id, action: 'STATUS_CHANGE' },
    });
    expect(audit).toHaveLength(3);
  });

  it('runs the stock check: unavailable → pending approval with a generated memo', async () => {
    await seedDefaultApprovalRules();
    const requester = await userWith(['REQUESTER']);
    const warehouse = await userWith(['WAREHOUSE']);
    const pr = await submitted(requester.headers);
    await request(app).post(`${api}/${pr.id}/start-stock-check`).set(warehouse.headers).expect(200);
    const done = await request(app)
      .post(`${api}/${pr.id}/stock-check`)
      .set(warehouse.headers)
      .send({ available: false });
    expect(done.body.data.status).toBe('PENDING_APPROVAL');
    // 30.2jt → levels 1 and 2
    expect(done.body.data.memo).toMatchObject({
      number: expect.stringMatching(/^MEMO-IT\/\d{4}\/\d{2}\/0001$/),
      status: 'PENDING',
      steps: [
        { level: 1, status: 'PENDING' },
        { level: 2, status: 'WAITING' },
      ],
    });
  });

  it('keeps the PR in stock check when no approval rule covers its total', async () => {
    const requester = await userWith(['REQUESTER']);
    const warehouse = await userWith(['WAREHOUSE']);
    const pr = await submitted(requester.headers);
    await request(app).post(`${api}/${pr.id}/start-stock-check`).set(warehouse.headers).expect(200);
    const res = await request(app)
      .post(`${api}/${pr.id}/stock-check`)
      .set(warehouse.headers)
      .send({ available: false });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APPROVAL_RULE_NOT_FOUND');
    const stored = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } });
    expect(stored.status).toBe('STOCK_CHECK');
  });

  it('cancels with a mandatory reason, respecting who may cancel when', async () => {
    const requester = await userWith(['REQUESTER']);
    const warehouse = await userWith(['WAREHOUSE']);
    const pr = await submitted(requester.headers);

    expect(
      (
        await request(app)
          .post(`${api}/${pr.id}/cancel`)
          .set(requester.headers)
          .send({ reason: '' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`${api}/${pr.id}/cancel`)
          .set(warehouse.headers)
          .send({ reason: 'x' })
      ).status,
    ).toBe(403);

    const res = await request(app)
      .post(`${api}/${pr.id}/cancel`)
      .set(requester.headers)
      .send({ reason: 'Tidak jadi' });
    expect(res.body.data).toMatchObject({
      status: 'CANCELLED',
      cancellation: { reason: 'Tidak jadi' },
    });

    const again = await request(app)
      .post(`${api}/${pr.id}/cancel`)
      .set(requester.headers)
      .send({ reason: 'x' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects double submission from concurrent requests', async () => {
    const { headers } = await userWith(['REQUESTER']);
    const pr = await createDraft(headers);
    const results = await Promise.all([
      request(app).post(`${api}/${pr.id}/submit`).set(headers),
      request(app).post(`${api}/${pr.id}/submit`).set(headers),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    // The losing transaction rolled back, so its number was not consumed.
    const seq = await prisma.documentSequence.findFirstOrThrow({ where: { prefix: 'PR-IT' } });
    expect(seq.lastNumber).toBe(1);
  });
});
