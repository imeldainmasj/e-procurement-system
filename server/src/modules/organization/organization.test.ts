import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createAdmin, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('organization API', () => {
  it('lets any signed-in user read but only admins write', async () => {
    const headers = authHeader(await createTestUser({ jobLevel: 'MANAGER_L2' }));
    expect((await request(app).get('/api/v1/directorates').set(headers)).status).toBe(200);
    const res = await request(app)
      .post('/api/v1/directorates')
      .set(headers)
      .send({ code: 'DIR-OPS', name: 'Operasional' });
    expect(res.status).toBe(403);
  });

  it('builds the directorate → division → department chain', async () => {
    const { headers } = await createAdmin();
    const dir = await request(app)
      .post('/api/v1/directorates')
      .set(headers)
      .send({ code: 'dir-ops', name: 'Direktorat Operasional' });
    expect(dir.status).toBe(201);
    expect(dir.body.data.code).toBe('DIR-OPS');

    const div = await request(app)
      .post('/api/v1/divisions')
      .set(headers)
      .send({ code: 'DIV-IT', name: 'Divisi IT', directorateId: dir.body.data.id });
    const dept = await request(app)
      .post('/api/v1/departments')
      .set(headers)
      .send({ code: 'IT-SAPM', name: 'IT SAPM', divisionId: div.body.data.id });
    expect(dept.status).toBe(201);
    expect(dept.body.data).toMatchObject({
      division: { code: 'DIV-IT' },
      directorate: { code: 'DIR-OPS' },
      userCount: 0,
    });

    const filtered = await request(app)
      .get(`/api/v1/divisions?directorateId=${dir.body.data.id}`)
      .set(headers);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].departmentCount).toBe(1);
  });

  it('refuses to delete a unit that still has active children', async () => {
    const { headers } = await createAdmin();
    const dir = await prisma.directorate.create({ data: { code: 'DIR-A', name: 'A' } });
    const div = await prisma.division.create({
      data: { code: 'DIV-A', name: 'A', directorateId: dir.id },
    });
    const dept = await prisma.department.create({
      data: { code: 'DEP-A', name: 'A', divisionId: div.id },
    });
    await createTestUser({ departmentId: dept.id });

    expect((await request(app).delete(`/api/v1/directorates/${dir.id}`).set(headers)).status).toBe(
      400,
    );
    expect((await request(app).delete(`/api/v1/departments/${dept.id}`).set(headers)).status).toBe(
      400,
    );
  });

  it('keeps codes reserved after a soft delete', async () => {
    const { headers } = await createAdmin();
    const { body } = await request(app)
      .post('/api/v1/directorates')
      .set(headers)
      .send({ code: 'DIR-X', name: 'X' });
    await request(app).delete(`/api/v1/directorates/${body.data.id}`).set(headers);
    const again = await request(app)
      .post('/api/v1/directorates')
      .set(headers)
      .send({ code: 'DIR-X', name: 'X' });
    expect(again.status).toBe(409);
  });
});
