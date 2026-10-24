import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();
const vendor = {
  code: 'v001',
  name: 'PT Solusi Lisensi Nusantara',
  address: 'Jl. Gatot Subroto Kav. 12, Jakarta Selatan',
  picName: 'Rina Kartika',
  npwp: '0012345678901001',
};

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('vendors API', () => {
  it('creates, reads and audits a vendor', async () => {
    const staff = await createTestUser();
    const headers = authHeader(staff);

    const res = await request(app).post('/api/v1/vendors').set(headers).send(vendor);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: 'V001', workCount: 0, agreementCount: 0 });

    const list = await request(app).get('/api/v1/vendors?search=nusantara').set(headers);
    expect(list.body.meta.total).toBe(1);

    const log = await prisma.auditLog.findFirst({ where: { entity: 'Vendor' } });
    expect(log).toMatchObject({ action: 'CREATE', userId: staff.id, source: 'APP' });
  });

  it('follows the VENDOR permission flags', async () => {
    const readOnly = await createTestUser({
      permissions: { VENDOR: { create: false, update: false, delete: false } },
    });
    const headers = authHeader(readOnly);
    expect((await request(app).get('/api/v1/vendors').set(headers)).status).toBe(200);
    expect((await request(app).post('/api/v1/vendors').set(headers).send(vendor)).status).toBe(403);

    const noView = await createTestUser({ permissions: { VENDOR: { view: false } } });
    expect((await request(app).get('/api/v1/vendors').set(authHeader(noView))).status).toBe(403);
  });

  it('rejects a duplicate code or NPWP, including soft-deleted vendors', async () => {
    const headers = authHeader(await createTestUser());
    const { body } = await request(app).post('/api/v1/vendors').set(headers).send(vendor);
    await request(app).delete(`/api/v1/vendors/${body.data.id}`).set(headers);

    const sameCode = await request(app)
      .post('/api/v1/vendors')
      .set(headers)
      .send({ ...vendor, npwp: null });
    expect(sameCode.status).toBe(409);

    const sameNpwp = await request(app)
      .post('/api/v1/vendors')
      .set(headers)
      .send({ ...vendor, code: 'V002' });
    expect(sameNpwp.status).toBe(409);
  });

  it('keeps vendors that appear in works', async () => {
    const staff = await createTestUser();
    const headers = authHeader(staff);
    const { body } = await request(app).post('/api/v1/vendors').set(headers).send(vendor);
    await prisma.work.create({
      data: {
        code: 'WRK-2026-0001',
        title: 'Renewal Microsoft 365',
        procurementType: 'RENEWAL_LICENSE',
        category: 'BAU',
        method: 'TENDER',
        procurementYear: 2026,
        picId: staff.id,
        vendorId: body.data.id,
        amount: 1,
        amountIdr: 1,
      },
    });

    const res = await request(app).delete(`/api/v1/vendors/${body.data.id}`).set(headers);
    expect(res.status).toBe(409);
  });
});
