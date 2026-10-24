import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createAdmin, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('divisions API', () => {
  it('lets any signed-in user read but only SUPER_ADMIN write', async () => {
    const requester = await createTestUser({ roles: ['REQUESTER'] });
    const headers = authHeader(requester, ['REQUESTER']);
    expect((await request(app).get('/api/v1/divisions').set(headers)).status).toBe(200);
    expect(
      (await request(app).post('/api/v1/divisions').set(headers).send({ code: 'IT', name: 'IT' }))
        .status,
    ).toBe(403);
  });

  it('creates with an uppercased code and rejects duplicates', async () => {
    const { headers } = await createAdmin();
    const res = await request(app)
      .post('/api/v1/divisions')
      .set(headers)
      .send({ code: 'fin', name: 'Keuangan' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: 'FIN', userCount: 0, headUser: null });

    const dup = await request(app)
      .post('/api/v1/divisions')
      .set(headers)
      .send({ code: 'FIN', name: 'Lain' });
    expect(dup.status).toBe(409);
  });

  it('allows one user to head only one division', async () => {
    const { headers } = await createAdmin();
    const head = await createTestUser();
    await request(app)
      .post('/api/v1/divisions')
      .set(headers)
      .send({ code: 'A', name: 'A', headUserId: head.id });
    const res = await request(app)
      .post('/api/v1/divisions')
      .set(headers)
      .send({ code: 'B', name: 'B', headUserId: head.id });
    expect(res.status).toBe(409);
  });

  it('refuses to delete a division that still has users, then soft-deletes it', async () => {
    const { headers } = await createAdmin();
    const division = await prisma.division.create({ data: { code: 'OPS', name: 'Operasional' } });
    const member = await createTestUser();
    await prisma.user.update({ where: { id: member.id }, data: { divisionId: division.id } });

    const blocked = await request(app).delete(`/api/v1/divisions/${division.id}`).set(headers);
    expect(blocked.status).toBe(409);

    await prisma.user.update({ where: { id: member.id }, data: { divisionId: null } });
    expect(
      (await request(app).delete(`/api/v1/divisions/${division.id}`).set(headers)).status,
    ).toBe(200);

    const list = await request(app).get('/api/v1/divisions').set(headers);
    expect(list.body.meta.total).toBe(0);
    expect(await prisma.division.findUnique({ where: { id: division.id } })).not.toBeNull();
  });
});
