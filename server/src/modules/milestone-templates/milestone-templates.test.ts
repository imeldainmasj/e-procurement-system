import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import {
  authHeader,
  createAdmin,
  createTestUser,
  resetDatabase,
  seedMilestoneTemplates,
} from '../../test/db.js';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  await seedMilestoneTemplates();
});
afterAll(() => prisma.$disconnect());

const plTemplate = [
  { type: 'MEMO', sequence: 1, executor: 'IT', prerequisites: [] },
  { type: 'OFFICIAL_APPROVAL', sequence: 2, executor: 'OFFICIAL', prerequisites: ['MEMO'] },
  { type: 'MOA_METHOD', sequence: 3, executor: 'IT', prerequisites: ['OFFICIAL_APPROVAL'] },
  { type: 'MOA_COST', sequence: 3, executor: 'IT', prerequisites: ['OFFICIAL_APPROVAL'] },
  { type: 'PO', sequence: 4, executor: 'IT', prerequisites: ['MOA_METHOD', 'MOA_COST'] },
  { type: 'AGREEMENT', sequence: 5, executor: 'IT', prerequisites: ['PO'] },
];

describe('milestone templates API', () => {
  it('is readable by everyone and editable by admins only', async () => {
    const headers = authHeader(await createTestUser({ jobLevel: 'MANAGER_L2' }));
    const list = await request(app).get('/api/v1/milestone-templates').set(headers);
    expect(list.body.data).toHaveLength(30);

    const put = await request(app)
      .put('/api/v1/milestone-templates/DIRECT_APPOINTMENT')
      .set(headers)
      .send({ items: plTemplate });
    expect(put.status).toBe(403);
  });

  it('replaces one method without touching existing works', async () => {
    const { headers } = await createAdmin();
    const res = await request(app)
      .put('/api/v1/milestone-templates/DIRECT_APPOINTMENT')
      .set(headers)
      .send({ items: plTemplate });
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { type: string }) => t.type)).not.toContain('PVP');
    expect(await prisma.milestoneTemplate.count({ where: { method: 'TENDER' } })).toBe(8);
  });

  it('rejects prerequisites that are missing or not earlier', async () => {
    const { headers } = await createAdmin();
    const bad = plTemplate.map((t) => (t.type === 'MEMO' ? { ...t, prerequisites: ['PO'] } : t));
    const res = await request(app)
      .put('/api/v1/milestone-templates/DIRECT_APPOINTMENT')
      .set(headers)
      .send({ items: bad });
    expect(res.status).toBe(400);

    const missing = [
      ...plTemplate,
      { type: 'LOA', sequence: 6, executor: 'OTHER_TEAM', prerequisites: ['RFQ'] },
    ];
    const res2 = await request(app)
      .put('/api/v1/milestone-templates/DIRECT_APPOINTMENT')
      .set(headers)
      .send({ items: missing });
    expect(res2.status).toBe(400);
  });
});
