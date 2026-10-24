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
type Headers = Record<string, string>;

let divisionId: string;
let users: Record<
  'requester' | 'warehouse' | 'procurement' | 'l1' | 'l2' | 'l3',
  { id: string; headers: Headers }
>;

async function makeUser(roles: Role[], approvalLevel: number | null = null) {
  const user = await createTestUser({ roles, approvalLevel, divisionId });
  return { id: user.id, headers: authHeader(user, roles) };
}

/** Creates a PR worth `total` and runs it through submit + stock check (unavailable). */
async function prInApproval(total: number, requester = users.requester) {
  const created = await request(app)
    .post('/api/v1/purchase-requests')
    .set(requester.headers)
    .send({
      title: `PR ${total}`,
      justification: 'Uji approval',
      neededDate: dayjs().tz().add(3, 'day').format('YYYY-MM-DD'),
      items: [{ freeTextName: 'Barang uji', unit: 'unit', qty: 1, estimatedUnitPrice: total }],
    })
    .expect(201);
  const id = created.body.data.id as string;
  await request(app)
    .post(`/api/v1/purchase-requests/${id}/submit`)
    .set(requester.headers)
    .expect(200);
  await request(app)
    .post(`/api/v1/purchase-requests/${id}/start-stock-check`)
    .set(users.warehouse.headers)
    .expect(200);
  const res = await request(app)
    .post(`/api/v1/purchase-requests/${id}/stock-check`)
    .set(users.warehouse.headers)
    .send({ available: false })
    .expect(200);
  return res.body.data as {
    id: string;
    status: string;
    memo: { id: string; steps: { id: string; level: number; status: string }[] };
  };
}

const getPr = async (id: string, headers = users.requester.headers) =>
  (await request(app).get(`/api/v1/purchase-requests/${id}`).set(headers)).body.data;
const approve = (stepId: string, headers: Headers, comment?: string) =>
  request(app)
    .post(`/api/v1/approvals/${stepId}/approve`)
    .set(headers)
    .send(comment ? { comment } : {});
const reject = (stepId: string, headers: Headers, reason: string) =>
  request(app).post(`/api/v1/approvals/${stepId}/reject`).set(headers).send({ reason });

beforeEach(async () => {
  await resetDatabase();
  await seedDefaultApprovalRules();
  divisionId = (await prisma.division.create({ data: { code: 'OPS', name: 'Operasional' } })).id;
  users = {
    requester: await makeUser(['REQUESTER']),
    warehouse: await makeUser(['WAREHOUSE']),
    procurement: await makeUser(['PROCUREMENT']),
    l1: await makeUser(['APPROVER', 'REQUESTER'], 1),
    l2: await makeUser(['APPROVER'], 2),
    l3: await makeUser(['APPROVER'], 3),
  };
});
afterAll(() => prisma.$disconnect());

describe('multi-level approval', () => {
  it('walks a > 50jt PR through levels 1 → 2 → 3 and approves it', async () => {
    const pr = await prInApproval(75_000_000);
    expect(pr.memo.steps.map((s) => [s.level, s.status])).toEqual([
      [1, 'PENDING'],
      [2, 'WAITING'],
      [3, 'WAITING'],
    ]);
    const [s1, s2, s3] = pr.memo.steps;

    // Out of turn / wrong level
    expect((await approve(s2!.id, users.l2.headers)).status).toBe(409);
    expect((await approve(s1!.id, users.l2.headers)).status).toBe(403);

    expect((await approve(s1!.id, users.l1.headers, 'Sesuai kebutuhan')).status).toBe(200);
    expect((await getPr(pr.id)).memo.steps.map((s: { status: string }) => s.status)).toEqual([
      'APPROVED',
      'PENDING',
      'WAITING',
    ]);
    await approve(s2!.id, users.l2.headers).expect(200);
    const last = await approve(s3!.id, users.l3.headers);
    expect(last.body.data).toMatchObject({ status: 'APPROVED', memo: { status: 'APPROVED' } });

    const final = await getPr(pr.id);
    expect(final.status).toBe('APPROVED');
    expect(final.memo.steps[0]).toMatchObject({
      approver: { id: users.l1.id },
      comment: 'Sesuai kebutuhan',
    });

    const kinds = await prisma.notification.findMany({ select: { userId: true, type: true } });
    expect(kinds).toContainEqual({ userId: users.requester.id, type: 'PR_APPROVED' });
    expect(kinds).toContainEqual({ userId: users.procurement.id, type: 'PR_READY_FOR_QUOTATION' });
    expect(kinds.filter((n) => n.type === 'APPROVAL_REQUIRED').map((n) => n.userId)).toEqual(
      expect.arrayContaining([users.l1.id, users.l2.id, users.l3.id]),
    );
  });

  it('needs only level 1 below 10jt', async () => {
    const pr = await prInApproval(9_999_999);
    expect(pr.memo.steps.map((s) => s.level)).toEqual([1]);
    await approve(pr.memo.steps[0]!.id, users.l1.headers).expect(200);
    expect((await getPr(pr.id)).status).toBe('APPROVED');
  });

  it('skips the level of a requester who is an approver themselves', async () => {
    const pr = await prInApproval(20_000_000, users.l1);
    expect(pr.memo.steps.map((s) => [s.level, s.status])).toEqual([
      [1, 'SKIPPED'],
      [2, 'PENDING'],
    ]);
  });

  it('approves immediately when every level is skipped', async () => {
    const pr = await prInApproval(5_000_000, users.l1);
    expect(pr.status).toBe('APPROVED');
    expect(pr.memo.steps).toMatchObject([{ level: 1, status: 'SKIPPED' }]);
  });

  it('rejects with a reason, skipping the remaining levels', async () => {
    const pr = await prInApproval(30_000_000);
    const [s1] = pr.memo.steps;
    expect((await reject(s1!.id, users.l1.headers, '')).status).toBe(400);

    await reject(s1!.id, users.l1.headers, 'Anggaran tidak tersedia').expect(200);
    const final = await getPr(pr.id);
    expect(final.status).toBe('REJECTED');
    expect(final.memo.status).toBe('REJECTED');
    expect(final.memo.steps.map((s: { status: string }) => s.status)).toEqual([
      'REJECTED',
      'SKIPPED',
    ]);
    expect(
      await prisma.notification.count({
        where: { userId: users.requester.id, type: 'PR_REJECTED' },
      }),
    ).toBe(1);

    const history = await request(app)
      .get(`/api/v1/purchase-requests/${pr.id}/history`)
      .set(users.requester.headers);
    expect(history.body.data.at(-1)).toMatchObject({
      toStatus: 'REJECTED',
      note: expect.stringContaining('Anggaran'),
    });
  });

  it('does not let SUPER_ADMIN approve on behalf of a level', async () => {
    const admin = await makeUser(['SUPER_ADMIN']);
    const pr = await prInApproval(1_000_000);
    expect((await approve(pr.memo.steps[0]!.id, admin.headers)).status).toBe(403);
  });

  it('lets only one of two same-level approvers decide', async () => {
    const otherL1 = await makeUser(['APPROVER'], 1);
    const pr = await prInApproval(1_000_000);
    const stepId = pr.memo.steps[0]!.id;
    const results = await Promise.all([
      approve(stepId, users.l1.headers),
      approve(stepId, otherL1.headers),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('cancels the memo when the PR is cancelled during approval', async () => {
    const pr = await prInApproval(30_000_000);
    await request(app)
      .post(`/api/v1/purchase-requests/${pr.id}/cancel`)
      .set(users.requester.headers)
      .send({ reason: 'Tidak jadi' })
      .expect(200);
    const final = await getPr(pr.id);
    expect(final.memo.status).toBe('CANCELLED');
    expect(final.memo.steps.every((s: { status: string }) => s.status === 'SKIPPED')).toBe(true);
    expect(
      (await request(app).get('/api/v1/approvals/pending-count').set(users.l1.headers)).body.data
        .count,
    ).toBe(0);
  });
});

describe('approval inbox', () => {
  it('lists pending steps for my level and my decisions in history', async () => {
    const a = await prInApproval(30_000_000);
    await prInApproval(1_000_000);

    const l1Pending = await request(app).get('/api/v1/approvals').set(users.l1.headers);
    expect(l1Pending.body.meta.total).toBe(2);
    expect(l1Pending.body.data[0]).toMatchObject({
      level: 1,
      memo: { totalLevels: 2 },
      pr: { title: 'PR 30000000' },
    });
    expect(
      (await request(app).get('/api/v1/approvals').set(users.l2.headers)).body.meta.total,
    ).toBe(0);

    await approve(a.memo.steps[0]!.id, users.l1.headers).expect(200);
    expect(
      (await request(app).get('/api/v1/approvals/pending-count').set(users.l1.headers)).body.data
        .count,
    ).toBe(1);
    expect(
      (await request(app).get('/api/v1/approvals/pending-count').set(users.l2.headers)).body.data
        .count,
    ).toBe(1);

    const history = await request(app).get('/api/v1/approvals?tab=history').set(users.l1.headers);
    expect(history.body.data.map((s: { status: string }) => s.status)).toEqual(['APPROVED']);
  });

  it('never shows approvers their own PRs', async () => {
    await prInApproval(30_000_000, users.l1); // L1 skipped, L2 pending
    expect(
      (await request(app).get('/api/v1/approvals').set(users.l1.headers)).body.meta.total,
    ).toBe(0);
  });

  it('returns an empty inbox for non-approvers', async () => {
    await prInApproval(1_000_000);
    const res = await request(app).get('/api/v1/approvals').set(users.requester.headers);
    expect(res.body).toMatchObject({ data: [], meta: { total: 0 } });
  });
});

describe('memos', () => {
  it('restricts the memo list to procurement and approvers', async () => {
    await prInApproval(1_000_000);
    expect((await request(app).get('/api/v1/memos').set(users.requester.headers)).status).toBe(403);
    const list = await request(app).get('/api/v1/memos').set(users.procurement.headers);
    expect(list.body.data[0]).toMatchObject({
      status: 'PENDING',
      currentLevel: 1,
      totalAmount: '1000000.00',
    });
  });

  it('shows the memo and its PDF to the requester, but not to other requesters', async () => {
    const pr = await prInApproval(12_500_000);
    const memo = await request(app).get(`/api/v1/memos/${pr.memo.id}`).set(users.requester.headers);
    expect(memo.body.data).toMatchObject({
      subject: 'Permohonan Pengadaan: PR 12500000',
      items: [{ name: 'Barang uji', qty: 1 }],
      steps: [{ level: 1 }, { level: 2 }],
    });
    expect(memo.body.data.body).toContain('Rp 12.500.000');

    const pdf = await request(app)
      .get(`/api/v1/memos/${pr.memo.id}/pdf`)
      .set(users.requester.headers)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toMatch(
      /inline; filename="MEMO-IT-\d{4}-\d{2}-0001\.pdf"/,
    );
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const stranger = await makeUser(['REQUESTER']);
    expect(
      (await request(app).get(`/api/v1/memos/${pr.memo.id}`).set(stranger.headers)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/memos/${pr.memo.id}/pdf`).set(stranger.headers)).status,
    ).toBe(404);
  });
});

describe('notifications', () => {
  it('lists, counts and marks notifications per user', async () => {
    await prInApproval(1_000_000);
    const h = users.l1.headers;
    expect(
      (await request(app).get('/api/v1/notifications/unread-count').set(h)).body.data.count,
    ).toBe(1);

    const list = await request(app).get('/api/v1/notifications').set(h);
    expect(list.body.data[0]).toMatchObject({
      type: 'APPROVAL_REQUIRED',
      isRead: false,
      link: expect.stringMatching(/^\/pengajuan\//),
    });

    // Someone else cannot mark it.
    expect(
      (
        await request(app)
          .post(`/api/v1/notifications/${list.body.data[0].id}/read`)
          .set(users.l2.headers)
      ).status,
    ).toBe(404);
    await request(app)
      .post(`/api/v1/notifications/${list.body.data[0].id}/read`)
      .set(h)
      .expect(200);
    expect(
      (await request(app).get('/api/v1/notifications/unread-count').set(h)).body.data.count,
    ).toBe(0);

    // Warehouse got stock-check notifications on submit.
    const wh = users.warehouse.headers;
    expect(
      (await request(app).get('/api/v1/notifications/unread-count').set(wh)).body.data.count,
    ).toBe(1);
    expect(
      (await request(app).post('/api/v1/notifications/read-all').set(wh)).body.data.updated,
    ).toBe(1);
  });
});
