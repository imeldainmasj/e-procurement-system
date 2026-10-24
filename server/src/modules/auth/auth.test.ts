import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createTestUser, resetDatabase, TEST_PASSWORD } from '../../test/db.js';
import { REFRESH_COOKIE } from './auth.controller.js';
import { REFRESH_REUSE_GRACE_MS } from './auth.service.js';

const app = createApp();

function getRefreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error('refresh cookie not set');
  return cookie.split(';')[0]!;
}

async function login(email: string, password = TEST_PASSWORD) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('POST /auth/login', () => {
  it('returns an access token, the user, and an httpOnly refresh cookie', async () => {
    await createTestUser({ email: 'rina@test.local', roles: ['REQUESTER', 'WAREHOUSE'] });

    const res = await login('RINA@test.local ');

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: 'rina@test.local' });
    expect(res.body.data.user.roles.sort()).toEqual(['REQUESTER', 'WAREHOUSE']);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/v1/auth');
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await createTestUser({ email: 'rina@test.local' });

    const wrong = await login('rina@test.local', 'salah');
    const unknown = await login('nobody@test.local');

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an inactive user', async () => {
    await createTestUser({ email: 'off@test.local', isActive: false });
    const res = await login('off@test.local');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('validates the payload', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'bukan-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /auth/me', () => {
  it('returns the current user with a valid token', async () => {
    await createTestUser({ email: 'me@test.local', roles: ['APPROVER'], approvalLevel: 2 });
    const { body } = await login('me@test.local');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      email: 'me@test.local',
      roles: ['APPROVER'],
      approvalLevel: 2,
    });
  });

  it('requires a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and rejects the old one', async () => {
    await createTestUser({ email: 'r@test.local' });
    const cookie1 = getRefreshCookie(await login('r@test.local'));

    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toEqual(expect.any(String));
    const cookie2 = getRefreshCookie(first);
    expect(cookie2).not.toBe(cookie1);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(replay.status).toBe(401);

    // A replay inside the grace window does not end the new session.
    const second = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie2);
    expect(second.status).toBe(200);
  });

  it('revokes every session when a long-revoked token is replayed', async () => {
    const user = await createTestUser({ email: 'theft@test.local' });
    const cookie1 = getRefreshCookie(await login('theft@test.local'));
    const cookie2 = getRefreshCookie(
      await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1),
    );

    // Pretend the first token was rotated long ago.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) },
    });

    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1)).status).toBe(
      401,
    );
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie2)).status).toBe(
      401,
    );
  });

  it('fails without a cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    await createTestUser({ email: 'out@test.local' });
    const cookie = getRefreshCookie(await login('out@test.local'));

    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';')).toContain(
      `${REFRESH_COOKIE}=;`,
    );

    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});
