import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Role } from '@sipita/shared';
import { signAccessToken } from '../lib/jwt.js';
import { authenticate } from './auth.js';
import { errorHandler } from './errorHandler.js';
import { requireRole } from './rbac.js';

const app = express();
app.get('/procurement', authenticate, requireRole('PROCUREMENT', 'VIEWER'), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

const tokenFor = (roles: Role[]) =>
  signAccessToken({ sub: crypto.randomUUID(), roles, approvalLevel: null });

describe('requireRole', () => {
  it.each<[Role[], number]>([
    [['PROCUREMENT'], 200],
    [['VIEWER', 'REQUESTER'], 200],
    [['SUPER_ADMIN'], 200],
    [['REQUESTER'], 403],
    [['WAREHOUSE', 'APPROVER'], 403],
  ])('roles %j → %i', async (roles, status) => {
    const res = await request(app)
      .get('/procurement')
      .set('Authorization', `Bearer ${tokenFor(roles)}`);
    expect(res.status).toBe(status);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/procurement');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
