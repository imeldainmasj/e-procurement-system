import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createAdmin, createTestUser, resetDatabase } from '../../test/db.js';

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setupCatalog() {
  const hardware = await prisma.itemCategory.create({ data: { code: 'HW', name: 'Hardware' } });
  const license = await prisma.itemCategory.create({ data: { code: 'LIC', name: 'Lisensi' } });
  await prisma.item.createMany({
    data: [
      { code: 'LPT-01', name: 'Laptop', categoryId: hardware.id, unit: 'unit', isAsset: true },
      { code: 'MON-01', name: 'Monitor', categoryId: hardware.id, unit: 'unit', isAsset: true },
      { code: 'M365', name: 'Microsoft 365', categoryId: license.id, unit: 'user/tahun' },
    ],
  });
  return { hardware, license };
}

describe('items API', () => {
  it('filters by category and asset flag, and sorts by category name', async () => {
    const { headers } = await createAdmin();
    const { hardware } = await setupCatalog();

    const byCategory = await request(app)
      .get(`/api/v1/items?categoryId=${hardware.id}`)
      .set(headers);
    expect(byCategory.body.meta.total).toBe(2);

    const consumables = await request(app).get('/api/v1/items?isAsset=false').set(headers);
    expect(consumables.body.data.map((i: { code: string }) => i.code)).toEqual(['M365']);

    const sorted = await request(app).get('/api/v1/items?sort=category.name:desc').set(headers);
    expect(sorted.body.data[0].category.name).toBe('Lisensi');
  });

  it('rejects an unsupported sort field', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .get('/api/v1/items?sort=deletedAt:asc')
      .set(authHeader(user, ['REQUESTER']));
    expect(res.status).toBe(400);
  });

  it('creates an item with specs and validates the category', async () => {
    const { headers } = await createAdmin();
    const { hardware } = await setupCatalog();
    const payload = {
      code: 'sw-24',
      name: 'Switch 24 Port',
      categoryId: hardware.id,
      unit: 'unit',
      isAsset: true,
      minStock: 2,
      specs: { Port: '24' },
    };

    const res = await request(app).post('/api/v1/items').set(headers).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      code: 'SW-24',
      specs: { Port: '24' },
      category: { code: 'HW' },
    });

    const bad = await request(app)
      .post('/api/v1/items')
      .set(headers)
      .send({ ...payload, code: 'X', categoryId: crypto.randomUUID() });
    expect(bad.status).toBe(400);
  });

  it('soft-deletes items and blocks deleting a category that is still in use', async () => {
    const { headers } = await createAdmin();
    const { license } = await setupCatalog();

    expect(
      (await request(app).delete(`/api/v1/item-categories/${license.id}`).set(headers)).status,
    ).toBe(409);

    const m365 = await prisma.item.findUniqueOrThrow({ where: { code: 'M365' } });
    expect((await request(app).delete(`/api/v1/items/${m365.id}`).set(headers)).status).toBe(200);
    expect((await request(app).get(`/api/v1/items/${m365.id}`).set(headers)).status).toBe(404);

    expect(
      (await request(app).delete(`/api/v1/item-categories/${license.id}`).set(headers)).status,
    ).toBe(200);
  });
});

describe('warehouses API', () => {
  it('creates, rejects duplicate codes, and filters by active status', async () => {
    const { headers } = await createAdmin();
    const created = await request(app)
      .post('/api/v1/warehouses')
      .set(headers)
      .send({ code: 'wh-1', name: 'Gudang Utama', location: '' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code: 'WH-1', location: null, isActive: true });

    expect(
      (await request(app).post('/api/v1/warehouses').set(headers).send({ code: 'WH-1', name: 'X' }))
        .status,
    ).toBe(409);

    await request(app)
      .post('/api/v1/warehouses')
      .set(headers)
      .send({ code: 'WH-2', name: 'Lama', isActive: false });
    const active = await request(app).get('/api/v1/warehouses?isActive=true').set(headers);
    expect(active.body.data.map((w: { code: string }) => w.code)).toEqual(['WH-1']);
  });
});
