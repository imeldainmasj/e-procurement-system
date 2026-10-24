import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createAdmin, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();

const defaults = [
  { name: '< 10jt', minAmount: 0, maxAmount: 10_000_000, levels: [1] },
  {
    name: '10–50jt',
    minAmount: 10_000_000,
    maxAmount: 50_000_000,
    maxInclusive: true,
    levels: [1, 2],
  },
  {
    name: '> 50jt',
    minAmount: 50_000_000,
    minInclusive: false,
    maxAmount: null,
    levels: [1, 2, 3],
  },
];

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('approval rules API', () => {
  it('creates the default tiers with no coverage warnings', async () => {
    const { headers } = await createAdmin();
    for (const rule of defaults) {
      expect(
        (await request(app).post('/api/v1/approval-rules').set(headers).send(rule)).status,
      ).toBe(201);
    }
    const res = await request(app).get('/api/v1/approval-rules').set(headers);
    expect(res.body.data.rules).toHaveLength(3);
    expect(res.body.data.rules[1]).toMatchObject({
      minAmount: '10000000.00',
      maxAmount: '50000000.00',
    });
    expect(res.body.data.warnings).toEqual([]);
  });

  it('rejects an overlapping active rule but accepts it inactive', async () => {
    const { headers } = await createAdmin();
    await request(app).post('/api/v1/approval-rules').set(headers).send(defaults[1]);

    const overlap = { name: 'Bentrok', minAmount: 50_000_000, maxAmount: null, levels: [1, 2, 3] };
    const res = await request(app).post('/api/v1/approval-rules').set(headers).send(overlap);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('10–50jt');

    const inactive = await request(app)
      .post('/api/v1/approval-rules')
      .set(headers)
      .send({ ...overlap, isActive: false });
    expect(inactive.status).toBe(201);
  });

  it('reports coverage gaps', async () => {
    const { headers } = await createAdmin();
    await request(app).post('/api/v1/approval-rules').set(headers).send(defaults[0]);
    const res = await request(app).get('/api/v1/approval-rules').set(headers);
    expect(res.body.data.warnings).toEqual([
      'Nilai pengajuan ≥ Rp 10.000.000 belum tercakup aturan approval aktif.',
    ]);
  });

  it('resolves approval levels for an amount', async () => {
    const { headers } = await createAdmin();
    for (const rule of defaults)
      await request(app).post('/api/v1/approval-rules').set(headers).send(rule);

    const requester = await createTestUser();
    const resolve = (amount: number) =>
      request(app)
        .get(`/api/v1/approval-rules/resolve?amount=${amount}`)
        .set(authHeader(requester, ['REQUESTER']));

    expect((await resolve(9_999_999)).body.data.levels).toEqual([1]);
    expect((await resolve(50_000_000)).body.data.levels).toEqual([1, 2]);
    expect((await resolve(50_000_001)).body.data.levels).toEqual([1, 2, 3]);
  });

  it('returns APPROVAL_RULE_NOT_FOUND when nothing matches', async () => {
    const { headers } = await createAdmin();
    const res = await request(app).get('/api/v1/approval-rules/resolve?amount=5').set(headers);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('APPROVAL_RULE_NOT_FOUND');
  });

  it('only lets SUPER_ADMIN modify rules', async () => {
    const approver = await createTestUser({ roles: ['APPROVER'], approvalLevel: 1 });
    const res = await request(app)
      .post('/api/v1/approval-rules')
      .set(authHeader(approver, ['APPROVER']))
      .send(defaults[0]);
    expect(res.status).toBe(403);
  });
});
