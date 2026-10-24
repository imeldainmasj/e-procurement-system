import request from 'supertest';
import { FEATURES, FULL_PERMISSION, NO_PERMISSION } from '@sipita/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createAdmin, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();
const fullPermissions = Object.fromEntries(FEATURES.map((f) => [f, FULL_PERMISSION]));
const validUser = {
  employeeId: '19900101',
  username: 'sari.kusuma',
  name: 'Sari Kusuma',
  email: 'sari@test.local',
  jobLevel: 'STAFF',
  password: 'Rahasia123',
  permissions: { ...fullPermissions, IMPORT: NO_PERMISSION },
};

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('users API', () => {
  it('is restricted to admins, except the picker options', async () => {
    const manager = await createTestUser({ jobLevel: 'MANAGER_L2' });
    const headers = authHeader(manager);
    expect((await request(app).get('/api/v1/users').set(headers)).status).toBe(403);

    const options = await request(app).get('/api/v1/users/options').set(headers);
    expect(options.status).toBe(200);
    expect(options.body.data[0]).toEqual({
      id: manager.id,
      name: manager.name,
      username: manager.username,
      jobLevel: 'MANAGER_L2',
    });
  });

  it('creates a user with permissions, never exposing the password hash, and writes an audit log', async () => {
    const { admin, headers } = await createAdmin();
    const res = await request(app).post('/api/v1/users').set(headers).send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      username: 'sari.kusuma',
      jobLevel: 'STAFF',
      isAdmin: false,
      isActive: true,
    });
    expect(res.body.data.permissions.IMPORT).toEqual(NO_PERMISSION);
    expect(res.body.data.permissions.WORK).toEqual(FULL_PERMISSION);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(await prisma.userPermission.count({ where: { userId: res.body.data.id } })).toBe(
      FEATURES.length,
    );

    const log = await prisma.auditLog.findFirst({
      where: { entity: 'User', entityId: res.body.data.id },
    });
    expect(log).toMatchObject({ action: 'CREATE', userId: admin.id });
    expect(JSON.stringify(log?.after)).not.toMatch(/password/i);
  });

  it('rejects duplicate username, email and employee id', async () => {
    const { headers } = await createAdmin();
    await request(app).post('/api/v1/users').set(headers).send(validUser);

    for (const field of ['username', 'email', 'employeeId'] as const) {
      const other = {
        ...validUser,
        username: 'lain',
        email: 'lain@test.local',
        employeeId: '999',
        [field]: validUser[field],
      };
      const res = await request(app).post('/api/v1/users').set(headers).send(other);
      expect(res.status, field).toBe(409);
    }
  });

  it('applies permission changes on the next request', async () => {
    const { headers } = await createAdmin();
    const staff = await createTestUser();
    const staffHeaders = authHeader(staff);
    expect((await request(app).get('/api/v1/vendors').set(staffHeaders)).status).toBe(200);

    const current = (await request(app).get(`/api/v1/users/${staff.id}`).set(headers)).body.data;
    const res = await request(app)
      .put(`/api/v1/users/${staff.id}`)
      .set(headers)
      .send({
        ...current,
        departmentId: null,
        permissions: { ...current.permissions, VENDOR: NO_PERMISSION },
      });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/v1/vendors').set(staffHeaders)).status).toBe(403);
  });

  it('prevents admins from locking themselves out', async () => {
    const { admin, headers } = await createAdmin();
    const current = (await request(app).get(`/api/v1/users/${admin.id}`).set(headers)).body.data;

    const demote = await request(app)
      .put(`/api/v1/users/${admin.id}`)
      .set(headers)
      .send({ ...current, isAdmin: false });
    expect(demote.status).toBe(400);

    const remove = await request(app).delete(`/api/v1/users/${admin.id}`).set(headers);
    expect(remove.status).toBe(400);
  });

  it('deactivation revokes refresh tokens', async () => {
    const { headers } = await createAdmin();
    const user = await createTestUser();
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: 'x', expiresAt: new Date(Date.now() + 60_000) },
    });
    const current = (await request(app).get(`/api/v1/users/${user.id}`).set(headers)).body.data;

    await request(app)
      .put(`/api/v1/users/${user.id}`)
      .set(headers)
      .send({ ...current, isActive: false });

    const token = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
    expect(token?.revokedAt).not.toBeNull();
  });
});
