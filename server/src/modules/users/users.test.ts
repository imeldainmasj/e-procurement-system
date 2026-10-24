import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createAdmin,
  createTestUser,
  ensureRoles,
  resetDatabase,
} from '../../test/db.js';

const app = createApp();
const validUser = {
  name: 'Sari Kusuma',
  email: 'sari@test.local',
  nip: '1234',
  roles: ['APPROVER', 'REQUESTER'],
  approvalLevel: 2,
  password: 'Rahasia123',
};

beforeEach(async () => {
  await resetDatabase();
  await ensureRoles();
});
afterAll(() => prisma.$disconnect());

describe('users API', () => {
  it('is restricted to SUPER_ADMIN', async () => {
    const user = await createTestUser({ roles: ['PROCUREMENT'] });
    const res = await request(app)
      .get('/api/v1/users')
      .set(authHeader(user, ['PROCUREMENT']));
    expect(res.status).toBe(403);
  });

  it('creates a user with roles, never exposing the password hash, and writes an audit log', async () => {
    const { admin, headers } = await createAdmin();
    const res = await request(app).post('/api/v1/users').set(headers).send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'sari@test.local',
      approvalLevel: 2,
      isActive: true,
    });
    expect(res.body.data.roles.sort()).toEqual(['APPROVER', 'REQUESTER']);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const log = await prisma.auditLog.findFirst({
      where: { entity: 'User', entityId: res.body.data.id },
    });
    expect(log).toMatchObject({ action: 'CREATE', userId: admin.id });
    expect(JSON.stringify(log?.after)).not.toMatch(/password/i);
  });

  it('rejects an approver without a level and a duplicate email', async () => {
    const { headers } = await createAdmin();
    const noLevel = await request(app)
      .post('/api/v1/users')
      .set(headers)
      .send({ ...validUser, approvalLevel: null });
    expect(noLevel.status).toBe(400);
    expect(noLevel.body.error.details[0].path).toBe('approvalLevel');

    await request(app).post('/api/v1/users').set(headers).send(validUser);
    const dup = await request(app)
      .post('/api/v1/users')
      .set(headers)
      .send({ ...validUser, nip: '999', email: 'SARI@test.local' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('sari@test.local');
  });

  it('lists with search, role filter and pagination meta', async () => {
    const { headers } = await createAdmin();
    await createTestUser({ name: 'Budi Gudang', roles: ['WAREHOUSE'] });
    await createTestUser({ name: 'Budi Pengadaan', roles: ['PROCUREMENT'] });
    await createTestUser({ name: 'Citra', roles: ['WAREHOUSE'] });

    const res = await request(app)
      .get('/api/v1/users?search=budi&role=WAREHOUSE&limit=10&sort=name:asc')
      .set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { name: string }) => u.name)).toEqual(['Budi Gudang']);
    expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  it('prevents admins from deactivating or deleting themselves', async () => {
    const { admin, headers } = await createAdmin();
    const self = await request(app)
      .put(`/api/v1/users/${admin.id}`)
      .set(headers)
      .send({ name: 'Admin', email: admin.email, roles: ['SUPER_ADMIN'], isActive: false });
    expect(self.status).toBe(400);

    const dropRole = await request(app)
      .put(`/api/v1/users/${admin.id}`)
      .set(headers)
      .send({ name: 'Admin', email: admin.email, roles: ['VIEWER'], isActive: true });
    expect(dropRole.status).toBe(400);

    expect((await request(app).delete(`/api/v1/users/${admin.id}`).set(headers)).status).toBe(400);
  });

  it('revokes sessions when a user is deactivated or their password is reset', async () => {
    const { headers } = await createAdmin();
    const user = await createTestUser({ email: 'target@test.local' });
    const login = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'target@test.local', password: 'Password123!' });

    await login();
    await request(app)
      .post(`/api/v1/users/${user.id}/reset-password`)
      .set(headers)
      .send({ password: 'Baru12345' });
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      0,
    );
    expect((await login()).status).toBe(401);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'target@test.local', password: 'Baru12345' });
    const res = await request(app)
      .put(`/api/v1/users/${user.id}`)
      .set(headers)
      .send({ name: 'Target', email: 'target@test.local', roles: ['REQUESTER'], isActive: false });
    expect(res.status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      0,
    );
  });

  it('soft-deletes users and clears division headship', async () => {
    const { headers } = await createAdmin();
    const user = await createTestUser();
    await prisma.division.create({ data: { code: 'IT', name: 'IT', headUserId: user.id } });

    expect((await request(app).delete(`/api/v1/users/${user.id}`).set(headers)).status).toBe(200);
    expect((await request(app).get(`/api/v1/users/${user.id}`).set(headers)).status).toBe(404);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      isActive: false,
    });
    expect((await prisma.division.findUnique({ where: { code: 'IT' } }))?.headUserId).toBeNull();
  });
});
